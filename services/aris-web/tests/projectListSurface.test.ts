import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const homeClient = readFileSync(resolve(__dirname, '../app/HomePageClient.tsx'), 'utf8');
const uiCss = readFileSync(resolve(__dirname, '../app/styles/ui.css'), 'utf8');

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

  it('routes project card clicks to the IA project detail instead of the legacy session screen', () => {
    expect(homeClient).toContain("type ProjectView = 'overview' | 'chats' | 'chat' | 'files' | 'context';");
    expect(homeClient).toContain("function buildProjectDetailPath(sessionId: string, view: ProjectView = 'overview', chatId?: string | null)");
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
    expect(homeClient).toContain("const nextProjectView = nextTab === 'project' ? normalizeProjectView(searchParams.get('view')) : 'overview';");
    expect(homeClient).toContain('setSelectedProjectView(nextProjectView);');
    expect(homeClient).toContain('if (selectedProject) {');
  });

  it('keeps project chat inside the IA project route instead of opening the legacy session route', () => {
    expect(homeClient).toContain('function ProjectChatSurface({');
    expect(homeClient).toContain('data-project-chat-list');
    expect(homeClient).toContain('data-project-chat-screen');
    expect(homeClient).toContain('m-main-scroll--project-chat-detail');
    expect(homeClient).toContain("onClick={() => onProjectOpen(session.id, 'chats')}");
    expect(homeClient).toContain("onClick={() => onProjectViewChange('chats')}");
    expect(homeClient).toContain("onClick={() => onChatOpen(chat.id)}");
    expect(homeClient).toContain("onProjectChatOpen(session.id, chat.id)");
    expect(homeClient).toContain("setSelectedProjectView('chat');");
    expect(homeClient).toContain("buildProjectDetailPath(sessionId, 'chat', chatId)");
    expect(homeClient).toContain("params.set('view', view);");
    expect(homeClient).toContain('/api/runtime/sessions/${encodeURIComponent(session.id)}/chats');
    expect(homeClient).toContain('/api/runtime/sessions/${encodeURIComponent(session.id)}/events');
    expect(homeClient).toContain('pc-chat-empty-state');
    expect(homeClient).not.toContain('seed-history-primary');
    expect(homeClient).not.toContain('seed-context');
    expect(homeClient).not.toContain('Read · project context');
    expect(homeClient).not.toContain('project-context.snapshot');
    expect(homeClient).not.toContain('프로젝트 컨텍스트를 먼저 확인하겠습니다.');
    expect(homeClient).not.toContain('/sessions/${session.id}');
  });

  it('creates a project chat from the project detail header New chat button', () => {
    const detailStart = homeClient.indexOf('function ProjectDetailSurface({');
    const chatSurfaceStart = homeClient.indexOf('function ProjectChatSurface({');
    const detailSource = homeClient.slice(detailStart, chatSurfaceStart);

    expect(homeClient).toContain('async function createProjectSessionChat(');
    expect(detailSource).toContain('const handleProjectHeaderNewChat = async () => {');
    expect(detailSource).toContain('const projectModelInput = normalizeProjectChatModelInput(session.model ?? session.metadata?.runtimeModel);');
    expect(detailSource).toContain('const createdChat = await createProjectSessionChat(session.id, {');
    expect(detailSource).toContain('title: `Chat ${Math.max(1, totalChats + 1)}`,');
    expect(detailSource).toContain('agent: session.agent,');
    expect(detailSource).toContain('model: projectModelInput,');
    expect(detailSource).toContain("modelReasoningEffort: serializeReasoningEffort('High'),");
    expect(detailSource).toContain('onProjectChatOpen(createdChat.id);');
    expect(detailSource).toContain('disabled={isCreatingHeaderChat}');
    expect(detailSource).toContain('aria-busy={isCreatingHeaderChat}');
    expect(detailSource).toContain('onClick={handleProjectHeaderNewChat}');
    expect(detailSource).not.toContain('model: modelLabel,');
    expect(detailSource).not.toContain('className="btn btn--primary btn--sm" onClick={() => onProjectViewChange(\'chats\')}');
  });

  it('renders the project overview secondary card as real recent chats', () => {
    const detailStart = homeClient.indexOf('function ProjectDetailSurface({');
    const chatSurfaceStart = homeClient.indexOf('function ProjectChatSurface({');
    const detailSource = homeClient.slice(detailStart, chatSurfaceStart);

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
    expect(homeClient).toContain("type ComposerMode = 'agent' | 'plan' | 'terminal';");
    expect(homeClient).toContain("type WorkspaceTab = 'run' | 'files' | 'terminal' | 'context';");
    expect(homeClient).toContain("type PreviewState = 'closed' | 'open' | 'dock';");
    expect(homeClient).toContain('const [composerMode, setComposerMode] = useState<ComposerMode>');
    expect(homeClient).toContain('const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>');
    expect(homeClient).toContain('const [workspaceOpen, setWorkspaceOpen] = useState(true);');
    expect(homeClient).toContain('const [previewState, setPreviewState] = useState<PreviewState>');
    expect(homeClient).toContain('const [modelSelectorOpen, setModelSelectorOpen] = useState(false);');
    expect(homeClient).toContain("type ExpandedTurnState = string | null | '__none__';");
    expect(homeClient).toContain('const [expandedTurnId, setExpandedTurnId] = useState<ExpandedTurnState>');
    expect(homeClient).toContain("expandedTurnId === '__none__'");
    expect(homeClient).toContain("visibleExpandedTurnId === item.id ? '__none__' : item.id");
    expect(homeClient).toContain('void copyToClipboard');
    expect(homeClient).toContain("setComposerMode(mode)");
    expect(homeClient).toContain("setWorkspaceTab(tab)");
    expect(homeClient).toContain('const openWorkspacePanel = useCallback(() => {');
    expect(homeClient).toContain('const closeWorkspacePanel = useCallback(() => {');
    expect(homeClient).toContain("setPreviewState('open')");
    expect(homeClient).toContain("setPreviewState('dock')");
    expect(homeClient).toContain('data-preview-overlay');
    expect(homeClient).toContain('className={`ms${modelSelectorOpen ?');
    expect(homeClient).toContain("body: JSON.stringify({");
    expect(homeClient).toContain("mode: composerMode");
  });

  it('renders project chat action events through a dedicated action-card branch', () => {
    expect(homeClient).toContain('function isProjectActionEvent(event: UiEvent): boolean');
    expect(homeClient).toContain('function ProjectActionCard({');
    expect(homeClient).toContain('const actionEvent = !isUser && isProjectActionEvent(item);');
    expect(homeClient).toContain('if (actionEvent) {');
    expect(homeClient).toContain('data-project-action-card');
    expect(homeClient).toContain('className="pc-action-card"');
    expect(homeClient).toContain('className="pc-action-card__kind"');
    expect(homeClient).toContain('className="pc-action-card__primary"');
    expect(homeClient).toContain('className="pc-action-card__preview"');
    expect(homeClient).toContain("handleCopy(eventCommand(event), 'Action command')");
    expect(homeClient).not.toContain('const toolLike = !isUser && isToolLikeEvent(item);');
  });

  it('uses the prototype workspace panel icon and toggle wiring in the chat header', () => {
    const marker = 'className="ch__action ch__action--ws"';
    const markerIndex = homeClient.indexOf(marker);
    const workspaceAction = homeClient.slice(
      homeClient.lastIndexOf('<button', markerIndex),
      homeClient.indexOf('</button>', markerIndex) + '</button>'.length,
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
    expect(homeClient).toContain('const toggleWorkspacePanel = () => {');
    expect(homeClient).toContain('if (workspaceOpen) {');
    expect(homeClient).toContain('closeWorkspacePanel();');
    expect(homeClient).toContain('openWorkspacePanel();');
    expect(homeClient).toContain('<div className="ws__title ws-pane__title"><PanelRight size={14} />Workspace</div>');
  });

  it('shows the workspace panel from the header toggle on compact project chat layouts', () => {
    expect(homeClient).toContain('data-workspace-ready={workspaceLayoutReady ? \'true\' : \'false\'}');
    expect(homeClient).toContain("window.matchMedia('(max-width: 1100px)')");
    expect(homeClient).toContain('const defaultWorkspaceOpen = () => !window.matchMedia');
    expect(homeClient).toContain('setWorkspaceLayoutReady(true);');
    expect(homeClient).not.toContain('setWorkspaceLayoutReady(false);');
    expect(homeClient).toContain("const [workspaceDrawerPhase, setWorkspaceDrawerPhase] = useState<'idle' | 'closing'>('idle');");
    expect(homeClient).toContain("data-workspace={workspaceDrawerPhase === 'closing' ? 'closing' : workspaceOpen ? 'open' : 'closed'}");
    expect(homeClient).toContain('const closeWorkspacePanel = useCallback(() => {');
    expect(homeClient).toContain("setWorkspaceDrawerPhase('closing');");
    expect(homeClient).toContain('const workspaceRef = useRef<HTMLElement | null>(null);');
    expect(homeClient).toContain('const workspaceToggleRef = useRef<HTMLButtonElement | null>(null);');
    expect(homeClient).toContain('const handleWorkspaceOutsideClick = (event: PointerEvent) => {');
    expect(homeClient).toContain("document.addEventListener('pointerdown', handleWorkspaceOutsideClick);");
    expect(homeClient).toContain('const handleWorkspaceEscape = (event: KeyboardEvent) => {');
    expect(homeClient).toContain("event.key !== 'Escape'");
    expect(homeClient).toContain("document.addEventListener('keydown', handleWorkspaceEscape);");
    expect(homeClient).toContain('<aside ref={workspaceRef} className="shell__workspace ws ws-pane"');
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
    expect(homeClient).toContain('<div className="ws__head ws-pane__header">');
    expect(homeClient).toContain('<div className="ws__title ws-pane__title"><PanelRight size={14} />Workspace</div>');
    expect(homeClient).toContain('<div className="ws__actions ws-pane__actions">');
    expect(homeClient).toContain('className="ws__action ws-pane__action btn btn--ghost btn--icon btn--sm"');
    expect(uiCss).toContain('.pc-proto .ws-pane__header {');
    expect(uiCss).toContain('height: 52px;');
    expect(uiCss).toContain('padding: 0 var(--sp-8);');
    expect(uiCss).toContain('border-bottom: 1px solid var(--border-subtle);');
    expect(uiCss).toContain('--ls-snug: -0.014em;');
    expect(uiCss).toContain('.pc-proto .ws-pane__title {');
    expect(uiCss).toContain('letter-spacing: var(--ls-snug);');
  });

  it('matches the workspace panel top navigation to the chat-screen-v1 prototype', () => {
    expect(homeClient).toContain('File as FileIcon,');
    expect(homeClient).toContain('Clock,');
    expect(homeClient).toContain('<button type="button" className="ws__tab" data-tab="run" aria-pressed={workspaceTab === \'run\'} onClick={() => activateWorkspaceTab(\'run\')}><Clock size={12} />Run</button>');
    expect(homeClient).toContain('<button type="button" className="ws__tab" data-tab="files" aria-pressed={workspaceTab === \'files\'} onClick={() => activateWorkspaceTab(\'files\')}><FileIcon size={12} />Files</button>');
    expect(homeClient).not.toContain('<span className="ws__tab-badge">{fileCount}</span>');
    expect(homeClient).toContain('<button type="button" className="ws__tab" data-tab="terminal" aria-pressed={workspaceTab === \'terminal\'} onClick={() => activateWorkspaceTab(\'terminal\')}><Terminal size={12} />Terminal</button>');
    expect(homeClient).toContain('<button type="button" className="ws__tab" data-tab="context" aria-pressed={workspaceTab === \'context\'} onClick={() => activateWorkspaceTab(\'context\')}><PanelsTopLeft size={12} />Context</button>');
    expect(homeClient).not.toContain('<Terminal size={12} />Term</button>');
    expect(homeClient).not.toContain('<Database size={12} />Ctx</button>');
    expect(uiCss).toContain('padding: 0 var(--sp-4);');
    expect(uiCss).toContain('background: var(--surface);');
    expect(uiCss).toContain('border-bottom: 2px solid transparent;');
    expect(uiCss).toContain('margin-bottom: -1px;');
    expect(uiCss).toContain('.pc-proto .ws__tab[aria-pressed="true"] {');
    expect(uiCss).toContain('border-bottom-color: var(--b-500);');
    expect(uiCss).not.toContain('border-radius: var(--r-md) var(--r-md) 0 0;');
  });

  it('keeps the workspace metrics while restyling run details as chat-screen-v1 cards', () => {
    expect(homeClient).toContain('<div className="run-summary">');
    expect(homeClient).toContain('<span className="run-summary__label">Steps</span>');
    expect(homeClient).toContain('<span className="run-summary__label">Tokens</span>');
    expect(homeClient).toContain('<span className="run-summary__label">Activity</span>');
    expect(homeClient).toContain('className="ws-card ws-card--run"');
    expect(homeClient).toContain('className="chist ws-card ws-card--history"');
    expect(homeClient).toContain('className="ws-card__head"');
    expect(homeClient).toContain('className="ws-card__title">Run ·');
    expect(homeClient).toContain('className="ws-card__meta"');
    expect(homeClient).toContain('className="run-step ws-run-step"');
    expect(homeClient).toContain('className="run-step__dot ws-run-step__dot run-step__dot--done ws-run-step__dot--done"');
    expect(homeClient).toContain('className="run-step__body ws-run-step__body"');
    expect(homeClient).toContain('className="run-step__time ws-run-step__time"');
    expect(homeClient).toContain('className="ws-empty-state"');
    expect(uiCss).toContain('.pc-proto .ws-card {');
    expect(uiCss).toContain('.pc-proto .ws-card__head {');
    expect(uiCss).toContain('.pc-proto .ws-run-step {');
    expect(uiCss).toContain('.pc-proto .ws-empty-state {');
    expect(uiCss).toContain('grid-template-columns: auto minmax(0, 1fr) auto;');
  });

  it('renders functional workspace panes instead of one static Run panel', () => {
    expect(homeClient).toContain("workspaceTab === 'run'");
    expect(homeClient).toContain("workspaceTab === 'files'");
    expect(homeClient).toContain("workspaceTab === 'terminal'");
    expect(homeClient).toContain("workspaceTab === 'context'");
    expect(homeClient).toContain('data-pane="run"');
    expect(homeClient).toContain('data-pane="files"');
    expect(homeClient).toContain('data-pane="terminal"');
    expect(homeClient).toContain('data-pane="context"');
    expect(homeClient).toContain('data-preview-dock');
    expect(homeClient).toContain('data-copy-feedback');
  });

  it('keeps project chats nested under the selected project in the redesigned sidebar', () => {
    expect(homeClient).toContain('activeProjectChatId: string | null;');
    expect(homeClient).toContain('className={`m-sb__project-node${isActiveProject ?');
    expect(homeClient).toContain('const visibleChatCount = isActiveProject && !isLoadingProjectChats');
    expect(homeClient).toContain('<span className="m-sb__proj-count">{visibleChatCount}</span>');
    expect(homeClient).toContain('className="m-sb__chat-children"');
    expect(homeClient).toContain("className={`m-sb__chat-child${activeProjectChatId === chat.id ? ' m-sb__chat-child--active' : ''}`}");
    expect(homeClient).toContain("onClick={() => onProjectChatOpen(session.id, chat.id)}");
    expect(homeClient).toContain("setSelectedProjectChatId(nextTab === 'project' && nextProjectView === 'chat' ? (searchParams.get('chat') ?? null) : null);");
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
      '.pc-chat-row',
      '.pc-proto .shell',
      '.pc-proto .ch',
      '.pc-proto .tl',
      '.pc-proto .msg',
      '.pc-proto .msg--action',
      '.pc-proto .pc-action-card',
      '.pc-proto .pc-action-card__kind',
      '.pc-proto .pc-action-card__primary',
      '.pc-proto .tool',
      '.pc-proto .code',
      '.pc-proto .artifact',
      '.pc-proto .cmp',
      '.pc-proto .ws',
      '.m-sb__chat-children',
      '.m-sb__chat-child',
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
    expect(cssBlock('.pc-proto .pc-action-card')).toContain('border-radius: 8px;');
    expect(cssBlock('.pc-proto .pc-action-card')).toContain('grid-template-columns: minmax(0, 1fr) auto;');
    expect(cssBlock('.pc-proto .ws__pane')).toContain('display: none;');
    expect(cssBlock('.pc-proto .ws__pane--active')).toContain('display: flex;');
    expect(uiCss).toContain('.pc-proto[data-workspace="closed"] .shell');
    expect(uiCss).toContain('.pc-proto[data-preview="open"] .overlay');
    expect(uiCss).toContain('.pc-proto[data-preview="dock"] .preview-dock-wrap');
    expect(homeClient).not.toContain('chats total`');
  });

  it('keeps the docked preview above the composer instead of overlapping it', () => {
    expect(homeClient).toContain('const prototypeRef = useRef<HTMLDivElement | null>(null);');
    expect(homeClient).toContain('const composerWrapRef = useRef<HTMLElement | null>(null);');
    expect(homeClient).toContain("prototypeNode.style.setProperty('--pc-composer-height'");
    expect(homeClient).toContain('const composerObserver = new ResizeObserver(syncComposerHeight);');
    expect(homeClient).toContain('ref={prototypeRef}');
    expect(homeClient).toContain('<footer ref={composerWrapRef} className="cmp-wrap">');

    const dockWrap = cssBlock('.pc-proto .preview-dock-wrap');
    expect(uiCss).toContain('--pc-composer-height: 226px;');
    expect(dockWrap).toContain('bottom: calc(var(--pc-composer-height, 226px) + var(--sp-8));');
    expect(dockWrap).not.toContain('bottom: 92px;');
  });

  it('keeps the project chat prototype practical on mobile viewports', () => {
    expect(homeClient).toContain("const shouldShowBottomNav = !(activeTab === 'project' && selectedProjectView === 'chat');");
    expect(homeClient).toContain('{shouldShowBottomNav && <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />}');
    expect(homeClient).toContain("className={`app-shell app-shell-ia${shouldShowBottomNav ? '' : ' app-shell-ia--chat-screen'}`}");
    expect(uiCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.app-shell-ia--chat-screen\s*\{[^}]*padding-bottom:\s*0;/s);
    expect(uiCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.app-shell-ia--chat-screen \.aris-ia-shell\s*\{[^}]*min-height:\s*var\(--app-vh,\s*100dvh\);/s);
    expect(uiCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.pc-proto\s*\{[^}]*min-height:\s*calc\(var\(--app-vh,\s*100dvh\) - 48px\);/s);
    expect(uiCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.pc-proto \.shell\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;/s);
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

  it('keeps the project filter chips attached to the search field instead of the screen edge', () => {
    const toolbar = cssBlock('.proj-list-toolbar');
    const chips = cssBlock('.proj-list-chips');

    expect(toolbar).toContain('gap: var(--sp-3);');
    expect(chips).toContain('margin-left: 0;');
    expect(chips).not.toContain('margin-left: auto;');
  });
});
