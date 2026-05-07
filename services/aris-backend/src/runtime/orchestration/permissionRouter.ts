/**
 * PermissionRouter — provider-agnostic permission orchestration.
 *
 * Owns the runtime side of the permission protocol that was previously
 * tangled inside `HappyRuntimeStore` in `runtime/happyClient.ts`:
 *
 *   - In-memory mirror of permission records (`permissions` Map).
 *   - Provider-agnostic awaiter machinery (`providerPermissionWaiters`,
 *     `providerPermissionDecisions`, `providerPermissionIndex`).
 *   - Codex-specific responder dispatch (`codexPermissionIndex`,
 *     `codexPermissionResponders`). These are scheduled to migrate to
 *     `runtime/providers/codex/` in Phase 3 of the provider-architecture
 *     refactor; for now the router exposes typed accessors so the codex
 *     code in happyClient.ts can keep working without reaching into router
 *     internals.
 *
 * Storage delegation is performed through the optional
 * `RuntimeCoordinationStore` (PrismaRuntimeStore in production). When the
 * coordination store is null the router operates fully in-memory, which is
 * the path used by mock backends in unit tests.
 *
 * The router does NOT own:
 *   - `appendAgentMessage` / `appendRunLifecycleEvent` (callbacks injected
 *     by the host so the router doesn't need to know about message
 *     persistence or lifecycle wiring).
 *   - `getSession` / `resolveApprovalPolicy` / `abortSessionRuns` (host
 *     callbacks that touch shared session state owned by the runtime core).
 */

import type {
  PermissionDecision,
  PermissionRequest,
  PermissionState,
  ApprovalPolicy,
  RuntimeSession,
} from '../../types.js';
import { randomUUID } from 'node:crypto';
import type { ProviderPermissionRequest } from '../contracts/providerRuntime.js';
import type {
  HappyRuntimePermissionInput,
  RuntimeCoordinationStore,
} from '../contracts/runtimeCoordinationStore.js';

/**
 * Build a permission key scoped to a chat slot. Verbatim port of the helper
 * that lived in happyClient.ts (`${chatId}:${baseKey}` format) so existing
 * collision behavior is preserved byte-for-byte.
 */
export function buildScopedPermissionKey(baseKey: string, chatId?: string): string {
  const normalizedChatId = typeof chatId === 'string' && chatId.trim().length > 0
    ? chatId.trim()
    : '__default__';
  return `${normalizedChatId}:${baseKey}`;
}

/**
 * Host-side callbacks the router needs to interact with surrounding runtime
 * state without reaching into its owner.
 */
export interface PermissionRouterDeps {
  coordinationStore: RuntimeCoordinationStore | null;
  /** Resolves an ARIS session by id; null when session does not exist. */
  getSession(sessionId: string): Promise<RuntimeSession | null>;
  /** Resolves the approval policy in effect for a session at decision time. */
  resolveApprovalPolicy(session: RuntimeSession): ApprovalPolicy;
  /** Aborts in-flight runs scoped to a session (and optionally a chat). */
  abortSessionRuns(sessionId: string, chatId?: string): void;
  /** Persists a permission event as a message stream entry (best-effort). */
  appendAgentMessage(
    sessionId: string,
    text: string,
    meta: Record<string, unknown>,
    options: { type?: string; title?: string },
  ): Promise<void>;
  /** Records a lifecycle event for the run (waiting_for_approval, etc). */
  appendRunLifecycleEvent(
    sessionId: string,
    state: 'waiting_for_approval',
    meta: Record<string, unknown>,
  ): Promise<void>;
}

interface ProviderPermissionWaiter {
  resolve: (decision: PermissionDecision) => void;
  reject: (error: Error) => void;
}

export class PermissionRouter {
  /** Local mirror of every permission record observed in the current process. */
  private readonly permissions = new Map<string, PermissionRequest>();

  /** Codex permission key (sessionId+callId scope) -> permission id. */
  private readonly codexPermissionIndex = new Map<string, string>();

  /** Codex permission id -> responder callback that ships decision to codex CLI. */
  private readonly codexPermissionResponders = new Map<
    string,
    (decision: PermissionDecision) => Promise<void>
  >();

  /** Provider-agnostic key -> permission id. */
  private readonly providerPermissionIndex = new Map<string, string>();

  /** Pending awaiters keyed by permission id; resolved on decidePermission. */
  private readonly providerPermissionWaiters = new Map<string, ProviderPermissionWaiter>();

  /** Cached decisions to short-circuit late awaiters. */
  private readonly providerPermissionDecisions = new Map<string, PermissionDecision>();

  constructor(private readonly deps: PermissionRouterDeps) {}

  // ---------------------------------------------------------------------
  // Storage delegation surface (mirrors RuntimeCoordinationStore)
  // ---------------------------------------------------------------------

  async listPermissions(state?: PermissionState): Promise<PermissionRequest[]> {
    if (this.deps.coordinationStore) {
      const persisted = await this.deps.coordinationStore.listPermissions(state);
      for (const permission of persisted) {
        this.permissions.set(permission.id, permission);
      }
      return persisted;
    }
    const list = [...this.permissions.values()].sort((a, b) =>
      b.requestedAt.localeCompare(a.requestedAt),
    );
    return state ? list.filter((permission) => permission.state === state) : list;
  }

