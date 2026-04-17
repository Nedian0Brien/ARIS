import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MessageSquarePlus } from 'lucide-react';
import { ChatComposer } from '@/app/sessions/[sessionId]/chat-screen/center-pane/ChatComposer';
import { FileBrowserModal } from '@/app/sessions/[sessionId]/chat-screen/center-pane/FileBrowserModal';

describe('chat composer view', () => {
  it('renders the composer hint and text context editor', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ChatComposer, {
        showPendingReveal: false,
        agentFlavor: 'codex',
        AgentIcon: MessageSquarePlus,
        activeModelShortLabel: 'GPT-5.4',
        activeChatIdResolved: 'chat-1',
        isOperator: true,
        isAgentRunning: false,
        isAborting: false,
        prompt: '초안 작성',
        contextItems: [],
        imageUploadsInFlight: 0,
        imageUploadError: null,
        availableChatCommands: [],
        isCommandMenuOpen: false,
        isModelDropdownOpen: false,
        isGeminiModeDropdownOpen: false,
        activeComposerModels: [],
        activeModelId: 'gpt-5.4',
        activeGeminiMode: { shortLabel: 'Auto' },
        activeGeminiModeId: 'auto',
        activeGeminiModeOptions: [],
        approvalPolicy: 'on-request',
        selectedModelReasoningEffort: 'medium',
        plusMenuMode: 'text',
        textContextInput: '참고 문맥',
        commandMenuRef: { current: null },
        modelDropdownRef: { current: null },
        geminiModeDropdownRef: { current: null },
        plusMenuRef: { current: null },
        composerDockRef: { current: null },
        composerInputRef: { current: null },
        composerImageInputRef: { current: null },
        onSubmit: vi.fn(),
        onToggleCommandMenu: vi.fn(),
        onRunChatCommand: vi.fn(),
        onToggleModelDropdown: vi.fn(),
        onSelectModel: vi.fn(),
        onToggleGeminiModeDropdown: vi.fn(),
        onSelectGeminiMode: vi.fn(),
        onSelectModelReasoningEffort: vi.fn(),
        onRemoveContextItem: vi.fn(),
        onImageSelection: vi.fn(),
        onTogglePlusMenu: vi.fn(),
        onImageUploadOpen: vi.fn(),
        onFileBrowserOpen: vi.fn(),
        onOpenTextContextEditor: vi.fn(),
        onTextContextInputChange: vi.fn(),
        onCancelTextContext: vi.fn(),
        onAddTextContext: vi.fn(),
        onPromptChange: vi.fn(),
        onPromptInput: vi.fn(),
        onPromptFocus: vi.fn(),
        onPromptKeyDown: vi.fn(),
        onAbortRun: vi.fn(),
      }),
    );

    expect(markup).toContain('Ctrl + Enter로 전송');
    expect(markup).toContain('텍스트 입력');
    expect(markup).toContain('참고 문맥');
  });

  it('renders the file browser title, current path, and recent files', () => {
    const markup = renderToStaticMarkup(
      React.createElement(FileBrowserModal, {
        fileBrowserQuery: '',
        fileBrowserSearchResults: null,
        fileBrowserSearchLoading: false,
        recentAttachments: ['/workspace/src/app.tsx'],
        fileBrowserParentPath: '/workspace',
        fileBrowserPath: '/workspace/src',
        fileBrowserLoading: false,
        fileBrowserError: null,
        fileBrowserItems: [
          { name: 'components', path: '/workspace/src/components', isDirectory: true, isFile: false },
          { name: 'page.tsx', path: '/workspace/src/page.tsx', isDirectory: false, isFile: true },
        ],
        onClose: vi.fn(),
        onSearchChange: vi.fn(),
        onClearSearch: vi.fn(),
        onSearchResultSelect: vi.fn(),
        onBrowseParent: vi.fn(),
        onBrowseItem: vi.fn(),
        onRecentAttachmentSelect: vi.fn(),
      }),
    );

    expect(markup).toContain('파일 선택');
    expect(markup).toContain('/workspace/src');
    expect(markup).toContain('최근 파일');
    expect(markup).toContain('page.tsx');
  });
});
