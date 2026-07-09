import { randomUUID } from 'node:crypto';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  ApprovalPolicy,
  GeminiProjectCapabilities,
  PermissionDecision,
  PermissionRequest,
  PermissionRisk,
  RuntimeMessage,
  RuntimeProject,
  ProjectAction,
  ProjectStatus,
} from './types.js';
import { RuntimeCore } from './runtime/runtimeCore.js';
import { PrismaRuntimeStore } from './runtime/prismaStore.js';
import { computeWorktreePath, ensureWorktree, removeWorktree } from './runtime/worktreeManager.js';
import type { ImportedAgentProvider, ImportedProviderMessage } from './runtime/import/providerSessionImportParsers.js';

type RuntimeBackend = 'mock' | 'prisma';
const execAsync = promisify(exec);
const TERMINAL_COMMAND_TIMEOUT_MS = 30_000;
const TERMINAL_COMMAND_MAX_BUFFER = 1024 * 1024;
const TERMINAL_OUTPUT_MAX_CHARS = 12_000;

type CreateProjectInput = {
  path: string;
  flavor: RuntimeProject['metadata']['flavor'];
  approvalPolicy?: ApprovalPolicy;
  model?: string;
  status?: ProjectStatus;
  riskScore?: number;
  branch?: string;
};

function normalizeModel(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, 120);
}

type AppendMessageInput = {
  type: string;
  title?: string;
  text: string;
  meta?: Record<string, unknown>;
};

type AppendChatEventInput = {
  projectId: string;
  runtimeProjectId?: string;
  runId?: string;
  type: string;
  title?: string;
  text: string;
  meta?: Record<string, unknown>;
};

type RunTerminalCommandInput = {
  projectId: string;
  runtimeProjectId?: string;
  command: string;
};

function asUserPromptInput(input: AppendMessageInput): AppendMessageInput {
  return {
    ...input,
    type: 'message',
    meta: {
      ...(input.meta ?? {}),
      actor: 'user',
      kind: 'user_message',
      role: 'user',
    },
  };
}

function asChatUserPromptInput(chatId: string, input: AppendChatEventInput): AppendChatEventInput {
  return {
    ...input,
    type: 'message',
    meta: {
      ...(input.meta ?? {}),
      chatId,
      actor: 'user',
      kind: 'user_message',
      role: 'user',
    },
  };
}

function trimTerminalOutput(value: string): string {
  if (value.length <= TERMINAL_OUTPUT_MAX_CHARS) {
    return value;
  }
  return `${value.slice(0, TERMINAL_OUTPUT_MAX_CHARS)}\n\n[output truncated at ${TERMINAL_OUTPUT_MAX_CHARS} chars]`;
}

type CreatePermissionInput = {
  projectId: string;
  chatId?: string | null;
  agent: PermissionRequest['agent'];
  command: string;
  reason: string;
  risk: PermissionRisk;
};

export type RuntimeRealtimeChannelEvent =
  | {
      type: 'event.appended';
      projectId: string;
      chatId?: string;
      event: RuntimeMessage;
      cursor?: number;
      source: 'mutation' | 'runtime';
    }
  | {
      type: 'project.created' | 'project.updated' | 'project.action';
      projectId: string;
      chatId?: string;
      project?: RuntimeProject;
      action?: ProjectAction;
    }
  | {
      type: 'permission.created' | 'permission.updated';
      projectId: string;
      chatId?: string;
      permission: PermissionRequest;
    };

export type RuntimeRealtimeChannelFilter = {
  projectId: string;
  chatId?: string;
  includeUnassigned?: boolean;
};

export type RuntimeRealtimeChannelListener = (event: RuntimeRealtimeChannelEvent) => void;