  async createPermission(input: HappyRuntimePermissionInput): Promise<PermissionRequest> {
    const session = await this.deps.getSession(input.sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }

    const permission = this.deps.coordinationStore
      ? await this.deps.coordinationStore.createPermission(input)
      : ({
        id: randomUUID(),
        sessionId: input.sessionId,
        ...(typeof input.chatId === 'string' && input.chatId.trim().length > 0
          ? { chatId: input.chatId.trim() }
          : {}),
        agent: input.agent,
        command: input.command,
        reason: input.reason,
        risk: input.risk,
        requestedAt: new Date().toISOString(),
        state: 'pending' as const,
      });

    this.permissions.set(permission.id, permission);
    await this.persistPermissionEvent(permission, 'permission_request');
    await this.deps.appendRunLifecycleEvent(input.sessionId, 'waiting_for_approval', {
      ...(permission.chatId ? { chatId: permission.chatId } : {}),
      requestedPath: session.metadata.path,
      agent: input.agent,
      command: input.command,
      reason: input.reason,
    });
    return permission;
  }

  async decidePermission(
    permissionId: string,
    decision: PermissionDecision,
  ): Promise<PermissionRequest> {
    const knownPermission = this.permissions.get(permissionId);
    const permission = knownPermission
      ?? (await this.deps.coordinationStore?.getPermissionById(permissionId))
      ?? null;
    if (!permission) {
      throw new Error('PERMISSION_NOT_FOUND');
    }

    const updated = this.deps.coordinationStore
      ? await this.deps.coordinationStore.decidePermission(permissionId, decision)
      : ({
        ...permission,
        state: (decision === 'deny' ? 'denied' : 'approved') as PermissionState,
        decision,
      });
    this.permissions.set(permissionId, updated);
    await this.persistPermissionEvent(updated, 'permission_decision', decision);

    for (const [key, mappedPermissionId] of this.codexPermissionIndex.entries()) {
      if (mappedPermissionId === permissionId) {
        this.codexPermissionIndex.delete(key);
      }
    }
    for (const [key, mappedPermissionId] of this.providerPermissionIndex.entries()) {
      if (mappedPermissionId === permissionId) {
        this.providerPermissionIndex.delete(key);
      }
    }

    this.providerPermissionDecisions.set(permissionId, decision);
    const providerWaiter = this.providerPermissionWaiters.get(permissionId);
    this.providerPermissionWaiters.delete(permissionId);
    providerWaiter?.resolve(decision);

    const responder = this.codexPermissionResponders.get(permissionId);
    this.codexPermissionResponders.delete(permissionId);

    if (responder) {
      try {
        await responder(decision);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`failed to send codex permission decision: ${message}`);
        if (decision === 'deny') {
          this.deps.abortSessionRuns(permission.sessionId, permission.chatId ?? undefined);
        }
      }
    } else if (decision === 'deny') {
      this.deps.abortSessionRuns(permission.sessionId, permission.chatId ?? undefined);
    }

