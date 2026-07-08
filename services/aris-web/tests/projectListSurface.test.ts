import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readAppStyles } from './helpers/readAppStyles';

const __dirname = dirname(fileURLToPath(import.meta.url));
const homeClient = readFileSync(resolve(__dirname, '../app/HomePageClient.tsx'), 'utf8');
const projectChatSurface = readFileSync(resolve(__dirname, '../components/project-chat/ProjectChatSurface.tsx'), 'utf8');
const projectWorkspacePanelParts = readFileSync(resolve(__dirname, '../components/project-chat/ProjectWorkspacePanelParts.tsx'), 'utf8');
const projectChatSurfaceCombined = `${projectChatSurface}\n${projectWorkspacePanelParts}`;
const projectChatSurfaceUtils = readFileSync(resolve(__dirname, '../components/project-chat/projectChatSurfaceUtils.ts'), 'utf8');
const projectActionCard = readFileSync(resolve(__dirname, '../components/project-chat/ProjectActionCard.tsx'), 'utf8');
const projectRunStatusChip = readFileSync(resolve(__dirname, '../components/project-chat/ProjectRunStatusChip.tsx'), 'utf8');
const projectChatEventsHelper = readFileSync(resolve(__dirname, '../components/project-chat/helpers/projectChatEvents.ts'), 'utf8');
const actionMarksHelper = readFileSync(resolve(__dirname, '../components/project-chat/helpers/actionMarks.tsx'), 'utf8');
const commandTokensHelper = readFileSync(resolve(__dirname, '../components/project-chat/helpers/commandTokens.tsx'), 'utf8');
const uiCss = readAppStyles();
const terminalRoute = readFileSync(resolve(__dirname, '../app/api/runtime/sessions/[sessionId]/terminal/route.ts'), 'utf8');

function cssBlock(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(uiCss)?.[1] ?? '';
}

function exactCssBlock(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(uiCss)?.[1] ?? '';
}