interface RuntimeStoreBackend {
  listProjects(): Promise<RuntimeProject[]>;
  getProject(projectId: string): Promise<RuntimeProject | null>;
  getGeminiProjectCapabilities?(projectId: string): Promise<GeminiProjectCapabilities>;
  createProject(input: CreateProjectInput): Promise<RuntimeProject>;
  updateProjectApprovalPolicy?(projectId: string, approvalPolicy: ApprovalPolicy): Promise<RuntimeProject>;
  listMessages(projectId: string, options?: { afterSeq?: number; afterId?: string; limit?: number }): Promise<RuntimeMessage[]>;
  listChatEvents?(chatId: string, options?: { afterSeq?: number; limit?: number }): Promise<RuntimeMessage[]>;
  listRealtimeEvents?(projectId: string, options?: { afterCursor?: number; limit?: number; chatId?: string }): Promise<{ events: RuntimeMessage[]; cursor: number }>;
  appendMessage(projectId: string, input: AppendMessageInput): Promise<RuntimeMessage>;
  appendChatEvent?(chatId: string, input: AppendChatEventInput): Promise<RuntimeMessage>;
  discoverImportedAgentSession?(input: {
    provider: ImportedAgentProvider;
    providerSessionId: string;
    sourcePath: string;
    projectPath: string;
    fileSize?: bigint;
    fileMtimeMs?: bigint;
    oldestCursorOffset?: bigint | null;
    newestCursorOffset?: bigint | null;
    status?: string;
  }): Promise<{
    id: string;
    chatId?: string | null;
    arisProjectId?: string | null;
    provider: string;
    providerSessionId: string;
    sourcePath: string;
    projectPath: string;
    fileSize?: bigint;
    fileMtimeMs?: bigint;
    oldestCursorOffset?: bigint | null;
    newestCursorOffset?: bigint | null;
    hasMoreBefore: boolean;
    status?: string;
  }>;
  resolveProjectIdByPath?(projectPath: string): Promise<string | null>;
  findOwningChat?(providerSessionId: string): Promise<{ chatId: string; isImported: boolean } | null>;
  ensureImportedAgentChat?(input: {
    importId: string;
    arisProjectId: string;
    userId: string;
    title: string;
    parentChatId?: string | null;
    subagentType?: string | null;
    subagentStatus?: string | null;
  }): Promise<{ chatId: string }>;
  markImportedAgentSessionNative?(input: {
    importId: string;
    arisProjectId: string;
    chatId: string;
  }): Promise<void>;
  updateSubagentChatMeta?(input: {
    chatId: string;
    parentChatId?: string | null;
    subagentType?: string | null;
    subagentStatus?: string | null;
  }): Promise<void>;
  appendImportedAgentEvents?(input: {
    importId: string;
    provider: ImportedAgentProvider;
    providerSessionId: string;
    projectId: string;
    chatId: string;
    messages: ImportedProviderMessage[];
    hasMoreBefore?: boolean;
  }): Promise<Array<{ id: string }>>;
  listImportedAgentSessionsForBackfill?(input: {
    projectPath: string;
    limit: number;
  }): Promise<Array<{
    id: string;
    chatId?: string | null;
    hasMoreBefore: boolean;
  }>>;
  getImportedAgentSessionState?(chatId: string): Promise<{ hasMoreBefore: boolean } | null>;
  loadOlderImportedAgentEvents?(input: { chatId: string; limitTurns: number }): Promise<{ events: RuntimeMessage[]; hasMoreBefore: boolean }>;
  syncLatestImportedAgentEvents?(input: { chatId: string; limitEvents: number }): Promise<{ events: RuntimeMessage[] }>;
  getLatestUserMessageForAction?(projectId: string, chatId?: string): Promise<AppendMessageInput | null>;
  applyProjectAction(projectId: string, action: ProjectAction, chatId?: string): Promise<{ accepted: boolean; message: string; at: string }>;
  isProjectRunning(projectId: string, chatId?: string): Promise<boolean>;
  listPermissions(state?: PermissionRequest['state']): Promise<PermissionRequest[]>;
  createPermission(input: CreatePermissionInput): Promise<PermissionRequest>;
  decidePermission(permissionId: string, decision: PermissionDecision): Promise<PermissionRequest>;
}

type RuntimeExecutor = Pick<
  RuntimeCore,
  | 'triggerPersistedUserMessage'
  | 'listRealtimeEvents'
  | 'applyProjectAction'
  | 'isProjectRunning'
  | 'listPermissions'
  | 'createPermission'
  | 'decidePermission'
  | 'getGeminiProjectCapabilities'
  | 'subscribeRealtimeEvents'
  | 'beginShutdownDrain'
  | 'awaitDrain'
>;

class MockRuntimeStore implements RuntimeStoreBackend {
  private readonly projects = new Map<string, RuntimeProject>();
  private readonly messages = new Map<string, RuntimeMessage[]>();
  private readonly chatEvents = new Map<string, RuntimeMessage[]>();
  private readonly permissions = new Map<string, PermissionRequest>();
  private readonly pendingAgentReplies = new Map<string, NodeJS.Timeout>();

  constructor(defaultProjectPath: string) {
    // Keep store intentionally empty on startup.
    // Projects, messages, and permissions should be created only by real user actions or runtime events.
    void defaultProjectPath;
  }

  async listProjects(): Promise<RuntimeProject[]> {
    return [...this.projects.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getProject(projectId: string): Promise<RuntimeProject | null> {
    return this.projects.get(projectId) ?? null;
  }

  async getGeminiProjectCapabilities(projectId: string): Promise<GeminiProjectCapabilities> {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error('SESSION_NOT_FOUND');
    }
    return {
      projectId,
      fetchedAt: new Date().toISOString(),
      modes: {
        currentModeId: project.metadata.approvalPolicy === 'yolo' ? 'yolo' : 'default',
        availableModes: [
          { id: 'default', label: 'Default' },
          { id: 'yolo', label: 'YOLO' },
        ],
      },
      models: {
        currentModelId: project.metadata.model ?? null,
        availableModels: project.metadata.model
          ? [{ id: project.metadata.model, label: project.metadata.model }]
          : [],
      },
    };
  }

  async createProject(input: CreateProjectInput): Promise<RuntimeProject> {
    const now = new Date().toISOString();
    const model = normalizeModel(input.model);
    const project: RuntimeProject = {
      id: randomUUID(),
      metadata: {
        flavor: input.flavor,
        path: input.path,
        approvalPolicy: input.approvalPolicy ?? 'on-request',
        ...(model ? { model } : {}),
        ...(input.branch ? { branch: input.branch } : {}),
        runtimeModel: 'chat-stream',
      },
      state: {
        status: input.status ?? 'idle',
      },
      updatedAt: now,
      riskScore: input.riskScore ?? 20,
    };

    this.projects.set(project.id, project);
    this.messages.set(project.id, []);
    return project;
  }

  async updateProjectApprovalPolicy(projectId: string, approvalPolicy: ApprovalPolicy): Promise<RuntimeProject> {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error('SESSION_NOT_FOUND');
    }
    project.metadata.approvalPolicy = approvalPolicy;
    project.updatedAt = new Date().toISOString();
    return project;
  }

