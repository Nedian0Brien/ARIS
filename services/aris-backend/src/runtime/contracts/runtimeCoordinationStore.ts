/**
 * Shared types for permission/coordination delegation between the runtime
 * core and the storage layer (PrismaRuntimeStore in production, mock in tests).
 *
 * These types were inlined inside `runtime/runtimeCore.ts` until 2.5c. Moving
 * them here lets `runtime/orchestration/permissionRouter.ts` consume the
 * coordination-store contract without circular imports through happyClient.
 */

import type {
  ChatUsageStats,
  PermissionDecision,
  PermissionRequest,
  PermissionState,
  PermissionRisk,
  SessionAction,
} from '../../types.js';

/**
 * Input shape accepted by `RuntimeCoordinationStore.createPermission`.
 *
 * Mirrors what the runtime needs to record before awaiting a decision:
 * session/chat scope, agent attribution, command + reason text, and risk.
 */
export type HappyRuntimePermissionInput = {
  sessionId: string;
  /**
   * `null` accepted alongside `undefined` to mirror the original inline
   * surface in runtimeCore.ts (callers occasionally pass nullable chat ids
   * from optional-property reads).
   */
  chatId?: string | null;
  agent: PermissionRequest['agent'];
  command: string;
  reason: string;
  risk: PermissionRisk;
};

/**
 * Storage-layer surface required by the runtime core for permission and
 * coordination operations. PrismaRuntimeStore implements this; mock backends
 * may pass `null` to keep everything in-memory.
 */
export type RuntimeCoordinationStore = {
  listPermissions(state?: PermissionState): Promise<PermissionRequest[]>;
  createPermission(input: HappyRuntimePermissionInput): Promise<PermissionRequest>;
  decidePermission(permissionId: string, decision: PermissionDecision): Promise<PermissionRequest>;
  getPermissionById(permissionId: string): Promise<PermissionRequest | null>;
  hasRequestedAction(input: {
    sessionId: string;
    action: SessionAction;
    chatId?: string;
    createdAfter?: Date;
  }): Promise<boolean>;
  /** 라이브 런의 토큰 usage를 Chat.usageStats에 반영한다(선택 — mock 백엔드는 미구현). */
  updateChatUsage?(input: { chatId: string; usage: ChatUsageStats }): Promise<void>;
};