describe('project list surface', () => {
  it('opens the Project entry point as the project list screen from the IA v2 mockup', () => {
    expect(homeClient).toContain("project: { title: 'Projects'");
    expect(homeClient).toContain('function ProjectSurface({');
    expect(homeClient).toContain('className="proj-list-wrap"');
    expect(homeClient).toContain('className="proj-list-toolbar"');
    expect(homeClient).toContain('placeholder="Search projects..."');
    expect(homeClient).toContain("['All', 'Active', 'Recent', 'Archived']");
    expect(homeClient).toContain('className="proj-list-grid"');
    expect(homeClient).toContain('className="proj-list-card"');
    expect(homeClient).toContain('className="proj-list-card proj-list-card--new"');
    expect(homeClient).toContain('className="proj-list-new-btn"');
    expect(homeClient).not.toContain('const selected = sortSessions(sessions)[0] ?? null;');
  });

  it('keeps the Project topbar compact with theme actions behind a context menu', () => {
    const topbarStart = homeClient.indexOf('function Topbar({');
    const homeOrbStart = homeClient.indexOf('function HomeOrb()');
    const topbarSource = homeClient.slice(topbarStart, homeOrbStart);
    const menuStart = topbarSource.indexOf('className="m-context-menu"');
    const menuEnd = topbarSource.indexOf('</header>', menuStart);
    const menuSource = topbarSource.slice(menuStart, menuEnd);

    expect(menuSource).toContain('className="m-context-menu"');
    expect(menuSource).toContain('className="m-context-menu__button"');
    expect(menuSource).toContain('aria-label="상단 헤더 메뉴"');
    expect(menuSource).toContain('aria-haspopup="menu"');
    expect(topbarSource).toContain('onOpenSettings: () => void;');
    expect(topbarSource).toContain('const handleOpenSettings = () => {');
    expect(menuSource).toContain('className="m-context-menu__item"');
    expect(menuSource).toContain('설정');
    expect(menuSource).toContain('className="m-theme-toggle"');
    expect(menuSource).toContain('aria-label="테마 선택"');
    expect(topbarSource).not.toContain('New project');
    expect(uiCss).toContain('.m-context-menu__panel');
  });

  it('routes project card clicks to the IA project detail instead of the legacy session screen', () => {
    expect(homeClient).toContain("type ProjectView = 'overview' | 'chats' | 'chat' | 'files' | 'context';");
    expect(homeClient).toContain("function buildProjectDetailPath(sessionId: string, view: ProjectView = 'chats', chatId?: string | null)");
    expect(homeClient).toContain("params.set('tab', 'project');");
    expect(homeClient).toContain("params.set('project', sessionId);");
    expect(homeClient).toContain("if (view === 'chat' && chatId) {");
    expect(homeClient).toContain("params.set('chat', chatId);");
    expect(homeClient).toContain('data-project-href={buildProjectDetailPath(session.id)}');
    expect(homeClient).toContain('onClick={() => onProjectOpen(session.id)}');
    expect(homeClient).toContain('onProjectOpen(session.id);');
    expect(homeClient).toContain("window.history.pushState(null, '', withAppBasePath(buildProjectDetailPath(sessionId, view, chatId)))");
    expect(homeClient).toContain('selectedProjectId={selectedProjectId}');
    expect(homeClient).not.toContain('navigateTo(`/sessions/${session.id}`)');
  });

  it('renders the IA project detail surface from the selected project query param', () => {
    expect(homeClient).toContain('function ProjectDetailSurface({');
    expect(homeClient).toContain('className="m-main-scroll m-main-scroll--project-detail"');
    expect(homeClient).toContain('className="proj-head"');
    expect(homeClient).toContain('className="proj-tabs"');
    expect(homeClient).toContain('className="proj-pane"');
    expect(homeClient).toContain("setSelectedProjectId(nextTab === 'project' ? (searchParams.get('project') ?? null) : null);");
    expect(homeClient).toContain("const nextProjectView = nextTab === 'project' ? normalizeProjectView(searchParams.get('view')) : 'chats';");
    expect(homeClient).toContain('setSelectedProjectView(nextProjectView);');
    expect(homeClient).toContain('if (selectedProject) {');
  });

  it('keeps project chat inside the IA project route instead of opening the legacy session route', () => {
    expect(projectChatSurface).toContain('export function ProjectChatSurface({');
    expect(projectChatSurface).toContain('data-project-chat-list');
    expect(projectChatSurface).toContain('data-project-chat-screen');
    expect(homeClient).toContain('m-main-scroll--project-chat-detail');
    expect(homeClient).toContain("onClick={() => onProjectOpen(session.id, 'chats')}");
    expect(homeClient).toContain("onClick={() => onProjectViewChange('chats')}");
    expect(projectChatSurface).toContain("onClick={() => onChatOpen(chat.id)}");
    expect(homeClient).toContain("onProjectChatOpen(session.id, chat.id)");
    expect(homeClient).toContain("setSelectedProjectView('chat');");
    expect(homeClient).toContain("buildProjectDetailPath(sessionId, 'chat', chatId)");
    expect(homeClient).toContain("params.set('view', view);");
    expect(projectChatSurface).toContain('fetch(withAppBasePath(buildProjectChatCollectionPath(projectId))');
    expect(projectChatSurface).toContain('fetch(withAppBasePath(buildProjectRuntimeEventsPath(projectId, params))');
    expect(projectChatSurface).toContain('pc-chat-empty-state');
    expect(homeClient).not.toContain('seed-history-primary');
    expect(projectChatSurface).not.toContain('seed-history-primary');
    expect(homeClient).not.toContain('seed-context');
    expect(projectChatSurface).not.toContain('seed-context');
    expect(projectChatSurface).not.toContain('Read · project context');
    expect(projectChatSurface).not.toContain('project-context.snapshot');
    expect(projectChatSurface).not.toContain('프로젝트 컨텍스트를 먼저 확인하겠습니다.');
    expect(homeClient).not.toContain('/sessions/${session.id}');
    expect(projectChatSurface).not.toContain('/sessions/${session.id}');
  });

  it('loads older project chat event pages from the timeline instead of replacing the visible window', () => {
    expect(projectChatSurfaceUtils).toContain('export const PROJECT_CHAT_EVENT_PAGE_LIMIT = 40;');
    expect(projectChatSurface).toContain("params.set('before', cursor.before);");
    expect(projectChatSurface).toContain('const loadOlderEvents = useCallback(async () => {');
    expect(projectChatSurface).toContain('setEvents((current) => mergeProjectChatEvents([...olderEvents, ...current]));');
    expect(projectChatSurface).toContain('onScroll={handleTimelineScroll}');
    expect(projectChatSurface).toContain('aria-label="이전 대화 더 불러오기"');
    expect(projectChatSurface).toContain('이전 대화 불러오기');
    expect(projectChatSurface).toContain('onClick={loadOlderEvents}');
    expect(projectChatSurface).not.toContain('void loadOlderEvents();');
    expect(uiCss).toContain('.tl__load-more-btn');
    expect(projectChatSurface).toContain('const visibleEvents = events;');
    expect(projectChatSurface).not.toContain('const visibleEvents = events.slice(-40);');
  });

  it('keeps project chat keyboard send and preview defaults aligned with the redesigned composer', () => {
    expect(projectChatSurface).toContain("event.key !== 'Enter' || event.shiftKey || (!event.metaKey && !event.ctrlKey)");
    expect(projectChatSurface).toContain('event.currentTarget.form?.requestSubmit();');
    expect(projectChatSurface).toContain("const [previewState, setPreviewState] = useState<PreviewState>('closed');");
    expect(projectChatSurface).toContain("setPreviewState('closed');");
  });

  it('renders the jump-to-latest control only when the timeline has newer content below the viewport', () => {
    expect(projectChatSurfaceUtils).toContain('export const PROJECT_CHAT_BOTTOM_THRESHOLD_PX = 96;');
    expect(projectChatSurface).toContain('setShowJumpToLatest(distanceFromBottom > PROJECT_CHAT_BOTTOM_THRESHOLD_PX);');
    expect(projectChatSurface).toContain('{showJumpToLatest && (');
    expect(projectChatSurface).toContain('className="jb"');
  });

  it('starts an opened project chat at the latest loaded message', () => {
    expect(projectChatSurface).toContain("useLayoutEffect(() => {");
    expect(projectChatSurface).toContain('const [eventsForChatId, setEventsForChatId] = useState<string | null>(null);');
    expect(projectChatSurface).toContain('initialTailScrolledChatIdRef.current = selectedChatId;');
    expect(projectChatSurface).toContain('node.scrollTop = node.scrollHeight;');
    expect(projectChatSurface).toContain('setEventsForChatId(loadingChatId);');
  });

  it('keeps following refreshed project chat events only while the timeline is already at the tail', () => {
    expect(projectChatSurface).toContain('const stickToLatestOnNextPaintRef = useRef(false);');
    expect(projectChatSurfaceUtils).toContain('export function isProjectChatTimelineNearBottom(node: HTMLElement | null): boolean {');
    expect(projectChatSurface).toContain("const shouldFollowTail = mode === 'refresh' && isProjectChatTimelineNearBottom(timelineRef.current);");
    expect(projectChatSurface).toContain('stickToLatestOnNextPaintRef.current = shouldFollowTail;');
    expect(projectChatSurface).toContain('if (!stickToLatestOnNextPaintRef.current) {');
    expect(projectChatSurface).toContain('stickToLatestOnNextPaintRef.current = false;');
  });

  it('wires the project detail header actions to IDE, settings, and real chat creation', () => {
    const detailStart = homeClient.indexOf('function ProjectDetailSurface({');
    const projectSurfaceStart = homeClient.indexOf('function ProjectSurface({');
    const detailSource = homeClient.slice(detailStart, projectSurfaceStart);

    expect(homeClient).toContain('async function createProjectChat(');
    expect(homeClient).toContain("const DEFAULT_CODE_SERVER_BASE_URL = 'https://lawdigest.kr/';");
    expect(homeClient).toContain('process.env.NEXT_PUBLIC_CODE_SERVER_BASE_URL');
    expect(homeClient).toContain('function buildCodeServerFolderUrl(projectPath: string): string');
    expect(homeClient).toContain('fetch(withAppBasePath(buildProjectChatCollectionPath(projectId))');
    expect(detailSource).toContain('const [isCreatingHeaderChat, setIsCreatingHeaderChat] = useState(false);');
    expect(detailSource).toContain('const [settingsModalOpen, setSettingsModalOpen] = useState(false);');
    expect(detailSource).toContain('const handleProjectHeaderNewChat = async () => {');
    expect(detailSource).toContain('const projectModelInput = normalizeProjectChatModelInput(session.model);');
    expect(detailSource).not.toContain('normalizeProjectChatModelInput(session.model ?? session.metadata?.runtimeModel)');
    expect(detailSource).toContain('const createdChat = await createProjectChat(session.id, {');
    expect(detailSource).toContain('title: `Chat ${Math.max(1, totalChats + 1)}`,');
    expect(detailSource).toContain('onProjectChatOpen(createdChat.id);');
    expect(detailSource).toContain('className="proj-head__actions"');
    expect(detailSource).toContain('href={buildCodeServerFolderUrl(projectPath)}');
    expect(detailSource).toContain('target="_blank"');
    expect(detailSource).toContain('Open in IDE');
    expect(detailSource).toContain('onClick={() => setSettingsModalOpen(true)}');
    expect(detailSource).toContain('Settings');
    expect(detailSource).toContain('onClick={handleProjectHeaderNewChat}');
    expect(detailSource).toContain('disabled={isCreatingHeaderChat}');
    expect(detailSource).toContain('aria-busy={isCreatingHeaderChat}');
    expect(detailSource).toContain('role="dialog"');
    expect(detailSource).toContain('aria-modal="true"');
    expect(detailSource).toContain('Project settings');
    expect(detailSource).not.toContain('model: modelLabel,');
    expect(detailSource).not.toContain('className="btn btn--primary btn--sm" onClick={() => onProjectViewChange(\'chats\')}');
  });

  it('renders the project overview secondary card as real recent chats', () => {
    const detailStart = homeClient.indexOf('function ProjectDetailSurface({');
    const projectSurfaceStart = homeClient.indexOf('function ProjectSurface({');
    const detailSource = homeClient.slice(detailStart, projectSurfaceStart);

    expect(detailSource).toContain('Recent chats');
    expect(detailSource).toContain('className="proj-card proj-card--recent-chats"');
    expect(detailSource).toContain('<ProjectRecentChatRows');
    expect(detailSource).toContain('onChatOpen={onProjectChatOpen}');
    expect(detailSource).not.toContain('Recent decisions');
    expect(detailSource).not.toContain('최근 작업 범위를 프로젝트 단위로 고정');
    expect(detailSource).not.toContain('배포 전 런타임 헬스 체크 유지');
    expect(detailSource).not.toContain('workspace path');
  });

  it('wires the prototype chat controls to real project-chat state', () => {
    expect(projectChatSurfaceUtils).toContain("export type ComposerMode = 'agent' | 'plan' | 'terminal';");
    expect(projectChatSurfaceUtils).toContain("export type WorkspaceTab = 'run' | 'files' | 'git' | 'terminal' | 'context' | 'subagents';");
    expect(projectChatSurfaceUtils).toContain("export type PreviewState = 'closed' | 'open' | 'dock';");
    expect(projectChatSurface).toContain('const [composerMode, setComposerMode] = useState<ComposerMode>');
    expect(projectChatSurface).toContain('const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>');
    expect(projectChatSurface).toContain('const [workspaceOpen, setWorkspaceOpen] = useState(true);');
    expect(projectChatSurface).toContain('const [previewState, setPreviewState] = useState<PreviewState>');
    expect(projectChatSurface).toContain('const [modelSelectorOpen, setModelSelectorOpen] = useState(false);');
    expect(projectChatSurfaceUtils).toContain("export type ExpandedTurnState = string | null | '__none__';");
    expect(projectChatSurface).toContain('const [expandedTurnId, setExpandedTurnId] = useState<ExpandedTurnState>');
    expect(projectChatSurface).toContain("expandedTurnId === '__none__'");
    expect(projectChatSurface).toContain("visibleExpandedTurnId === item.id ? '__none__' : item.id");
    expect(projectChatSurface).toContain('void copyToClipboard');
    expect(projectChatSurface).toContain("setComposerMode(mode)");
    expect(projectChatSurface).toContain("setWorkspaceTab(tab)");
    expect(projectChatSurface).toContain('const openWorkspacePanel = useCallback(() => {');
    expect(projectChatSurface).toContain('const closeWorkspacePanel = useCallback(() => {');
    expect(projectChatSurface).toContain("setPreviewState('open')");
    expect(projectChatSurface).toContain("setPreviewState('dock')");
    expect(projectChatSurface).toContain('data-preview-overlay');
    expect(projectChatSurface).toContain('className={`ms${modelSelectorOpen ?');
    expect(projectChatSurface).toContain("body: JSON.stringify({");
    expect(projectChatSurface).toContain("mode: composerMode");
  });

  it('renders project chat action events through a dedicated action-card branch', () => {
    // Event classifier and run-indicator helpers now live in helpers/projectChatEvents.ts.
    expect(projectChatEventsHelper).toContain('export function isProjectActionEvent(event: UiEvent): boolean');
    expect(projectChatEventsHelper).toContain('export function isProjectRunStatusEvent(event: UiEvent): boolean');
    expect(projectChatSurfaceUtils).toContain('export function resolveProjectRunIndicator(');

    // ProjectRunStatusChip and ProjectActionCard are now standalone components.
    expect(projectRunStatusChip).toContain('export function ProjectRunStatusChip({ event }: { event: UiEvent })');
    expect(projectActionCard).toContain('export function ProjectActionCard({');

    // Inline brand marks moved to helpers/actionMarks.tsx.
    expect(actionMarksHelper).toContain('export function GitActionMark({ size = 12 }: { size?: number })');
    expect(actionMarksHelper).toContain('export function DockerActionMark({ size = 12 }: { size?: number })');

    // Per-kind icon/label/tone mapping lives in helpers/projectChatEvents.ts.
    expect(projectChatEventsHelper).toContain("if (kind === 'file_read') return { Icon: FileSearch, label: 'Read', tone: 'read' };");
    expect(projectChatEventsHelper).toContain("if (kind === 'file_write') return { Icon: FilePenLine, label: 'Write', tone: 'write' };");
    expect(projectChatEventsHelper).toContain("if (kind === 'file_list') return { Icon: FolderTree, label: 'List', tone: 'list' };");
    expect(projectChatEventsHelper).toContain("if (kind === 'think') return { Icon: Brain, label: 'Thinking', tone: 'think' };");
    expect(projectChatEventsHelper).toContain("if (kind === 'git_execution') return { Icon: GitActionMark, label: 'Git', tone: 'git' };");
    expect(projectChatEventsHelper).toContain("if (kind === 'docker_execution') return { Icon: DockerActionMark, label: 'Docker', tone: 'docker' };");
    expect(projectChatEventsHelper).toContain("return { Icon: TerminalSquare, label: 'Run', tone: 'run' };");

    // Command-token rendering moved to helpers/commandTokens.tsx.
    expect(commandTokensHelper).toContain('export function renderCommandTokens(command: string)');
    expect(commandTokensHelper).toContain('export function commandTokenClass(token: string, tokenIndex: number): string');

    // ProjectChatSurface routes events through dedicated run-status and action-card branches.
    expect(projectChatSurface).toContain('const runStatusEvent = !isUser && !isTerminal && isProjectRunStatusEvent(item);');
    expect(projectChatSurface).toContain('if (runStatusEvent) {');
    expect(projectChatSurface).toContain('className={`msg msg--run-status');
    expect(projectChatSurface).toContain('<ProjectRunStatusChip event={item} />');
    expect(projectRunStatusChip).toContain('className="pc-run-status__icon" aria-hidden="true"><Icon size={12} /></span>');
    expect(projectChatSurface).toContain("if (d.kind === 'action') {");
    expect(projectChatSurface).toContain('<ProjectActionCard');

    // The action-card JSX (stack/card/connector/result) is owned by ProjectActionCard.tsx.
    expect(projectActionCard).toContain('data-project-action-card');
    expect(projectActionCard).toContain('className="pc-action-stack"');
    expect(projectActionCard).toContain('className="pc-action-card"');
    expect(projectActionCard).toContain('className="pc-action-connector" aria-hidden="true" />');
    expect(projectActionCard).toContain('className="pc-action-result"');
    expect(projectActionCard).toContain('className="pc-action-result__body"');

    // Action commands still copy through the shared handler.
    expect(projectChatSurface).toContain("handleCopy(eventCommand(item), 'Action command')");
    expect(projectChatSurface).not.toContain('const toolLike = !isUser && isToolLikeEvent(item);');
  });

  it('surfaces the active project chat run with a spinner and elapsed timer', () => {
    expect(projectChatSurface).toContain("import { useSessionRuntime } from '@/lib/hooks/useSessionRuntime';");
    expect(projectChatSurface).toContain('const [submittedRunStartedAt, setSubmittedRunStartedAt] = useState<string | null>(null);');
    expect(projectChatSurface).toContain('const [runtimeRunStartedAt, setRuntimeRunStartedAt] = useState<string | null>(null);');
    expect(projectChatSurface).toContain('const [projectRunNowMs, setProjectRunNowMs] = useState(() => Date.now());');
    expect(projectChatSurface).toContain('const { isRunning: runtimeRunning } = useSessionRuntime(');
    expect(projectChatSurface).toContain('const activeRunStartedAt = submittedRunStartedAt ?? runtimeRunStartedAt;');
    expect(projectChatSurface).toContain('const projectRunIndicator = resolveProjectRunIndicator({');
    expect(projectChatSurface).toContain('runtimeRunning,');
    expect(projectChatSurfaceUtils).toContain('const localStartAfterLatestLifecycle =');
    expect(projectChatSurface).toContain('startedAt: activeRunStartedAt,');
    expect(projectChatSurface).toContain('setSubmittedRunStartedAt(submittedAt);');
    expect(projectChatSurface).toContain('if (!runtimeRunning) {');
    expect(projectChatSurface).toContain('setRuntimeRunStartedAt(null);');
    expect(projectChatSurface).toContain('setRuntimeRunStartedAt((current) => lifecycleStartedAt ?? current ?? submittedRunStartedAt ?? new Date().toISOString());');
    expect(projectChatSurface).toContain('setSubmittedRunStartedAt(null);');
    expect(projectChatSurface).toContain('const projectRunActive = Boolean(projectRunIndicator);');
    expect(projectChatSurface).toContain('<span className="ch__running-indicator" role="status" aria-live="polite" data-tone={projectRunIndicator.tone}>');
    expect(projectChatSurface).toContain('<span className="ch__running-spinner" aria-hidden="true" />');
    expect(projectChatSurface).toContain('{projectRunIndicator.label}');
    expect(projectChatSurface).toContain('<time className="ch__running-elapsed" dateTime={projectRunIndicator.startedAt}>');
    expect(projectChatSurface).toContain('{formatElapsedDuration(projectRunIndicator.startedAt, projectRunNowMs)}');
    expect(projectChatSurface).toContain('{projectRunActive ? (');
    expect(projectChatSurface).toContain('disabled={isAborting}');
    expect(projectChatSurface).toContain('disabled={!projectRunActive}');
  });

  it('renders project chat text replies through the shared markdown renderer', () => {
    expect(projectChatSurface).toContain("import { MarkdownContent } from '@/components/chat/MarkdownContent';");
    expect(projectChatSurface).toContain('<div className="msg__text"><MarkdownContent body={getEventText(item)} /></div>');
    expect(projectChatSurface).toContain('<div className="chturn__agent-text"><MarkdownContent body={item.agentText} /></div>');
  });

  it('routes Terminal composer submissions through the command execution endpoint', () => {
    const surfaceStart = projectChatSurface.indexOf('export function ProjectChatSurface({');
    const submitStart = projectChatSurface.indexOf('const handleSubmit = async', surfaceStart);
    const submitEnd = projectChatSurface.indexOf('const handleStopActiveChat', submitStart);
    const submitSource = projectChatSurface.slice(submitStart, submitEnd);

    expect(submitSource).toContain("const isTerminalMode = composerMode === 'terminal';");
    expect(submitSource).toContain('const endpoint = withAppBasePath(isTerminalMode ? buildProjectRuntimeTerminalPath(projectId) : buildProjectRuntimeEventsPath(projectId));');
    expect(submitSource).toContain('command: text,');
    expect(submitSource).toContain("const body = (await response.json().catch(() => ({}))) as { event?: UiEvent; events?: UiEvent[]; error?: string };");
    expect(submitSource).toContain('const submittedEvents = isTerminalMode');
    expect(submitSource).toContain('setEvents((previous) => mergeProjectChatEvents([...previous, ...submittedEvents]));');
  });

  it('does not use runtime metadata as the model when creating a project chat', () => {
    const surfaceStart = projectChatSurface.indexOf('export function ProjectChatSurface({');
    const createChatStart = projectChatSurface.indexOf('const createChat = async', surfaceStart);
    const createChatEnd = projectChatSurface.indexOf('const handleNewChat = async', createChatStart);
    const createChatSource = projectChatSurface.slice(createChatStart, createChatEnd);

    expect(createChatSource).toContain('selectedModelId || session.model');
    expect(createChatSource).not.toContain('session.metadata?.runtimeModel');
  });

  it('renders Terminal command output as a Terminal timeline response with its own avatar', () => {
    expect(projectChatEventsHelper).toContain("function readEventRole(event: UiEvent): 'user' | 'agent' | 'terminal'");
    expect(projectChatEventsHelper).toContain("if (event.meta?.role === 'terminal') return 'terminal';");
    expect(projectChatSurface).toContain('const isTerminal = role === \'terminal\';');
    expect(projectChatSurface).toContain('data-terminal-response');
    expect(projectChatSurface).toContain('className="msg__terminal-command"');
    expect(projectChatSurface).toContain('<Terminal size={14} />');
    expect(projectChatSurface).toContain("{isUser ? 'You' : isTerminal ? 'Terminal' : agentLabel(activeAgent, activeModelLabel)}");
    expect(cssBlock('.pc-proto .msg__avatar--terminal')).toContain('background: var(--n-900);');
    expect(cssBlock('.pc-proto .msg__terminal-output')).toContain('font-family: var(--font-mono);');
  });

  it('marks command execution results as Terminal-authored events', () => {
    expect(terminalRoute).toContain('runChatTerminalCommand({');
    expect(terminalRoute).toContain('command,');
    expect(terminalRoute).not.toContain("from 'node:child_process'");
    expect(terminalRoute).not.toContain('execAsync(command');
    expect(terminalRoute).not.toContain('appendSessionMessage');
    expect(terminalRoute).not.toContain("role: 'agent'");
    expect(terminalRoute).not.toContain("displayRole: 'terminal'");
    expect(terminalRoute).not.toContain("role: 'user'");
    expect(terminalRoute).toContain('return NextResponse.json({ events });');
  });

  it('uses the prototype workspace panel icon and toggle wiring in the chat header', () => {
    const marker = 'className="ch__action ch__action--ws"';
    const markerIndex = projectChatSurface.indexOf(marker);
    const workspaceAction = projectChatSurface.slice(
      projectChatSurface.lastIndexOf('<button', markerIndex),
      projectChatSurface.indexOf('</button>', markerIndex) + '</button>'.length,
    );

    expect(workspaceAction).toContain(marker);
    expect(workspaceAction).toContain('id="wsToggle"');
    expect(workspaceAction).toContain('aria-label="Toggle workspace"');
    expect(workspaceAction).toContain('title="Workspace"');
    expect(workspaceAction).toContain('aria-pressed={workspaceOpen}');
    expect(workspaceAction).toContain('onClick={toggleWorkspacePanel}');
    expect(workspaceAction).toContain('ref={workspaceToggleRef}');
    expect(workspaceAction).toContain('<PanelRight size={14} />');
    expect(workspaceAction).not.toContain('PanelsTopLeft');
    expect(projectChatSurface).toContain('const toggleWorkspacePanel = () => {');
    expect(projectChatSurface).toContain('if (workspaceOpen) {');
    expect(projectChatSurface).toContain('closeWorkspacePanel();');
    expect(projectChatSurface).toContain('openWorkspacePanel();');
    expect(projectChatSurface).toContain('<div className="ws__title ws-pane__title"><PanelRight size={14} />Workspace</div>');
  });

  it('shows the workspace panel from the header toggle on compact project chat layouts', () => {
    expect(projectChatSurface).toContain('data-workspace-ready={workspaceLayoutReady ? \'true\' : \'false\'}');
    expect(projectChatSurface).toContain("window.matchMedia('(max-width: 1100px)')");
    expect(projectChatSurface).toContain('const defaultWorkspaceOpen = () => !window.matchMedia');
    expect(projectChatSurface).toContain('setWorkspaceLayoutReady(true);');
    expect(projectChatSurface).not.toContain('setWorkspaceLayoutReady(false);');
    expect(projectChatSurface).toContain("const [workspaceDrawerPhase, setWorkspaceDrawerPhase] = useState<'idle' | 'closing'>('idle');");
    expect(projectChatSurface).toContain("data-workspace={workspaceDrawerPhase === 'closing' ? 'closing' : workspaceOpen ? 'open' : 'closed'}");
    expect(projectChatSurface).toContain('const closeWorkspacePanel = useCallback(() => {');
    expect(projectChatSurface).toContain("setWorkspaceDrawerPhase('closing');");
    expect(projectChatSurface).toContain('const workspaceRef = useRef<HTMLElement | null>(null);');
    expect(projectChatSurface).toContain('const workspaceToggleRef = useRef<HTMLButtonElement | null>(null);');
    expect(projectChatSurface).toContain('const handleWorkspaceOutsideClick = (event: PointerEvent) => {');
    expect(projectChatSurface).toContain("document.addEventListener('pointerdown', handleWorkspaceOutsideClick);");
    expect(projectChatSurface).toContain('const handleWorkspaceEscape = (event: KeyboardEvent) => {');
    expect(projectChatSurface).toContain("event.key !== 'Escape'");
    expect(projectChatSurface).toContain("document.addEventListener('keydown', handleWorkspaceEscape);");
    expect(projectChatSurface).toContain('<aside ref={workspaceRef} className="shell__workspace ws ws-pane"');
    expect(uiCss).toContain('.pc-proto[data-workspace-ready="true"][data-workspace="open"] .shell__workspace');
    expect(uiCss).toContain('.pc-proto[data-workspace-ready="true"][data-workspace="closing"] .shell__workspace');
    expect(uiCss).toContain('top: 0;\n    right: 0;\n    bottom: 0;');
    expect(uiCss).not.toContain('top: 52px;\n    right: 0;\n    bottom: 0;');
    expect(uiCss).toContain('width: min(420px, calc(100vw - 32px));');
    expect(uiCss).toContain('box-shadow: -18px 0 44px rgba(15, 23, 42, 0.18);');
    expect(uiCss).toContain('animation: pc-workspace-drawer-in 180ms var(--ease-smooth) both;');
    expect(uiCss).toContain('animation: pc-workspace-drawer-out 160ms var(--ease-smooth) both;');
    expect(uiCss).toContain('@keyframes pc-workspace-drawer-in');
    expect(uiCss).toContain('@keyframes pc-workspace-drawer-out');
    expect(uiCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(uiCss).toContain('animation: none;');
  });

  it('matches the workspace panel header to the chat-screen-v1 prototype', () => {
    expect(projectChatSurface).toContain('<div className="ws__head ws-pane__header">');
    expect(projectChatSurface).toContain('<div className="ws__title ws-pane__title"><PanelRight size={14} />Workspace</div>');
    expect(projectChatSurface).toContain('<div className="ws__actions ws-pane__actions">');
    expect(projectChatSurface).toContain('className="ws__action ws-pane__action btn btn--ghost btn--icon btn--sm"');
    expect(uiCss).toContain('.pc-proto .ws-pane__header {');
    expect(uiCss).toContain('height: 52px;');
    expect(uiCss).toContain('padding: 0 var(--sp-8);');
    expect(uiCss).toContain('border-bottom: 1px solid var(--border-subtle);');
    expect(uiCss).toContain('--ls-snug: -0.014em;');
    expect(uiCss).toContain('.pc-proto .ws-pane__title {');
    expect(uiCss).toContain('letter-spacing: var(--ls-snug);');
  });

  it('matches the workspace panel top navigation to the chat-screen-v1 prototype', () => {
    expect(projectWorkspacePanelParts).toContain('File as FileIcon,');
    expect(projectWorkspacePanelParts).toContain('Clock,');
    expect(projectWorkspacePanelParts).toContain("{ id: 'run', label: 'Run', Icon: Clock }");
    expect(projectWorkspacePanelParts).toContain("{ id: 'files', label: 'Files', Icon: FileIcon }");
    expect(projectWorkspacePanelParts).toContain("{ id: 'git', label: 'Git', Icon: GitActionMark }");
    expect(projectChatSurfaceCombined).not.toContain('<span className="ws__tab-badge">{fileCount}</span>');
    expect(projectWorkspacePanelParts).toContain("{ id: 'terminal', label: 'Terminal', Icon: Terminal }");
    expect(projectWorkspacePanelParts).toContain("{ id: 'context', label: 'Context', Icon: PanelsTopLeft }");
    expect(projectChatSurfaceCombined).not.toContain('<Terminal size={12} />Term</button>');
    expect(projectChatSurfaceCombined).not.toContain('<Database size={12} />Ctx</button>');
    expect(uiCss).toContain('padding: 0 var(--sp-4);');
    expect(uiCss).toContain('background: var(--surface);');
    expect(uiCss).toContain('border-bottom: 2px solid transparent;');
    expect(uiCss).toContain('margin-bottom: -1px;');
    expect(uiCss).toContain('.pc-proto .ws__tab[aria-pressed="true"] {');
    expect(uiCss).toContain('border-bottom-color: var(--b-500);');
    expect(uiCss).not.toContain('border-radius: var(--r-md) var(--r-md) 0 0;');
  });

  it('keeps the workspace metrics while restyling run details as chat-screen-v1 cards', () => {
    expect(projectChatSurface).toContain('<div className="run-summary">');
    expect(projectChatSurface).toContain('<span className="run-summary__label">Steps</span>');
    expect(projectChatSurface).toContain('<span className="run-summary__label">Tokens</span>');
    expect(projectChatSurface).toContain('<span className="run-summary__label">Activity</span>');
    expect(projectChatSurface).toContain('className="ws-card ws-card--run"');
    expect(projectChatSurface).toContain('className="chist ws-card ws-card--history"');
    expect(projectChatSurface).toContain('className="ws-card__head"');
    expect(projectChatSurface).toContain('className="ws-card__title">Run ·');
    expect(projectChatSurface).toContain('className="ws-card__meta"');
    expect(projectChatSurface).toContain('className="run-step ws-run-step"');
    expect(projectChatSurface).toContain('className="run-step__dot ws-run-step__dot run-step__dot--done ws-run-step__dot--done"');
    expect(projectChatSurface).toContain('className="run-step__body ws-run-step__body"');
    expect(projectChatSurface).toContain('className="run-step__time ws-run-step__time"');
    expect(projectChatSurface).toContain('className="ws-empty-state"');
    expect(uiCss).toContain('.pc-proto .ws-card {');
    expect(uiCss).toContain('.pc-proto .ws-card__head {');
    expect(uiCss).toContain('.pc-proto .ws-run-step {');
    expect(uiCss).toContain('.pc-proto .ws-empty-state {');
    expect(uiCss).toContain('grid-template-columns: auto minmax(0, 1fr) auto;');
  });

  it('renders functional workspace panes instead of one static Run panel', () => {
    expect(projectChatSurface).toContain("workspaceTab === 'run'");
    expect(projectChatSurfaceCombined).toContain("workspaceTab === 'files'");
    expect(projectChatSurface).toContain("workspaceTab === 'terminal'");
    expect(projectChatSurface).toContain("workspaceTab === 'context'");
    expect(projectChatSurface).toContain('data-pane="run"');
    expect(projectChatSurfaceCombined).toContain('data-pane="files"');
    expect(projectChatSurface).toContain('data-pane="terminal"');
    expect(projectChatSurface).toContain('data-pane="context"');
    expect(projectChatSurface).toContain('data-preview-dock');
    expect(projectChatSurface).toContain('data-copy-feedback');
  });

  it('keeps project chats nested under the selected project in the redesigned sidebar', () => {
    expect(homeClient).toContain('activeProjectChatId: string | null;');
    expect(homeClient).toContain('className={`m-sb__project-node${isProjectExpanded ?');
    expect(homeClient).toContain('const visibleChatCount = session.totalChats ?? childChats.length;');
    expect(homeClient).toContain('<span className="m-sb__proj-count">{visibleChatCount}</span>');
    expect(homeClient).toContain('className="m-sb__chat-children"');
    expect(homeClient).toContain("className={`m-sb__chat-child${activeProjectChatId === chat.id ? ' m-sb__chat-child--active' : ''}`}");
    expect(homeClient).toContain("onClick={() => onProjectChatOpen(session.id, chat.id)}");
    expect(homeClient).toContain("setSelectedProjectChatId(nextTab === 'project' && nextProjectView === 'chat' ? (searchParams.get('chat') ?? null) : null);");
  });

  it('lets multiple project sidebar chat groups expand independently and page in five chats at a time', () => {
    expect(homeClient).toContain('const SIDEBAR_PROJECT_CHAT_PAGE_SIZE = 5;');
    expect(homeClient).toContain('const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(() => new Set());');
    expect(homeClient).toContain('const [projectChatsById, setProjectChatsById] = useState<Record<string, SessionChat[]>>({});');
    expect(homeClient).toContain('const [visibleProjectChatCounts, setVisibleProjectChatCounts] = useState<Record<string, number>>({});');
    expect(homeClient).toContain('function toggleProjectChatGroup(sessionId: string)');
    expect(homeClient).toContain('function showMoreProjectChats(sessionId: string)');
    expect(homeClient).toContain("params.set('limit', String(limit));");
    expect(homeClient).toContain('next[sessionId] = currentCount + SIDEBAR_PROJECT_CHAT_PAGE_SIZE;');
    expect(homeClient).toContain('expandedProjectIds.has(session.id)');
    expect(homeClient).toContain('childChats.slice(0, visibleSidebarChatLimit).map((chat) => (');
    expect(homeClient).toContain('const hasMoreProjectChats = visibleChatCount > childChats.length;');
    expect(homeClient).toContain('className="m-sb__chat-more"');
    expect(homeClient).toContain('aria-expanded={isProjectExpanded}');
  });

  it('uses the sidebar project row for expand and exposes icon-only project actions', () => {
    expect(homeClient).toContain('const [creatingProjectChatIds, setCreatingProjectChatIds] = useState<Set<string>>(() => new Set());');
    expect(homeClient).toContain('async function createSidebarProjectChat(session: SessionSummary)');
    expect(homeClient).toContain('onClick={() => toggleProjectChatGroup(session.id)}');
    expect(homeClient).toContain('className="m-sb__proj-actions"');
    expect(homeClient).toContain('aria-label={`${projectName} 새 채팅`}');
    expect(homeClient).toContain('void createSidebarProjectChat(session);');
    expect(homeClient).toContain('aria-label={`${projectName} 프로젝트 화면 들어가기`}');
    expect(homeClient).toContain('onProjectOpen(session.id);');
    expect(homeClient).not.toContain('className="m-sb__chat-toggle"');
    expect(exactCssBlock('.m-sb__proj-row')).toContain('grid-template-columns: minmax(0, 1fr) auto;');
    expect(exactCssBlock('.m-sb__proj-action')).toContain('width: 24px;');
  });

  it('keeps project rows free of status dots and extends active background behind actions', () => {
    expect(homeClient).not.toContain('m-sb__proj-dot');
    expect(homeClient).toContain("className={`m-sb__proj-row${isActiveProject ? ' m-sb__proj-row--active' : ''}`}");
    expect(homeClient).toContain("className={`m-sb__proj${isActiveProject ? ' m-sb__proj--active' : ''}`}");
    expect(uiCss).not.toContain('.m-sb__proj-dot');
    expect(exactCssBlock('.m-sb__proj-row--active')).toContain('background: var(--b-50);');
    expect(uiCss).toContain(".m-sb__proj-row--active .m-sb__proj-action");
  });

  it('keeps sidebar project and chat rows height-stable when active selection changes', () => {
    expect(uiCss).toMatch(/\.m-sb__nav-item,\n\.m-sb__proj\s*\{[\s\S]*height:\s*30px;[\s\S]*line-height:\s*1;/);
    expect(exactCssBlock('.m-sb__proj-row')).toContain('height: 30px;');
    expect(uiCss).toMatch(/\.m-sb__chat-child,\n\.m-sb__chat-loading,\n\.m-sb__chat-more\s*\{[\s\S]*height:\s*28px;[\s\S]*line-height:\s*1;/);
    expect(exactCssBlock('.m-sb__chat-child--active')).not.toContain('font-weight');
  });

  it('does not keep inserting sidebar loading rows for projects with fewer than five chats', () => {
    expect(homeClient).toContain('const totalProjectChats = session.totalChats;');
    expect(homeClient).toContain("const targetCount = typeof totalProjectChats === 'number' ? Math.min(visibleCount, totalProjectChats) : visibleCount;");
    expect(homeClient).toContain('if (targetCount <= 0 || loadedCount >= targetCount) return;');
    expect(homeClient).toContain('isLoadingProjectChats && childChats.length === 0');
    expect(homeClient).toContain('childChats.length > 0 && hasMoreProjectChats');
  });

  it('ships the project list CSS copied into the app stylesheet', () => {
    [
      '.proj-list-wrap',
      '.proj-list-toolbar',
      '.proj-list-search',
      '.proj-list-chips',
      '.proj-list-chip--active',
      '.proj-list-grid',
      '.proj-list-card',
      '.proj-list-card--new',
      '.proj-list-stats',
      '.proj-list-new-btn',
      '.pc-chat-directory',
      '.pc-chat-card',
      '.pc-proto .shell',
      '.pc-proto .ch',
      '.pc-proto .ch__running-indicator',
      '.pc-proto .ch__running-spinner',
      '.pc-proto .tl',
      '.pc-proto .msg',
      '.pc-proto .msg--action',
      '.pc-proto .msg--run-status',
      '.pc-proto .pc-run-status',
      '.pc-proto .pc-action-stack',
      '.pc-proto .pc-action-card',
      '.pc-proto .pc-action-card__kind',
      '.pc-proto .pc-action-card__primary',
      '.pc-proto .pc-action-result',
      '.pc-proto .tool',
      '.pc-proto .code',
      '.pc-proto .artifact',
      '.pc-proto .cmp',
      '.pc-proto .ws',
      '.m-sb__chat-children',
      '.m-sb__chat-child',
      '.m-sb__chat-toggle',
      '.m-sb__chat-more',
    ].forEach((selector) => {
      expect(uiCss).toContain(selector);
    });

    [
      '.proj-chat-screen',
      '.proj-chat-list',
      '.proj-chat-main',
      '.proj-chat-timeline',
      '.proj-chat-composer',
    ].forEach((selector) => {
      expect(uiCss).not.toContain(selector);
    });

    expect(cssBlock('.m-main-scroll--project-chat-detail')).toContain('padding: 0;');
    expect(uiCss).toContain('grid-template-columns: minmax(0, 1fr) 420px;');
    expect(cssBlock('.pc-proto .tl')).toContain('padding: var(--sp-12) var(--sp-10) var(--sp-24);');
    expect(cssBlock('.pc-proto .cmp')).toContain('border-radius: 14px;');
    expect(cssBlock('.pc-proto .msg--action')).toContain('width: 100%;');
    expect(cssBlock('.pc-proto .msg--action')).toContain('box-sizing: border-box;');
    expect(cssBlock('.pc-proto .msg--action')).toContain('padding-left: calc(28px + var(--sp-4));');
    expect(cssBlock('.pc-proto .msg--run-status')).toContain('justify-content: center;');
    expect(cssBlock('.pc-proto .msg--run-status')).toContain('gap: var(--sp-4);');
    expect(cssBlock('.pc-proto .msg--run-status')).toContain('padding: var(--sp-1) var(--sp-8);');
    expect(cssBlock('.pc-proto .msg--run-status::before,\n.pc-proto .msg--run-status::after')).toContain('flex: 1 1 0;');
    expect(cssBlock('.pc-proto .msg--run-status::before,\n.pc-proto .msg--run-status::after')).toContain('background: color-mix(in srgb, var(--border-default) 58%, transparent);');
    expect(cssBlock('.pc-proto .pc-run-status')).toContain('display: inline-flex;');
    expect(cssBlock('.pc-proto .pc-run-status')).toContain('flex: 0 0 auto;');
    expect(cssBlock('.pc-proto .pc-run-status')).toContain('border-radius: var(--r-full);');
    expect(cssBlock('.pc-proto .pc-run-status[data-tone="done"]')).toContain('--pc-run-status-accent: var(--success-fg);');
    expect(cssBlock('.pc-proto .pc-run-status__icon')).toContain('border-radius: var(--r-full);');
    expect(cssBlock('.pc-proto .ch__running-indicator')).toContain('font-variant-numeric: tabular-nums;');
    expect(cssBlock('.pc-proto .ch__running-spinner')).toContain('animation: pc-spin 0.85s linear infinite;');
    expect(uiCss).toContain('@keyframes pc-spin');
    expect(cssBlock('.pc-proto .pc-action-stack')).toContain('display: grid;');
    expect(cssBlock('.pc-proto .pc-action-stack')).toContain('position: relative;');
    expect(cssBlock('.pc-proto .pc-action-stack')).toContain('width: 100%;');
    expect(cssBlock('.pc-proto .pc-action-stack')).toContain('max-width: 100%;');
    expect(cssBlock('.pc-proto .pc-action-stack')).toContain('--pc-action-connector-opacity: 0.42;');
    expect(cssBlock("html[data-theme='dark'] .pc-proto .pc-action-stack")).toContain('--pc-action-connector-opacity: 0.34;');
    expect(cssBlock('.pc-proto .pc-action-stack[data-kind="git"]')).toContain('--pc-action-accent: #f05033;');
    expect(cssBlock('.pc-proto .pc-action-stack[data-kind="docker"]')).toContain('--pc-action-accent: #2496ed;');
    expect(cssBlock('.pc-proto .pc-action-card')).toContain('display: inline-flex;');
    expect(cssBlock('.pc-proto .pc-action-card')).toContain('width: 100%;');
    expect(cssBlock('.pc-proto .pc-action-card')).toContain('max-width: 100%;');
    expect(cssBlock('.pc-proto .pc-action-card')).toContain('overflow: hidden;');
    expect(cssBlock('.pc-proto .pc-action-card')).toContain('padding: 7px 10px 7px 6px;');
    expect(cssBlock('.pc-proto .pc-action-card__kind')).toContain('width: 22px;');
    expect(cssBlock('.pc-proto .pc-action-card__kind')).toContain('background: var(--pc-action-accent);');
    expect(cssBlock('.pc-proto .pc-action-card__cmd')).toContain('display: block;');
    expect(cssBlock('.pc-proto .pc-action-card__cmd')).toContain('white-space: nowrap;');
    expect(cssBlock('.pc-proto .pc-action-token--bin')).toContain('font-weight: 700;');
    expect(cssBlock('.pc-proto .pc-action-token--flag')).toContain('color: var(--info-fg);');
    expect(cssBlock('.pc-proto .pc-action-result')).toContain('display: block;');
    expect(cssBlock('.pc-proto .pc-action-result')).toContain('width: 100%;');
    expect(cssBlock('.pc-proto .pc-action-connector')).toContain('position: absolute;');
    expect(cssBlock('.pc-proto .pc-action-connector')).toContain('left: calc(-1 * (var(--sp-4) + 18px));');
    expect(cssBlock('.pc-proto .pc-action-connector')).toContain('top: var(--pc-action-card-center, 22px);');
    expect(cssBlock('.pc-proto .pc-action-connector')).toContain('width: 18px;');
    expect(cssBlock('.pc-proto .pc-action-connector')).toContain('height: max(38px, calc(var(--pc-action-result-center, 82px) - var(--pc-action-card-center, 22px)));');
    expect(cssBlock('.pc-proto .pc-action-connector')).toContain('opacity: var(--pc-action-connector-opacity);');
    expect(cssBlock('.pc-proto .pc-action-connector::before')).toContain('border-top: 2px solid currentColor;');
    expect(cssBlock('.pc-proto .pc-action-connector::before')).toContain('height: 100%;');
    expect(cssBlock('.pc-proto .pc-action-connector::before')).toContain('border-left: 2px solid currentColor;');
    expect(cssBlock('.pc-proto .pc-action-connector::before')).toContain('border-bottom: 2px solid currentColor;');
    expect(cssBlock('.pc-proto .pc-action-connector::before')).toContain('border-top-left-radius: 7px;');
    expect(cssBlock('.pc-proto .pc-action-connector::before')).toContain('border-bottom-left-radius: 7px;');
    expect(cssBlock('.pc-proto .pc-action-result__body')).toContain('width: 100%;');
    expect(cssBlock('.pc-proto .pc-action-result__body')).toContain('padding: var(--sp-4);');
    expect(cssBlock('.pc-proto .pc-action-result__body')).toContain('white-space: pre-wrap;');
    expect(uiCss).toContain('padding-left: calc(28px + var(--sp-3));');
    expect(cssBlock('.pc-proto .ws__pane')).toContain('display: none;');
    expect(cssBlock('.pc-proto .ws__pane--active')).toContain('display: flex;');
    expect(uiCss).toContain('.pc-proto[data-workspace="closed"] .shell');
    expect(uiCss).toContain('.pc-proto[data-preview="open"] .overlay');
    expect(uiCss).toContain('.pc-proto[data-preview="dock"] .preview-dock-wrap');
    expect(homeClient).not.toContain('chats total`');
  });

  it('keeps the docked preview above the composer instead of overlapping it', () => {
    expect(projectChatSurface).toContain('const prototypeRef = useRef<HTMLDivElement | null>(null);');
    expect(projectChatSurface).toContain('const composerWrapRef = useRef<HTMLElement | null>(null);');
    expect(projectChatSurface).toContain("prototypeNode.style.setProperty('--pc-composer-height'");
    expect(projectChatSurface).toContain('const composerObserver = new ResizeObserver(syncComposerHeight);');
    expect(projectChatSurface).toContain('ref={prototypeRef}');
    expect(projectChatSurface).toContain('<footer ref={composerWrapRef} className="cmp-wrap">');

    const dockWrap = cssBlock('.pc-proto .preview-dock-wrap');
    expect(uiCss).toContain('--pc-composer-height: 226px;');
    expect(dockWrap).toContain('bottom: calc(var(--pc-composer-height, 226px) + var(--sp-8));');
    expect(dockWrap).not.toContain('bottom: 92px;');
  });

  it('keeps the project chat prototype practical on mobile viewports', () => {
    expect(homeClient).toContain("const shouldShowBottomNav = !(activeTab === 'project' && selectedProjectView === 'chat');");
    expect(homeClient).toContain('{shouldShowBottomNav && <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />}');
    expect(homeClient).toContain("className={`app-shell app-shell-ia${shouldShowBottomNav ? '' : ' app-shell-ia--chat-screen'}${projectSurfaceMode === 'panel' ? ' app-shell-ia--project-panel' : ''}`}");
    expect(uiCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.app-shell-ia--chat-screen\s*\{[^}]*padding-bottom:\s*0;/s);
    expect(uiCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.app-shell-ia--chat-screen \.aris-ia-shell\s*\{[^}]*min-height:\s*var\(--app-vh,\s*100dvh\);/s);
    expect(uiCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.pc-proto\s*\{[^}]*min-height:\s*calc\(var\(--app-vh,\s*100dvh\) - 48px\);/s);
    expect(uiCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.pc-proto \.shell\s*\{[^}]*height:\s*calc\(var\(--app-vh,\s*100dvh\) - 48px\);[^}]*min-height:\s*0;/s);
    expect(uiCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.pc-proto\[data-chrome="hidden"\] \.shell\s*\{[^}]*height:\s*var\(--app-vh,\s*100dvh\);/s);
    expect(uiCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.pc-proto \.tl\s*\{[^}]*min-height:\s*0;/s);
    expect(uiCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.pc-proto \.cmp__top\s*\{[^}]*flex-direction:\s*row;[^}]*overflow-x:\s*auto;/s);
    expect(uiCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.pc-proto \.cmp__toolbar\s*\{[^}]*flex-direction:\s*row;/s);
    expect(uiCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.pc-proto \.cmp-mode\s*\{[^}]*width:\s*auto;/s);
    expect(uiCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.pc-proto \.cmp__right,\s*[\r\n ]+\.pc-proto \.cmp__send\s*\{[^}]*width:\s*auto;/s);
  });

  it('matches the chat-screen-v1 background hierarchy', () => {
    expect(cssBlock('.m-sb')).toContain('background: var(--surface);');
    expect(cssBlock('.m-main')).toContain('background: var(--canvas);');
    expect(cssBlock('.m-top')).toContain('background: var(--surface);');

    expect(exactCssBlock('.pc-proto')).toContain('background: var(--canvas);');
    expect(exactCssBlock('.pc-proto .shell')).toContain('background: var(--canvas);');
    expect(exactCssBlock('.pc-proto .shell__main')).toContain('background: var(--canvas);');
    expect(exactCssBlock('.pc-proto .ch')).toContain('background: var(--surface);');
    expect(exactCssBlock('.pc-proto .tl')).toContain('background: var(--canvas);');
    expect(exactCssBlock('.pc-proto .cmp-wrap')).toContain('background: var(--canvas);');
    expect(exactCssBlock('.pc-proto .shell__workspace')).toContain('background: var(--surface);');
    expect(exactCssBlock('.pc-proto .ws')).toContain('background: var(--surface);');
  });

  it('keeps the workspace column from growing the shell row when chat history entries expand', () => {
    // Grid items default to min-height: auto (content-based); without an explicit
    // override, an expanded chist__text entry can stretch the whole .shell row and
    // push the composer in .shell__main below the viewport.
    expect(exactCssBlock('.pc-proto .shell__main')).toContain('min-height: 0;');
    expect(exactCssBlock('.pc-proto .shell__workspace')).toContain('min-height: 0;');
  });

  it('keeps the project filter chips attached to the search field instead of the screen edge', () => {
    const toolbar = cssBlock('.proj-list-toolbar');
    const chips = cssBlock('.proj-list-chips');

    expect(toolbar).toContain('gap: var(--sp-3);');
    expect(chips).toContain('margin-left: 0;');
    expect(chips).not.toContain('margin-left: auto;');
  });
});