  async listMessages(projectId: string, options: { afterSeq?: number; afterId?: string; limit?: number } = {}): Promise<RuntimeMessage[]> {
    const base = this.messages.get(projectId) ?? [];
    const sorted = [...base].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const withSeq = sorted.map((message, index) => ({
      ...message,
      meta: {
        ...(message.meta ?? {}),
        seq: index + 1,
      },
    }));

    // afterId: find the index of that message and slice everything after it
    if (typeof options.afterId === 'string' && options.afterId) {
      const idx = withSeq.findIndex((m) => m.id === options.afterId);
      const afterIdFiltered = idx >= 0 ? withSeq.slice(idx + 1) : withSeq;
      const normalizedLimit = Number.isFinite(options.limit)
        ? Math.max(1, Math.floor(Number(options.limit)))
        : null;
      return normalizedLimit === null ? afterIdFiltered : afterIdFiltered.slice(0, normalizedLimit);
    }

    const normalizedAfterSeq = Number.isFinite(options.afterSeq)
      ? Math.max(0, Math.floor(Number(options.afterSeq)))
      : 0;
    const afterFiltered = withSeq.filter((message) => {
      const seqValue = Number((message.meta as { seq?: number }).seq);
      return Number.isFinite(seqValue) ? seqValue > normalizedAfterSeq : true;
    });
    const normalizedLimit = Number.isFinite(options.limit)
      ? Math.max(1, Math.floor(Number(options.limit)))
      : null;
    if (normalizedLimit === null) {
      return afterFiltered;
    }
    return afterFiltered.slice(0, normalizedLimit);
  }

  async listChatEvents(chatId: string, options: { afterSeq?: number; limit?: number } = {}): Promise<RuntimeMessage[]> {
    const base = this.chatEvents.get(chatId) ?? [];
    const afterSeq = Number.isFinite(options.afterSeq) ? Math.max(0, Math.floor(Number(options.afterSeq))) : 0;
    const filtered = base.filter((message) => {
      const seqRaw = (message.meta as { seq?: unknown } | undefined)?.seq;
      const seq = typeof seqRaw === 'number' ? seqRaw : Number.parseInt(String(seqRaw ?? ''), 10);
      return Number.isFinite(seq) ? seq > afterSeq : true;
    });
    const normalizedLimit = Number.isFinite(options.limit)
      ? Math.max(1, Math.floor(Number(options.limit)))
      : null;
    return normalizedLimit === null ? filtered : filtered.slice(0, normalizedLimit);
  }

  async appendMessage(projectId: string, input: AppendMessageInput): Promise<RuntimeMessage> {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error('SESSION_NOT_FOUND');
    }

    const isAgentMessage = input.meta?.role === 'agent';
    const isUserPrompt = input.type === 'message' && !isAgentMessage;
    if (isUserPrompt) {
      project.state.status = 'running';
    }
    if (isAgentMessage) {
      project.state.status = 'idle';
    }

    const message: RuntimeMessage = {
      id: randomUUID(),
      projectId,
      type: input.type,
      title: input.title ?? input.type,
      text: input.text,
      meta: input.meta,
      createdAt: new Date().toISOString(),
    };

    const list = this.messages.get(projectId) ?? [];
    list.push(message);
    this.messages.set(projectId, list);

    project.updatedAt = message.createdAt;
    this.projects.set(projectId, project);

    // Mock Agent Response Logic
    if (isUserPrompt) {
      const existingTimer = this.pendingAgentReplies.get(projectId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(() => {
        this.pendingAgentReplies.delete(projectId);
        void this.appendMessage(projectId, {
          type: 'message',
          title: 'Text Reply',
          text: `[${project.metadata.flavor}] I received your message: "${input.text}". How can I help you with the code in ${project.metadata.path}?`,
          meta: { role: 'agent' },
        });
      }, 1500);
      this.pendingAgentReplies.set(projectId, timer);
    }

    return message;
  }

  async appendChatEvent(
    chatId: string,
    input: { projectId: string; runId?: string; type: string; title?: string; text: string; meta?: Record<string, unknown> },
  ): Promise<RuntimeMessage> {
    const project = this.projects.get(input.projectId);
    if (!project) {
      throw new Error('SESSION_NOT_FOUND');
    }

    const list = this.chatEvents.get(chatId) ?? [];
    const seq = list.length + 1;
    const message: RuntimeMessage = {
      id: randomUUID(),
      projectId: input.projectId,
      type: input.type,
      title: input.title ?? input.type,
      text: input.text,
      createdAt: new Date().toISOString(),
      meta: {
        ...(input.meta ?? {}),
        chatId,
        ...(input.runId ? { runId: input.runId } : {}),
        seq,
      },
    };
    list.push(message);
    this.chatEvents.set(chatId, list);
    project.updatedAt = message.createdAt;
    this.projects.set(input.projectId, project);
    return message;
  }