    return updated;
  }

  // ---------------------------------------------------------------------
  // Cache accessors
  // ---------------------------------------------------------------------

  getCachedPermission(permissionId: string): PermissionRequest | undefined {
    return this.permissions.get(permissionId);
  }

  // ---------------------------------------------------------------------
  // Awaiter machinery
  // ---------------------------------------------------------------------

  async awaitDecision(
    permissionId: string,
    signal?: AbortSignal,
  ): Promise<PermissionDecision> {
    if (this.deps.coordinationStore) {
      return this.waitForPersistedDecision(permissionId, signal);
    }

    const knownDecision = this.providerPermissionDecisions.get(permissionId);
    if (knownDecision) {
      return knownDecision;
    }

    const existing = this.permissions.get(permissionId);
    if (existing && existing.state !== 'pending') {
      return existing.state === 'denied' ? 'deny' : 'allow_once';
    }

    return new Promise<PermissionDecision>((resolve, reject) => {
      const handleAbort = () => {
        this.providerPermissionWaiters.delete(permissionId);
        reject(new Error('The operation was aborted'));
      };

      if (signal?.aborted) {
        handleAbort();
        return;
      }

      const cleanup = () => {
        signal?.removeEventListener('abort', handleAbort);
      };

      this.providerPermissionWaiters.set(permissionId, {
        resolve: (decision) => {
          cleanup();
          resolve(decision);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
      });
      signal?.addEventListener('abort', handleAbort, { once: true });
    });
  }

  watchExternal(input: {
    permissionId: string;
    responder: (decision: PermissionDecision) => Promise<void>;
    signal?: AbortSignal;
  }): void {
    if (!this.deps.coordinationStore) {
      return;
    }

    void this.waitForPersistedDecision(input.permissionId, input.signal)
      .then((decision) => input.responder(decision))
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('aborted')) {
          console.error(`failed to resolve persisted permission decision: ${message}`);
        }
      });
  }

  // ---------------------------------------------------------------------
  // Provider-side request entry (used by claude/gemini event bridges)
  // ---------------------------------------------------------------------

  async handleProviderPermissionRequest(input: {
    session: RuntimeSession;
    chatId?: string;
    agent: PermissionRequest['agent'];
    request: ProviderPermissionRequest;
    signal?: AbortSignal;
  }): Promise<PermissionDecision> {
    const permissionKey = buildScopedPermissionKey(
      `${input.session.id}:provider:${input.request.approvalId || input.request.callId}`,
      input.chatId,
    );
    const knownPermissionId = this.providerPermissionIndex.get(permissionKey);
    if (knownPermissionId) {
      const knownPermission = this.permissions.get(knownPermissionId);
      if (knownPermission?.state === 'pending') {
        return this.awaitDecision(knownPermissionId, input.signal);
      }
      if (knownPermission) {
        return knownPermission.state === 'denied' ? 'deny' : 'allow_once';
      }
      this.providerPermissionIndex.delete(permissionKey);
    }

    const created = await this.createPermission({
      sessionId: input.session.id,
      ...(input.chatId ? { chatId: input.chatId } : {}),
      agent: input.agent,
      command: input.request.command,
      reason: input.request.reason,
      risk: input.request.risk,
    });
    this.providerPermissionIndex.set(permissionKey, created.id);

    const approvalPolicy = this.deps.resolveApprovalPolicy(input.session);
    if (approvalPolicy === 'yolo') {
      await this.decidePermission(created.id, 'allow_session');
      return 'allow_session';
    }

    return this.awaitDecision(created.id, input.signal);
  }

  // ---------------------------------------------------------------------
  // Codex-specific bindings (scheduled to migrate to runtime/providers/codex
  // in Phase 3 of the provider architecture refactor)
  // ---------------------------------------------------------------------

  registerCodexBinding(key: string, permissionId: string): void {
    this.codexPermissionIndex.set(key, permissionId);
  }

  lookupCodexBinding(key: string): string | undefined {
    return this.codexPermissionIndex.get(key);
  }

  clearCodexBinding(key: string): void {
    this.codexPermissionIndex.delete(key);
  }

  registerCodexResponder(
    permissionId: string,
    responder: (decision: PermissionDecision) => Promise<void>,
  ): void {
    this.codexPermissionResponders.set(permissionId, responder);
  }

  async finalizeCodexPermissions(
    permissionIds: Iterable<string>,
    options: { preservePending?: boolean } = {},
  ): Promise<void> {
    for (const permissionId of permissionIds) {
      this.codexPermissionResponders.delete(permissionId);

      for (const [key, mappedPermissionId] of this.codexPermissionIndex.entries()) {
        if (mappedPermissionId === permissionId) {
          this.codexPermissionIndex.delete(key);
        }
      }

      const existing = this.permissions.get(permissionId);
      if (!existing || existing.state !== 'pending' || options.preservePending) {
        continue;
      }

      if (this.deps.coordinationStore) {
        try {
          const denied = await this.deps.coordinationStore.decidePermission(permissionId, 'deny');
          this.permissions.set(permissionId, denied);
          continue;
        } catch {
          // Fall through to the in-memory copy when the persisted store fails.
        }
      }

      this.permissions.set(permissionId, { ...existing, state: 'denied', decision: 'deny' });
    }
  }

  // ---------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------

  private async waitForPersistedDecision(
    permissionId: string,
    signal?: AbortSignal,
  ): Promise<PermissionDecision> {
    if (!this.deps.coordinationStore) {
      throw new Error('PERSISTED_PERMISSION_COORDINATION_UNAVAILABLE');
    }

    while (true) {
      if (signal?.aborted) {
        throw new Error('The operation was aborted');
      }

      const persisted = await this.deps.coordinationStore.getPermissionById(permissionId);
      if (!persisted) {
        throw new Error('PERMISSION_NOT_FOUND');
      }
      this.permissions.set(permissionId, persisted);
      if (persisted.state === 'denied') {
        return 'deny';
      }
      if (persisted.state === 'approved') {
        return persisted.decision === 'allow_session' ? 'allow_session' : 'allow_once';
      }

      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  private async persistPermissionEvent(
    permission: PermissionRequest,
    streamEvent: 'permission_request' | 'permission_decision',
    decision?: PermissionDecision,
  ): Promise<void> {
    try {
      await this.deps.appendAgentMessage(
        permission.sessionId,
        permission.command,
        {
          sessionId: permission.sessionId,
          ...(permission.chatId ? { chatId: permission.chatId } : {}),
          agent: permission.agent,
          streamEvent,
          permissionId: permission.id,
          permissionState: permission.state,
          command: permission.command,
          reason: permission.reason,
          risk: permission.risk,
          requestedAt: permission.requestedAt,
          ...(decision ? { permissionDecision: decision } : {}),
        },
        { type: 'message', title: 'Permission Request' },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`failed to persist permission event (${streamEvent}): ${message}`);
    }
  }
}
