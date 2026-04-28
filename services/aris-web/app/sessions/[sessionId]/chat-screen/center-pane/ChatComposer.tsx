'use client';

import React from 'react';
import type {
  ChangeEventHandler,
  ComponentType,
  FocusEventHandler,
  FormEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  RefObject,
} from 'react';
import {
  AlignLeft,
  ArrowUp,
  ChevronDown,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Plus,
  TerminalSquare,
  X,
} from 'lucide-react';
import type { AgentFlavor, ApprovalPolicy } from '@/lib/happy/types';
import type { ChatCommandId } from '../../chatCommands';
import { MODEL_REASONING_EFFORT_OPTIONS } from '../constants';
import type { ComposerMode, ComposerModelOption, ContextItem, GeminiModeOption, ModelReasoningEffort } from '../types';
import styles from '../../ChatInterface.module.css';

type ChatCommandOption = {
  id: ChatCommandId;
  label: string;
  slashCommand: string;
  description: string;
};

export function ChatComposer({
  showPendingReveal,
  agentFlavor,
  AgentIcon,
  activeModelShortLabel,
  activeChatIdResolved,
  isOperator,
  isAgentRunning,
  isAborting,
  prompt,
  contextItems,
  imageUploadsInFlight,
  imageUploadError,
  availableChatCommands,
  isCommandMenuOpen,
  isModelDropdownOpen,
  isGeminiModeDropdownOpen,
  activeComposerModels,
  activeModelId,
  activeGeminiMode,
  activeGeminiModeId,
  activeGeminiModeOptions,
  approvalPolicy,
  selectedModelReasoningEffort,
  plusMenuMode,
  textContextInput,
  commandMenuRef,
  modelDropdownRef,
  geminiModeDropdownRef,
  plusMenuRef,
  composerDockRef,
  composerInputRef,
  composerImageInputRef,
  onSubmit,
  onToggleCommandMenu,
  onRunChatCommand,
  onToggleModelDropdown,
  onSelectModel,
  onToggleGeminiModeDropdown,
  onSelectGeminiMode,
  onSelectModelReasoningEffort,
  onRemoveContextItem,
  onImageSelection,
  onTogglePlusMenu,
  onImageUploadOpen,
  onFileBrowserOpen,
  onOpenTextContextEditor,
  onTextContextInputChange,
  onCancelTextContext,
  onAddTextContext,
  onPromptChange,
  onPromptInput,
  onPromptFocus,
  onPromptKeyDown,
  onAbortRun,
  composerMode = 'agent',
  onComposerModeChange = () => {},
}: {
  showPendingReveal: boolean;
  agentFlavor: AgentFlavor;
  AgentIcon: ComponentType<{ size?: number; className?: string }>;
  activeModelShortLabel: string;
  activeChatIdResolved: string | null;
  isOperator: boolean;
  isAgentRunning: boolean;
  isAborting: boolean;
  prompt: string;
  contextItems: ContextItem[];
  imageUploadsInFlight: number;
  imageUploadError: string | null;
  availableChatCommands: ChatCommandOption[];
  isCommandMenuOpen: boolean;
  isModelDropdownOpen: boolean;
  isGeminiModeDropdownOpen: boolean;
  activeComposerModels: ComposerModelOption[];
  activeModelId: string;
  activeGeminiMode: { shortLabel: string };
  activeGeminiModeId: string;
  activeGeminiModeOptions: GeminiModeOption[];
  approvalPolicy: ApprovalPolicy | null | undefined;
  selectedModelReasoningEffort: ModelReasoningEffort;
  plusMenuMode: 'closed' | 'menu' | 'file' | 'text';
  textContextInput: string;
  commandMenuRef: RefObject<HTMLDivElement | null>;
  modelDropdownRef: RefObject<HTMLDivElement | null>;
  geminiModeDropdownRef: RefObject<HTMLDivElement | null>;
  plusMenuRef: RefObject<HTMLDivElement | null>;
  composerDockRef: RefObject<HTMLElement | null>;
  composerInputRef: RefObject<HTMLTextAreaElement | null>;
  composerImageInputRef: RefObject<HTMLInputElement | null>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onToggleCommandMenu: MouseEventHandler<HTMLButtonElement>;
  onRunChatCommand: (id: ChatCommandId) => void;
  onToggleModelDropdown: MouseEventHandler<HTMLButtonElement>;
  onSelectModel: (id: string) => void;
  onToggleGeminiModeDropdown: MouseEventHandler<HTMLButtonElement>;
  onSelectGeminiMode: (id: string) => void;
  onSelectModelReasoningEffort: (value: string) => void;
  onRemoveContextItem: (item: ContextItem) => void;
  onImageSelection: ChangeEventHandler<HTMLInputElement>;
  onTogglePlusMenu: MouseEventHandler<HTMLButtonElement>;
  onImageUploadOpen: MouseEventHandler<HTMLButtonElement>;
  onFileBrowserOpen: MouseEventHandler<HTMLButtonElement>;
  onOpenTextContextEditor: MouseEventHandler<HTMLButtonElement>;
  onTextContextInputChange: (value: string) => void;
  onCancelTextContext: MouseEventHandler<HTMLButtonElement>;
  onAddTextContext: MouseEventHandler<HTMLButtonElement>;
  onPromptChange: (value: string) => void;
  onPromptInput: FormEventHandler<HTMLTextAreaElement>;
  onPromptFocus: FocusEventHandler<HTMLTextAreaElement>;
  onPromptKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onAbortRun: MouseEventHandler<HTMLButtonElement>;
  composerMode?: ComposerMode;
  onComposerModeChange?: (mode: ComposerMode) => void;
}) {
  const composerModeClass =
    composerMode === 'plan'
      ? styles.composerModePlan
      : composerMode === 'terminal'
        ? styles.composerModeTerminal
        : styles.composerModeAgent;
  const submitLabel =
    composerMode === 'plan' ? 'Plan' : composerMode === 'terminal' ? 'Execute' : 'Send';
  const modeLabel = composerMode === 'plan' ? '계획을 먼저 작성합니다.' : composerMode === 'terminal' ? '입력한 내용을 셸 명령으로 실행합니다.' : '에이전트에게 작업을 요청합니다.';
  const shortcutHint = 'Shift ↵ 줄바꿈 · ⌘ ↵ 전송';
  const placeholder =
    !activeChatIdResolved
      ? '사용할 채팅을 선택하세요.'
      : !isOperator
        ? 'Viewer 권한입니다.'
        : composerMode === 'plan'
          ? `계획으로 전환할 목표와 제약을 설명하세요. ${shortcutHint}`
          : composerMode === 'terminal'
            ? `$ 실행할 터미널 명령을 입력하세요. ${shortcutHint}`
            : `에이전트에게 작업을 지시하세요. ${shortcutHint}`;

  return (
    <footer
      className={`${styles.composerDock} ${showPendingReveal ? styles.chatEntryPendingReveal : ''}`}
      ref={composerDockRef}
      aria-hidden={showPendingReveal}
    >
      <form onSubmit={onSubmit} className={styles.composerForm}>
        <div className={`${styles.composerCard} ${styles.compV2} ${composerModeClass} ${
          composerMode === 'plan' ? styles.compV2Plan : composerMode === 'terminal' ? styles.compV2Terminal : ''
        }`} data-mode={composerMode} data-composer-mode={composerMode}>
          <div className={`${styles.composerToolbar} ${styles.compV2Top}`}>
            <div className={`${styles.composerModeToggle} ${styles.modeToggle}`} role="tablist" aria-label="Composer mode">
              <button
                type="button"
                role="tab"
                aria-selected={composerMode === 'agent'}
                className={`${styles.composerModePill} ${styles.modeTogglePill} ${styles.composerModePillAgent} ${composerMode === 'agent' ? `${styles.composerModePillActive} ${styles.modeTogglePillActiveAgent}` : ''}`}
                onClick={() => onComposerModeChange('agent')}
              >
                <span className={styles.modeTogglePillDot} />
                <AgentIcon size={13} />
                <span>Agent</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={composerMode === 'plan'}
                className={`${styles.composerModePill} ${styles.modeTogglePill} ${styles.composerModePillPlan} ${composerMode === 'plan' ? `${styles.composerModePillActive} ${styles.modeTogglePillActivePlan}` : ''}`}
                onClick={() => onComposerModeChange('plan')}
              >
                <span className={styles.modeTogglePillDot} />
                <AlignLeft size={13} />
                <span>Plan</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={composerMode === 'terminal'}
                className={`${styles.composerModePill} ${styles.modeTogglePill} ${styles.composerModePillTerminal} ${composerMode === 'terminal' ? `${styles.composerModePillActive} ${styles.modeTogglePillActiveTerminal}` : ''}`}
                onClick={() => onComposerModeChange('terminal')}
              >
                <span className={styles.modeTogglePillDot} />
                <TerminalSquare size={13} />
                <span>Terminal</span>
              </button>
            </div>
            {availableChatCommands.length > 0 && (
              <div className={styles.modelSelectorWrap} ref={commandMenuRef}>
                <button
                  type="button"
                  className={`${styles.modelSelectorBtn} ${styles.compV2Context}`}
                  onClick={onToggleCommandMenu}
                  aria-haspopup="listbox"
                  aria-expanded={isCommandMenuOpen}
                >
                  <span className={styles.compV2ContextDot} />
                  <TerminalSquare size={13} />
                  <span>Command</span>
                  <ChevronDown size={11} />
                </button>
                {isCommandMenuOpen && (
                  <div className={styles.modelDropdown} role="listbox">
                    {availableChatCommands.map((command) => (
                      <button
                        key={command.id}
                        type="button"
                        role="option"
                        aria-selected={false}
                        className={styles.commandOption}
                        onClick={() => onRunChatCommand(command.id)}
                      >
                        <span className={styles.commandOptionLabel}>{command.label}</span>
                        <span className={styles.commandOptionMeta}>{command.slashCommand}</span>
                        <span className={styles.commandOptionDescription}>{command.description}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className={styles.modelSelectorWrap} ref={modelDropdownRef}>
              <button
                type="button"
                className={`${styles.modelSelectorBtn} ${styles.compV2Context}`}
                onClick={onToggleModelDropdown}
                aria-haspopup="listbox"
                aria-expanded={isModelDropdownOpen}
              >
                <span className={styles.compV2ContextDot} />
                <AgentIcon size={13} />
                <span>{activeModelShortLabel}</span>
                <ChevronDown size={11} />
              </button>
              {isModelDropdownOpen && (
                <div className={styles.modelDropdown} role="listbox">
                  {activeComposerModels.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      role="option"
                      aria-selected={activeModelId === model.id}
                      className={`${styles.modelOption} ${activeModelId === model.id ? styles.modelOptionActive : ''}`}
                      onClick={() => onSelectModel(model.id)}
                    >
                      <span>{model.shortLabel}</span>
                      <span className={styles.modelOptionBadge}>{model.badge}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {agentFlavor === 'gemini' && (
              <div className={styles.modelSelectorWrap} ref={geminiModeDropdownRef}>
                <button
                  type="button"
                  className={`${styles.modelSelectorBtn} ${styles.compV2Context}`}
                  onClick={onToggleGeminiModeDropdown}
                  aria-haspopup="listbox"
                  aria-expanded={isGeminiModeDropdownOpen}
                >
                  <span className={styles.compV2ContextDot} />
                  <span>Mode</span>
                  <span>{activeGeminiMode.shortLabel}</span>
                  <ChevronDown size={11} />
                </button>
                {isGeminiModeDropdownOpen && (
                  <div className={styles.modelDropdown} role="listbox">
                    {activeGeminiModeOptions.map((mode) => {
                      const disabled = mode.id === 'yolo' && approvalPolicy !== 'yolo';
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          role="option"
                          aria-selected={activeGeminiModeId === mode.id}
                          className={`${styles.modelOption} ${activeGeminiModeId === mode.id ? styles.modelOptionActive : ''}`}
                          onClick={() => onSelectGeminiMode(mode.id)}
                          disabled={disabled}
                          title={disabled ? '세션 승인 정책이 yolo일 때만 사용할 수 있습니다.' : undefined}
                        >
                          <span>{mode.shortLabel}</span>
                          <span className={styles.modelOptionBadge}>
                            {disabled ? '잠김' : mode.badge}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {agentFlavor === 'codex' && (
              <div className={styles.modelEffortWrap} aria-label="모델 추론 강도">
                <span className={styles.modelEffortLabel}>Effort</span>
                <div className={styles.modelEffortChips}>
                  {MODEL_REASONING_EFFORT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`${styles.modelEffortChip} ${selectedModelReasoningEffort === option.value ? styles.modelEffortChipActive : ''}`}
                      onClick={() => onSelectModelReasoningEffort(option.value)}
                      aria-pressed={selectedModelReasoningEffort === option.value}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className={styles.composerModeHint}>{modeLabel}</div>

          {contextItems.length > 0 && (
            <div className={`${styles.composerChips} ${styles.compV2Chips}`}>
              {contextItems.map((item) => (
                <span key={item.id} className={styles.contextChip}>
                  {item.type === 'file' ? (
                    <Paperclip size={11} />
                  ) : item.type === 'text' ? (
                    <AlignLeft size={11} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.attachment.previewUrl}
                      alt=""
                      className={styles.contextChipThumb}
                      loading="lazy"
                    />
                  )}
                  <span className={styles.contextChipLabel}>
                    {item.type === 'file' ? item.name : item.type === 'text' ? '텍스트' : item.attachment.name}
                  </span>
                  <button
                    type="button"
                    className={styles.contextChipRemove}
                    onClick={() => onRemoveContextItem(item)}
                    aria-label="컨텍스트 제거"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {imageUploadsInFlight > 0 && (
            <div className={styles.composerAttachmentStatus}>이미지 업로드 중...</div>
          )}
          {imageUploadError && (
            <div className={styles.composerAttachmentError} role="alert">{imageUploadError}</div>
          )}

          <div className={`${styles.composerInputRow} ${styles.compV2Area}`}>
            <input
              ref={composerImageInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={onImageSelection}
            />
            <textarea
              ref={composerInputRef}
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              onInput={onPromptInput}
              onFocus={onPromptFocus}
              rows={1}
              onKeyDown={onPromptKeyDown}
              placeholder={placeholder}
              disabled={!activeChatIdResolved || !isOperator}
              className={`${styles.composerInput} ${styles.compV2Input}`}
            />
          </div>

          <div className={styles.compV2Bar}>
            <div className={styles.compV2Tools}>
              <div className={styles.plusMenuWrap} ref={plusMenuRef}>
                <button
                  type="button"
                  className={`${styles.composerPlusBtn} ${styles.compV2Tool} ${plusMenuMode !== 'closed' ? styles.composerPlusBtnActive : ''}`}
                  onClick={onTogglePlusMenu}
                  aria-label="컨텍스트 추가"
                  title="컨텍스트 추가"
                  disabled={!isOperator}
                >
                  <Plus size={16} />
                </button>
                {plusMenuMode !== 'closed' && (
                  <div className={styles.plusMenu}>
                    {plusMenuMode === 'menu' && (
                      <>
                        <button type="button" className={styles.plusMenuItem} onClick={onImageUploadOpen}>
                          <ImageIcon size={14} /> 사진 업로드
                        </button>
                        <button type="button" className={styles.plusMenuItem} onClick={onFileBrowserOpen}>
                          <Paperclip size={14} /> 파일 첨부
                        </button>
                        <button type="button" className={styles.plusMenuItem} onClick={onOpenTextContextEditor}>
                          <AlignLeft size={14} /> 텍스트 추가
                        </button>
                      </>
                    )}
                    {plusMenuMode === 'text' && (
                      <div className={styles.plusMenuInputArea}>
                        <div className={styles.plusMenuInputLabel}>텍스트 입력</div>
                        <textarea
                          className={styles.plusMenuTextInput}
                          value={textContextInput}
                          onChange={(event) => onTextContextInputChange(event.target.value)}
                          placeholder="에이전트에게 전달할 추가 맥락 정보..."
                          rows={4}
                          autoFocus
                        />
                        <div className={styles.plusMenuActions}>
                          <button type="button" className={styles.plusMenuCancelBtn} onClick={onCancelTextContext}>취소</button>
                          <button type="button" className={styles.plusMenuConfirmBtn} onClick={onAddTextContext} disabled={!textContextInput.trim()}>추가</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button type="button" className={styles.compV2Tool} onClick={onFileBrowserOpen} disabled={!isOperator} aria-label="파일 첨부">
                <Paperclip size={16} />
              </button>
              <button type="button" className={styles.compV2Tool} onClick={onOpenTextContextEditor} disabled={!isOperator} aria-label="텍스트 추가">
                <AlignLeft size={16} />
              </button>
            </div>
            <div className={styles.compV2Right}>
              <span className={`${styles.compV2Hint} ${isAgentRunning ? styles.compV2HintDanger : ''}`}>
                {isAgentRunning ? '실행 중 · Esc 중단' : '⌘ ↵ send'}
              </span>
            {isAgentRunning ? (
              <div className={styles.composerRunningBtnWrap}>
                <span className={styles.composerRunningBtnPulse} aria-hidden />
                <button
                  type="button"
                  className={`${styles.composerRunningBtn} ${styles.compV2Send} ${styles.compV2SendStop}`}
                  onClick={onAbortRun}
                  disabled={isAborting}
                  aria-label="실행 중단"
                  title="클릭하여 실행 중단"
                >
                  <Loader2 size={18} className={styles.composerRunningIcon} />
                </button>
              </div>
            ) : (
              <button
                type="submit"
                disabled={!activeChatIdResolved || !prompt.trim() || !isOperator || imageUploadsInFlight > 0}
                className={`${styles.composerSendBtn} ${styles.compV2Send} ${
                  !activeChatIdResolved || !prompt.trim() || !isOperator || imageUploadsInFlight > 0 ? styles.compV2SendDisabled : ''
                }`}
                aria-label={submitLabel}
                title={`${submitLabel} (Ctrl/Cmd + Enter)`}
              >
                <span className={styles.composerSendLabel}>{submitLabel}</span>
                <ArrowUp size={17} />
              </button>
            )}
            </div>
          </div>

        </div>
      </form>
    </footer>
  );
}