  async getLatestUserMessageForAction(projectId: string, chatId?: string): Promise<AppendMessageInput | null> {
    if (chatId && chatId.trim().length > 0) {
      const events = this.chatEvents.get(chatId.trim()) ?? [];
      for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        const role = typeof event.meta?.role === 'string' ? event.meta.role.trim() : '';
        if (event.projectId === projectId && role === 'user') {
          return {
            type: event.type,
            title: event.title,
            text: event.text,
            meta: event.meta,
          };
        }
      }
      return null;
    }

    const messages = this.messages.get(projectId) ?? [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      const role = typeof message.meta?.role === 'string' ? message.meta.role.trim() : '';
      if (role === 'user') {
        return {
          type: message.type,
          title: message.title,
          text: message.text,
          meta: message.meta,
        };
      }
    }
    return null;
  }

  async applyProjectAction(projectId: string, action: ProjectAction, _chatId?: string): Promise<{ accepted: boolean; message: string; at: string }> {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error('SESSION_NOT_FOUND');
    }

    const at = new Date().toISOString();
    const statusByAction: Record<Exclude<ProjectAction, 'kill'>, ProjectStatus> = {
      abort: 'idle',
      retry: 'running',
      resume: 'running',
    };

    if (action !== 'kill') {
      project.state.status = statusByAction[action];
      project.updatedAt = at;
    }

    if (action === 'retry' || action === 'resume') {
      project.riskScore = Math.max(10, project.riskScore - 15);
    }

    if (action === 'abort' || action === 'kill') {
      const pendingReply = this.pendingAgentReplies.get(projectId);
      if (pendingReply) {
        clearTimeout(pendingReply);
        this.pendingAgentReplies.delete(projectId);
      }
    }

    if (action === 'kill') {
      this.projects.delete(projectId);
      this.messages.delete(projectId);
      for (const [permissionId, permission] of this.permissions.entries()) {
        if (permission.projectId === projectId) {
          this.permissions.delete(permissionId);
        }
      }
    } else {
      this.projects.set(projectId, project);
      await this.appendMessage(projectId, {
        type: 'tool',
        title: 'Command Execution',
        text: `$ project ${action}\nexit code: 0`,
        meta: { system: true, action },
      });
    }

    return {
      accepted: true,
      message: `${action.toUpperCase()} acknowledged`,
      at,
    };
  }

  async isProjectRunning(projectId: string, _chatId?: string): Promise<boolean> {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error('SESSION_NOT_FOUND');
    }

    return project.state.status === 'running';
  }

  async listPermissions(state?: PermissionRequest['state']): Promise<PermissionRequest[]> {
    const list = [...this.permissions.values()].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    return state ? list.filter((item) => item.state === state) : list;
  }

  async createPermission(input: CreatePermissionInput): Promise<PermissionRequest> {
    if (!this.projects.has(input.projectId)) {
      throw new Error('SESSION_NOT_FOUND');
    }

    const permission: PermissionRequest = {
      id: randomUUID(),
      projectId: input.projectId,
      ...(typeof input.chatId === 'string' && input.chatId.trim().length > 0
        ? { chatId: input.chatId.trim() }
        : {}),
      agent: input.agent,
      command: input.command,
      reason: input.reason,
      risk: input.risk,
      requestedAt: new Date().toISOString(),
      state: 'pending',
    };

    this.permissions.set(permission.id, permission);
    return permission;
  }

  async decidePermission(permissionId: string, decision: PermissionDecision): Promise<PermissionRequest> {
    const permission = this.permissions.get(permissionId);
    if (!permission) {
      throw new Error('PERMISSION_NOT_FOUND');
    }

    permission.state = decision === 'deny' ? 'denied' : 'approved';
    this.permissions.set(permission.id, permission);

    return permission;
  }
}

export class RuntimeStore {
  private readonly delegate: RuntimeStoreBackend;
  private readonly runtimeExecutor: RuntimeExecutor | null;
  private readonly realtimeSubscribers = new Set<{
    filter: RuntimeRealtimeChannelFilter;
    listener: RuntimeRealtimeChannelListener;
  }>();

  constructor(
    defaultProjectPath: string,
    runtimeBackend: RuntimeBackend = 'mock',
    hostProjectsRoot?: string,
    databaseUrl?: string,
    runtimeApiUrl?: string,
    runtimeApiToken?: string,
  ) {
    if (runtimeBackend === 'prisma') {
      if (!databaseUrl) {
        throw new Error('DATABASE_URL is required when RUNTIME_BACKEND=prisma');
      }
      this.delegate = new PrismaRuntimeStore(databaseUrl);
      const internalRuntimeUrl = typeof runtimeApiUrl === 'string' && runtimeApiUrl.trim().length > 0
        ? runtimeApiUrl.trim()
        : 'http://127.0.0.1:4080';
      this.runtimeExecutor = new RuntimeCore({
        serverUrl: internalRuntimeUrl,
        token: runtimeApiToken ?? '',
        workspaceRoot: defaultProjectPath,
        hostProjectsRoot: hostProjectsRoot ?? '',
        coordinationStore: {
          listPermissions: (state) => this.delegate.listPermissions(state),
          createPermission: (input) => this.delegate.createPermission(input),
          decidePermission: (permissionId, decision) => this.delegate.decidePermission(permissionId, decision),
          getPermissionById: (permissionId) => {
            if (this.delegate instanceof PrismaRuntimeStore) {
              return this.delegate.getPermissionById(permissionId);
            }
            return Promise.resolve(null);
          },
          hasRequestedAction: (input) => {
            if (this.delegate instanceof PrismaRuntimeStore) {
              return this.delegate.hasRequestedAction(input);
            }
            return Promise.resolve(false);
          },
        },
      });
      return;
    }

    this.delegate = new MockRuntimeStore(defaultProjectPath);
    this.runtimeExecutor = null;
  }

