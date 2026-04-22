import type { AgentFlavor } from '@/lib/happy/types';
import type {
  ChatRuntimeUiState,
  ChatSidebarSectionKey,
  ComposerModelOption,
  ModelReasoningEffort,
} from './types';

export const AGENT_REPLY_TIMEOUT_MS = 90000;
export const AGENT_ACTIVITY_SETTLE_MS = 6500;
export const RUNTIME_DISCONNECT_GRACE_MS = 4000;
export const AUTO_SCROLL_THRESHOLD_PX = 80;
export const MOBILE_LAYOUT_MAX_WIDTH_PX = 960;
export const PREVIEW_MAX_LINES = 12;
export const PREVIEW_MAX_CHARS = 600;
export const COMPOSER_MIN_HEIGHT_PX = 36;
export const COMPOSER_MAX_HEIGHT_PX = 180;
export const RECENT_FILES_STORAGE_KEY = 'aris:recent-file-attachments';
export const RECENT_FILES_MAX = 5;
export const ACTION_COLLAPSE_THRESHOLD = 4;
export const READ_CURSOR_SYNC_DEBOUNCE_MS = 2000;
export const SNAPSHOT_SYNC_DEBOUNCE_MS = 1500;
export const SIDEBAR_CHAT_PAGE_SIZE = 7;
export const SIDEBAR_APPROVAL_FEEDBACK_MS = 3000;
export const SIDEBAR_STATUS_REFRESH_MS = 10000;
export const AUX_SYNC_INITIAL_DELAY_MS = 900;
export const SIDEBAR_VISIBLE_CHAT_LIMIT = 8;
export const TAIL_LAYOUT_SETTLE_TIMEOUT_MS = 1200;
export const WORKSPACE_FILE_OPEN_EVENT = 'aris-open-workspace-file';

export const CHAT_RUN_PHASE_LABELS = {
  submitting: '전송 중',
  waiting: '작업 중',
  running: '응답 생성 중',
  approval: '승인 대기 중',
  aborting: '중단 중',
} as const;

export const CHAT_AGENT_CHOICES: AgentFlavor[] = ['codex', 'claude', 'gemini'];

export const AGENT_QUICK_STARTS: Partial<Record<AgentFlavor, string[]>> = {
  claude: [
    '현재 워크스페이스의 코드 구조를 설명해 줘',
    '최근 변경된 파일들의 주요 로직을 리뷰해 줘',
    '이 프로젝트의 아키텍처 다이어그램을 그려줘',
  ],
  codex: [
    '이 프로젝트의 주요 진입점(Entry point) 코드를 분석해 줘',
    'package.json (또는 의존성 파일)을 읽고 기술 스택을 요약해 줘',
    '자주 사용되는 공통 컴포넌트나 유틸리티 함수를 찾아줘',
  ],
  gemini: [
    '이 코드베이스의 전체적인 목적과 기능 명세를 추론해 줘',
    '현재 프로젝트에서 개선할 만한 잠재적인 문제점(Code smell)을 찾아줘',
    '프로젝트의 테스트 코드 작성 패턴을 분석해 줘',
  ],
};

export const COMPOSER_MODELS_BY_AGENT: Record<'codex' | 'claude' | 'gemini', ComposerModelOption[]> = {
  codex: [
    { id: 'gpt-5.4', shortLabel: 'GPT-5.4', badge: '권장' },
    { id: 'gpt-5.3-codex', shortLabel: 'GPT-5.3 Codex', badge: '유지' },
    { id: 'gpt-5.3-codex-spark', shortLabel: 'GPT-5.3 Codex Spark', badge: '신규' },
    { id: 'gpt-5', shortLabel: 'GPT-5', badge: '고성능' },
    { id: 'gpt-5-mini', shortLabel: 'GPT-5 mini', badge: '빠름' },
  ],
  claude: [
    { id: 'claude-sonnet-4-6', shortLabel: 'Sonnet 4.6', badge: '권장' },
    { id: 'claude-opus-4-6', shortLabel: 'Opus 4.6', badge: '최고 성능' },
    { id: 'claude-haiku-4-5', shortLabel: 'Haiku 4.5', badge: '빠름' },
  ],
  gemini: [
    { id: 'auto-gemini-3', shortLabel: 'Gemini 3 Auto', badge: '권장' },
    { id: 'gemini-3-flash-preview', shortLabel: 'Gemini 3 Flash', badge: '빠름' },
    { id: 'gemini-2.5-pro', shortLabel: 'Gemini 2.5 Pro', badge: '고성능' },
    { id: 'gemini-2.5-flash', shortLabel: 'Gemini 2.5 Flash', badge: '빠름' },
    { id: 'gemini-2.0-flash', shortLabel: 'Gemini 2.0 Flash', badge: '경량' },
  ],
};

export const MODEL_REASONING_EFFORT_OPTIONS: Array<{ value: ModelReasoningEffort; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'XHigh' },
];

export const DEFAULT_CHAT_RUNTIME_UI_STATE: ChatRuntimeUiState = {
  isSubmitting: false,
  isAwaitingReply: false,
  isAborting: false,
  hasCompletionSignal: false,
  awaitingReplySince: null,
  showDisconnectRetry: false,
  lastSubmittedPayload: null,
  submitError: null,
};

export const CHAT_SIDEBAR_SECTION_LABELS: Record<ChatSidebarSectionKey, string> = {
  pinned: 'Pinned',
  running: 'Running',
  completed: 'Completed',
  history: 'History',
};