  async listProjects() {
    return this.delegate.listProjects();
  }

  async getProject(projectId: string) {
    return this.delegate.getProject(projectId);
  }

  async getGeminiProjectCapabilities(projectId: string) {
    if (this.runtimeExecutor) {
      return this.runtimeExecutor.getGeminiProjectCapabilities(projectId);
    }
    if ('getGeminiProjectCapabilities' in this.delegate && typeof this.delegate.getGeminiProjectCapabilities === 'function') {
      return this.delegate.getGeminiProjectCapabilities(projectId);
    }
    throw new Error('GEMINI_CAPABILITIES_NOT_SUPPORTED');
  }

  async createProject(input: CreateProjectInput) {
    if (input.branch) {
      await ensureWorktree(input.path, input.branch);
    }

    const project = await this.delegate.createProject(input);

    this.emitRealtimeChannel({
      type: 'project.created',
      projectId: project.id,
      project,
    });

    return project;
  }

  async updateProjectApprovalPolicy(projectId: string, approvalPolicy: ApprovalPolicy) {
    if (typeof this.delegate.updateProjectApprovalPolicy === 'function') {
      const project = await this.delegate.updateProjectApprovalPolicy(projectId, approvalPolicy);
      this.emitRealtimeChannel({
        type: 'project.updated',
        projectId,
        project,
      });
      return project;
    }
    throw new Error('UPDATE_APPROVAL_POLICY_NOT_SUPPORTED');
  }

  async listMessages(projectId: string, options?: { afterSeq?: number; afterId?: string; limit?: number }) {
    return this.delegate.listMessages(projectId, options);
  }

  async listChatEvents(chatId: string, options?: { afterSeq?: number; limit?: number }) {
    if (typeof this.delegate.listChatEvents === 'function') {
      return this.delegate.listChatEvents(chatId, options);
    }
    return [];
  }

  async appendMessage(projectId: string, input: AppendMessageInput) {
    const event = await this.delegate.appendMessage(projectId, input);
    this.emitRealtimeChannel({
      type: 'event.appended',
      projectId,
      ...extractEventChatScope(event),
      event,
      source: 'mutation',
    });
    return event;
  }

  async submitUserPrompt(projectId: string, input: AppendMessageInput) {
    const promptInput = asUserPromptInput(input);
    const created = await this.delegate.appendMessage(projectId, promptInput);
    this.emitRealtimeChannel({
      type: 'event.appended',
      projectId,
      ...extractEventChatScope(created),
      event: created,
      source: 'mutation',
    });
    if (this.runtimeExecutor) {
      await this.runtimeExecutor.triggerPersistedUserMessage(projectId, promptInput);
    }
    return created;
  }

  async appendChatEvent(
    chatId: string,
    input: AppendChatEventInput,
  ) {
    if (typeof this.delegate.appendChatEvent === 'function') {
      const event = await this.delegate.appendChatEvent(chatId, input);
      this.emitRealtimeChannel({
        type: 'event.appended',
        projectId: input.projectId,
        chatId,
        event,
        source: 'mutation',
      });
      return event;
    }
    throw new Error('APPEND_CHAT_EVENT_NOT_SUPPORTED');
  }

  async discoverImportedAgentSession(input: Parameters<NonNullable<RuntimeStoreBackend['discoverImportedAgentSession']>>[0]) {
    if (typeof this.delegate.discoverImportedAgentSession === 'function') {
      return this.delegate.discoverImportedAgentSession(input);
    }
    throw new Error('IMPORTED_AGENT_SESSION_NOT_SUPPORTED');
  }

  async resolveProjectIdByPath(projectPath: string) {
    if (typeof this.delegate.resolveProjectIdByPath === 'function') {
      return this.delegate.resolveProjectIdByPath(projectPath);
    }
    throw new Error('IMPORTED_AGENT_SESSION_NOT_SUPPORTED');
  }

  async findOwningChat(providerSessionId: string) {
    if (typeof this.delegate.findOwningChat === 'function') {
      return this.delegate.findOwningChat(providerSessionId);
    }
    return null;
  }

  async ensureImportedAgentChat(input: Parameters<NonNullable<RuntimeStoreBackend['ensureImportedAgentChat']>>[0]) {
    if (typeof this.delegate.ensureImportedAgentChat === 'function') {
      return this.delegate.ensureImportedAgentChat(input);
    }
    throw new Error('IMPORTED_AGENT_SESSION_NOT_SUPPORTED');
  }

  async markImportedAgentSessionNative(input: Parameters<NonNullable<RuntimeStoreBackend['markImportedAgentSessionNative']>>[0]) {
    if (typeof this.delegate.markImportedAgentSessionNative === 'function') {
      return this.delegate.markImportedAgentSessionNative(input);
    }
    throw new Error('IMPORTED_AGENT_SESSION_NOT_SUPPORTED');
  }

  async updateSubagentChatMeta(input: Parameters<NonNullable<RuntimeStoreBackend['updateSubagentChatMeta']>>[0]) {
    if (typeof this.delegate.updateSubagentChatMeta === 'function') {
      return this.delegate.updateSubagentChatMeta(input);
    }
    throw new Error('IMPORTED_AGENT_SESSION_NOT_SUPPORTED');
  }

  async appendImportedAgentEvents(input: Parameters<NonNullable<RuntimeStoreBackend['appendImportedAgentEvents']>>[0]) {
    if (typeof this.delegate.appendImportedAgentEvents === 'function') {
      const events = await this.delegate.appendImportedAgentEvents(input);
      for (const event of events) {
        if ('projectId' in event && typeof event.projectId === 'string') {
          this.emitRealtimeChannel({
            type: 'event.appended',
            projectId: event.projectId,
            chatId: input.chatId,
            event: event as RuntimeMessage,
            source: 'mutation',
          });
        }
      }
      return events;
    }
    throw new Error('IMPORTED_AGENT_SESSION_NOT_SUPPORTED');
  }

  async getImportedAgentSessionState(chatId: string) {
    if (typeof this.delegate.getImportedAgentSessionState === 'function') {
      return this.delegate.getImportedAgentSessionState(chatId);
    }
    return null;
  }

  async listImportedAgentSessionsForBackfill(input: { projectPath: string; limit: number }) {
    if (typeof this.delegate.listImportedAgentSessionsForBackfill === 'function') {
      return this.delegate.listImportedAgentSessionsForBackfill(input);
    }
    return [];
  }

  async loadOlderImportedAgentEvents(input: { chatId: string; limitTurns: number }) {
    if (typeof this.delegate.loadOlderImportedAgentEvents === 'function') {
      return this.delegate.loadOlderImportedAgentEvents(input);
    }
    throw new Error('IMPORTED_AGENT_SESSION_NOT_SUPPORTED');
  }

  async syncLatestImportedAgentEvents(input: { chatId: string; limitEvents: number }) {
    if (typeof this.delegate.syncLatestImportedAgentEvents === 'function') {
      const result = await this.delegate.syncLatestImportedAgentEvents(input);
      for (const event of result.events) {
        if ('projectId' in event && typeof event.projectId === 'string') {
          this.emitRealtimeChannel({
            type: 'event.appended',
            projectId: event.projectId,
            chatId: input.chatId,
            event,
            source: 'mutation',
          });
        }
      }
      return result;
    }
    throw new Error('IMPORTED_AGENT_SESSION_NOT_SUPPORTED');
  }

  async submitChatUserPrompt(chatId: string, input: AppendChatEventInput) {
    if (typeof this.delegate.appendChatEvent !== 'function') {
      throw new Error('APPEND_CHAT_EVENT_NOT_SUPPORTED');
    }

    const promptInput = asChatUserPromptInput(chatId, input);
    const created = await this.delegate.appendChatEvent(chatId, promptInput);
    this.emitRealtimeChannel({
      type: 'event.appended',
      projectId: promptInput.projectId,
      chatId,
      event: created,
      source: 'mutation',
    });
    if (this.runtimeExecutor) {
      const runtimeProjectId = typeof input.runtimeProjectId === 'string' && input.runtimeProjectId.trim().length > 0
        ? input.runtimeProjectId.trim()
        : promptInput.projectId;
      await this.runtimeExecutor.triggerPersistedUserMessage(runtimeProjectId, {
        type: promptInput.type,
        title: promptInput.title,
        text: promptInput.text,
        meta: {
          ...(promptInput.meta ?? {}),
          ...(runtimeProjectId !== promptInput.projectId
            ? {
                runtimeProjectId,
                runtimePersistenceProjectId: promptInput.projectId,
              }
            : {}),
        },
      });
    }
    return created;
  }

  async runTerminalCommand(chatId: string, input: RunTerminalCommandInput) {
    const command = input.command.trim();
    if (!command) {
      throw new Error('COMMAND_REQUIRED');
    }

    const persistenceSession = await this.delegate.getProject(input.projectId);
    if (!persistenceSession) {
      throw new Error('SESSION_NOT_FOUND');
    }
    const runtimeProjectId = typeof input.runtimeProjectId === 'string' && input.runtimeProjectId.trim().length > 0
      ? input.runtimeProjectId.trim()
      : input.projectId;
    const executionSession = runtimeProjectId === input.projectId
      ? persistenceSession
      : await this.delegate.getProject(runtimeProjectId);
    if (!executionSession) {
      throw new Error('RUNTIME_SESSION_NOT_FOUND');
    }

    const startedAt = new Date().toISOString();
    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    let cwd = '';
    try {
      cwd = this.resolveExecutionCwd(executionSession.metadata.path, executionSession.metadata.branch);
      const result = await execAsync(command, {
        cwd,
        timeout: TERMINAL_COMMAND_TIMEOUT_MS,
        maxBuffer: TERMINAL_COMMAND_MAX_BUFFER,
        shell: '/bin/bash',
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (error) {
      const err = error as Error & { stdout?: string; stderr?: string; code?: number | string };
      stdout = err.stdout ?? '';
      stderr = err.stderr ?? err.message;
      exitCode = typeof err.code === 'number' ? err.code : 1;
    }

    const output = trimTerminalOutput([stdout, stderr].filter(Boolean).join('\n'));
    const preview = output || '(no output)';
    return this.appendChatEvent(chatId, {
      projectId: input.projectId,
      type: 'tool',
      title: exitCode === 0 ? 'Terminal completed' : 'Terminal failed',
      text: `$ ${command}\n${preview}`,
      meta: {
        role: 'terminal',
        actor: 'terminal',
        kind: 'terminal_result',
        chatId,
        actionType: 'command_execution',
        composerMode: 'terminal',
        startedAt,
        completedAt: new Date().toISOString(),
        exitCode,
        command,
        execCwd: cwd,
        ...(runtimeProjectId !== input.projectId ? { runtimeProjectId } : {}),
      },
    });
  }

  async listRealtimeEvents(projectId: string, options?: { afterCursor?: number; limit?: number; chatId?: string }) {
    if (this.runtimeExecutor) {
      return this.runtimeExecutor.listRealtimeEvents(projectId, options);
    }
    if ('listRealtimeEvents' in this.delegate && typeof this.delegate.listRealtimeEvents === 'function') {
      return this.delegate.listRealtimeEvents(projectId, options);
    }
    return { events: [], cursor: 0 };
  }

  async applyProjectAction(projectId: string, action: ProjectAction, chatId?: string) {
    const sessionForCleanup = action === 'kill'
      ? await this.delegate.getProject(projectId).catch(() => null)
      : null;
    if (this.runtimeExecutor) {
      if (action === 'retry' || action === 'resume') {
        const result = await this.delegate.applyProjectAction(projectId, action, chatId);
        const latestUserMessage = typeof this.delegate.getLatestUserMessageForAction === 'function'
          ? await this.delegate.getLatestUserMessageForAction(projectId, chatId)
          : null;
        if (latestUserMessage) {
          await this.runtimeExecutor.triggerPersistedUserMessage(projectId, latestUserMessage);
        }
        this.emitRealtimeChannel({ type: 'project.action', projectId, ...(chatId ? { chatId } : {}), action });
        return result;
      }
      if (action === 'kill') {
        await this.runtimeExecutor.applyProjectAction(projectId, 'abort');
        const result = await this.delegate.applyProjectAction(projectId, action, chatId);
        await this.cleanupKilledSessionWorktree(sessionForCleanup);
        this.emitRealtimeChannel({ type: 'project.action', projectId, ...(chatId ? { chatId } : {}), action });
        return result;
      }
      await this.runtimeExecutor.applyProjectAction(projectId, action, chatId);
      const result = await this.delegate.applyProjectAction(projectId, action, chatId);
      this.emitRealtimeChannel({ type: 'project.action', projectId, ...(chatId ? { chatId } : {}), action });
      return result;
    }
    const result = await this.delegate.applyProjectAction(projectId, action, chatId);
    if (action === 'kill') {
      await this.cleanupKilledSessionWorktree(sessionForCleanup);
    }
    this.emitRealtimeChannel({ type: 'project.action', projectId, ...(chatId ? { chatId } : {}), action });
    return result;
  }

  private async cleanupKilledSessionWorktree(project: RuntimeProject | null): Promise<void> {
    const branch = typeof project?.metadata.branch === 'string' && project.metadata.branch.trim().length > 0
      ? project.metadata.branch.trim()
      : null;
    if (!project || !branch) {
      return;
    }
    const projectPath = this.resolveExecutionCwd(project.metadata.path);
    await removeWorktree(projectPath, branch).catch(() => undefined);
  }

  async isProjectRunning(projectId: string, chatId?: string) {
    if (this.runtimeExecutor) {
      const [runtimeRunning, persistedRunning] = await Promise.all([
        this.runtimeExecutor.isProjectRunning(projectId, chatId),
        this.delegate.isProjectRunning(projectId, chatId),
      ]);
      return runtimeRunning || persistedRunning;
    }
    return this.delegate.isProjectRunning(projectId, chatId);
  }

  beginShutdownDrain(): void {
    this.runtimeExecutor?.beginShutdownDrain();
  }

  async cleanupEmptyChats(maxAgeMs: number): Promise<number> {
    if (this.delegate instanceof PrismaRuntimeStore) {
      return this.delegate.cleanupEmptyChats(maxAgeMs);
    }
    return 0;
  }

  async awaitDrain(timeoutMs: number): Promise<void> {
    if (!this.runtimeExecutor) {
      return;
    }
    await this.runtimeExecutor.awaitDrain(timeoutMs);
  }

  async listPermissions(state?: PermissionRequest['state']) {
    if (this.runtimeExecutor) {
      return this.runtimeExecutor.listPermissions(state);
    }
    return this.delegate.listPermissions(state);
  }

  async createPermission(input: CreatePermissionInput) {
    const permission = this.runtimeExecutor
      ? await this.runtimeExecutor.createPermission(input)
      : await this.delegate.createPermission(input);
    this.emitRealtimeChannel({
      type: 'permission.created',
      projectId: permission.projectId,
      ...(typeof permission.chatId === 'string' && permission.chatId.trim().length > 0
        ? { chatId: permission.chatId.trim() }
        : {}),
      permission,
    });
    return permission;
  }

  async decidePermission(permissionId: string, decision: PermissionDecision) {
    if (this.runtimeExecutor) {
      const updated = await this.runtimeExecutor.decidePermission(permissionId, decision);
      const normalizedChatId = typeof updated.chatId === 'string' && updated.chatId.trim().length > 0
        ? updated.chatId.trim()
        : undefined;
      if (
        decision !== 'deny'
        && typeof this.delegate.getLatestUserMessageForAction === 'function'
      ) {
        const runtimeStillRunning = await this.runtimeExecutor.isProjectRunning(updated.projectId, normalizedChatId);
        if (!runtimeStillRunning) {
          const latestUserMessage = await this.delegate.getLatestUserMessageForAction(updated.projectId, normalizedChatId);
          if (latestUserMessage) {
            await this.runtimeExecutor.triggerPersistedUserMessage(updated.projectId, latestUserMessage);
          }
        }
      }
      this.emitRealtimeChannel({
        type: 'permission.updated',
        projectId: updated.projectId,
        ...(normalizedChatId ? { chatId: normalizedChatId } : {}),
        permission: updated,
      });
      return updated;
    }
    const updated = await this.delegate.decidePermission(permissionId, decision);
    const normalizedChatId = typeof updated.chatId === 'string' && updated.chatId.trim().length > 0
      ? updated.chatId.trim()
      : undefined;
    this.emitRealtimeChannel({
      type: 'permission.updated',
      projectId: updated.projectId,
      ...(normalizedChatId ? { chatId: normalizedChatId } : {}),
      permission: updated,
    });
    return updated;
  }

  subscribeRealtimeChannel(
    filter: RuntimeRealtimeChannelFilter,
    listener: RuntimeRealtimeChannelListener,
  ): () => void {
    const subscription = {
      filter: normalizeRealtimeChannelFilter(filter),
      listener,
    };
    this.realtimeSubscribers.add(subscription);
    const runtimeEventFilter = subscription.filter.chatId && !subscription.filter.includeUnassigned
      ? { chatId: subscription.filter.chatId }
      : {};
    const unsubscribeRuntime = this.runtimeExecutor?.subscribeRealtimeEvents?.(
      subscription.filter.projectId,
      runtimeEventFilter,
      (record) => {
        const eventChatScope = extractEventChatScope(record.event);
        this.deliverRealtimeChannelEvent(subscription, {
          type: 'event.appended',
          projectId: record.event.projectId,
          ...eventChatScope,
          event: record.event,
          cursor: record.cursor,
          source: 'runtime',
        });
      },
    );

    return () => {
      this.realtimeSubscribers.delete(subscription);
      unsubscribeRuntime?.();
    };
  }

  private emitRealtimeChannel(event: RuntimeRealtimeChannelEvent): void {
    for (const subscription of this.realtimeSubscribers) {
      this.deliverRealtimeChannelEvent(subscription, event);
    }
  }

  private deliverRealtimeChannelEvent(
    subscription: {
      filter: RuntimeRealtimeChannelFilter;
      listener: RuntimeRealtimeChannelListener;
    },
    event: RuntimeRealtimeChannelEvent,
  ): void {
    if (!matchesRealtimeChannelFilter(subscription.filter, event)) {
      return;
    }
    subscription.listener(event);
  }

  resolveExecutionCwd(cwdHint?: string, branch?: string): string {
    const basePath = (() => {
      if ('resolveExecutionCwd' in this.delegate && typeof this.delegate.resolveExecutionCwd === 'function') {
        return (this.delegate as any).resolveExecutionCwd(cwdHint);
      }
      return cwdHint || '';
    })();
    return branch ? computeWorktreePath(basePath, branch) : basePath;
  }
}

function normalizeRealtimeChannelFilter(filter: RuntimeRealtimeChannelFilter): RuntimeRealtimeChannelFilter {
  const projectId = filter.projectId.trim();
  const chatId = typeof filter.chatId === 'string' && filter.chatId.trim().length > 0
    ? filter.chatId.trim()
    : undefined;
  return {
    projectId,
    ...(chatId ? { chatId } : {}),
    ...(filter.includeUnassigned ? { includeUnassigned: true } : {}),
  };
}

function extractEventChatScope(event: RuntimeMessage): { chatId?: string } {
  const chatId = typeof event.meta?.chatId === 'string' && event.meta.chatId.trim().length > 0
    ? event.meta.chatId.trim()
    : undefined;
  return chatId ? { chatId } : {};
}

function matchesRealtimeChannelFilter(
  filter: RuntimeRealtimeChannelFilter,
  event: RuntimeRealtimeChannelEvent,
): boolean {
  if (filter.projectId !== event.projectId) {
    return false;
  }
  if (!filter.chatId) {
    return true;
  }
  const eventChatId = typeof event.chatId === 'string' && event.chatId.trim().length > 0
    ? event.chatId.trim()
    : undefined;
  if (eventChatId) {
    return eventChatId === filter.chatId;
  }
  return filter.includeUnassigned === true;
}
