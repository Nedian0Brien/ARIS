'use client';

import React, {
  type FormEvent,
  type RefObject,
  useCallback,
  useRef,
} from 'react';
import {
  AtSign,
  ChevronRight,
  Mic,
  Paperclip,
  Plus,
  Send,
  Square,
  X,
} from 'lucide-react';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { useComposerAutoGrow } from '@/components/project-chat/helpers/useComposerAutoGrow';
import { useProjectSkills } from '@/components/project-chat/helpers/useProjectSkills';
import { useRecentSkills } from '@/components/project-chat/helpers/useRecentSkills';
import { useSlashAutocomplete } from '@/components/project-chat/helpers/useSlashAutocomplete';
import {
  ProjectComposerArgumentHint,
  ProjectComposerSlashAutocomplete,
} from '@/components/project-chat/ProjectComposerSlashAutocomplete';
import type { ProjectSkillEntry } from '@/lib/projectSkills';
import {
  COMPOSER_MODE_COPY,
  PROVIDER_EFFORTS,
  PROVIDER_LABELS,
  type ComposerMode,
  type ModelProvider,
  type ReasoningEffort,
} from './projectChatSurfaceUtils';

export function ProjectChatComposer({
  activeModelLabel,
  composerMode,
  composerWrapRef,
  error,
  isAborting,
  isRunning,
  modelSelectorOpen,
  onAddContext,
  onAttachFile,
  onComposerModeChange,
  onEffortSelect,
  onMentionProject,
  onModelSelect,
  onModelSelectorOpenChange,
  onPromptChange,
  onProviderSelect,
  onStop,
  onSubmit,
  onVoice,
  placeholder = '에이전트에게 무엇이든 요청하세요... Shift Enter 줄바꿈 · Cmd Enter 전송',
  projectId,
  prompt,
  providerOptions,
  selectedEffort,
  selectedModelId,
  selectedProvider,
}: {
  activeModelLabel: string;
  composerMode: ComposerMode;
  composerWrapRef?: RefObject<HTMLElement | null>;
  error: string | null;
  isAborting: boolean;
  isRunning: boolean;
  modelSelectorOpen: boolean;
  onAddContext: () => void;
  onAttachFile: () => void;
  onComposerModeChange: (mode: ComposerMode) => void;
  onEffortSelect: (effort: ReasoningEffort) => void;
  onMentionProject: () => void;
  onModelSelect: (provider: ModelProvider, modelName: string) => void;
  onModelSelectorOpenChange: (open: boolean) => void;
  onPromptChange: (value: string) => void;
  onProviderSelect: (provider: ModelProvider) => void;
  onStop: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onVoice: () => void;
  placeholder?: string;
  projectId: string;
  prompt: string;
  providerOptions: Record<ModelProvider, Array<{ id: string; label: string; meta?: string }>>;
  selectedEffort: ReasoningEffort;
  selectedModelId: string;
  selectedProvider: ModelProvider;
}) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  useComposerAutoGrow(inputRef, prompt);

  const panelSkills = useProjectSkills(projectId);
  const { recentCommands, recordRecentSkill } = useRecentSkills(projectId);
  const applySlashSkill = useCallback((entry: ProjectSkillEntry) => {
    recordRecentSkill(entry.command);
    onPromptChange(`${entry.command} `);
    inputRef.current?.focus();
  }, [onPromptChange, recordRecentSkill]);
  const slashAutocomplete = useSlashAutocomplete({
    containerRef: formRef,
    entries: panelSkills.entries,
    loadEntries: panelSkills.load,
    loading: panelSkills.loading,
    onApply: applySlashSkill,
    prompt,
    recentCommands,
  });

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashAutocomplete.handleKeyDown(event)) {
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey || (!event.metaKey && !event.ctrlKey)) {
      return;
    }
    event.preventDefault();
    if (isRunning || isAborting || !prompt.trim()) {
      return;
    }
    event.currentTarget.form?.requestSubmit();
  };

  return (
    <footer ref={composerWrapRef} className="cmp-wrap">
      <form ref={formRef} className="cmp" onSubmit={onSubmit}>
        <div className="cmp__top">
          <div className="cmp-mode" role="tablist" aria-label="Mode">
            {(['agent', 'plan', 'terminal'] as ComposerMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className="cmp-mode__pill"
                data-mode={mode}
                aria-pressed={composerMode === mode}
                onClick={() => onComposerModeChange(mode)}
              >
                <span className="cmp-mode__pill-dot" />
                {COMPOSER_MODE_COPY[mode]}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="cmp-ctx"
            aria-label="Current model"
            aria-expanded={modelSelectorOpen}
            onClick={() => onModelSelectorOpenChange(!modelSelectorOpen)}
          >
            <span className={`cmp-ctx__logo cmp-ctx__logo--${selectedProvider}`}>
              <ProviderLogo provider={selectedProvider} />
            </span>
            <span className="cmp-ctx__name">{activeModelLabel}</span>
            <span className="cmp-ctx__effort">{selectedEffort}</span>
            <ChevronRight size={12} />
          </button>
        </div>
        <div className={`ms${modelSelectorOpen ? ' ms--open' : ''}`} role="dialog" aria-label="Model selector">
          <div className="ms__eyebrow-row">
            <span className="ms__eyebrow">Model</span>
            <button type="button" className="ms__close" aria-label="Close model selector" onClick={() => onModelSelectorOpenChange(false)}>
              <X size={12} />
            </button>
          </div>
          <div className="ms__providers" role="tablist">
            {(['claude', 'codex', 'gemini'] as ModelProvider[]).map((provider) => (
              <button
                key={provider}
                type="button"
                className="ms__provider"
                data-provider={provider}
                aria-pressed={selectedProvider === provider}
                onClick={() => onProviderSelect(provider)}
              >
                <ProviderLogo provider={provider} />
                <span className="ms__provider-label">{PROVIDER_LABELS[provider]}</span>
              </button>
            ))}
          </div>
          <div className="ms__list-wrap">
            {(['claude', 'codex', 'gemini'] as ModelProvider[]).map((provider) => (
              <div key={provider} className="ms__group" data-provider={provider} data-active={selectedProvider === provider ? '' : undefined}>
                {providerOptions[provider].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="ms__item"
                    aria-pressed={selectedProvider === provider && selectedModelId === option.id}
                    onClick={() => onModelSelect(provider, option.id)}
                  >
                    <span className="ms__item-check" />
                    <span className="ms__item-body">
                      <span className="ms__item-name">{option.label}</span>
                      <span className="ms__item-meta">{option.meta ?? ''}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="ms__footer">
            <span className="ms__eyebrow">Effort</span>
            <div className="ms__effort-chips" role="tablist" aria-label="Reasoning effort">
              {(['Low', 'Medium', 'High', 'XHigh', 'Max'] as ReasoningEffort[]).map((effort) => {
                const disabled = !PROVIDER_EFFORTS[selectedProvider].includes(effort);
                return (
                  <button
                    key={effort}
                    type="button"
                    className={`ms__effort-chip${disabled ? ' ms__effort-chip--disabled' : ''}`}
                    aria-pressed={selectedEffort === effort}
                    disabled={disabled}
                    onClick={() => onEffortSelect(effort)}
                  >
                    {effort}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <ProjectComposerSlashAutocomplete
          open={slashAutocomplete.open}
          entries={slashAutocomplete.matches}
          loading={panelSkills.loading}
          activeIndex={slashAutocomplete.activeIndex}
          onHoverIndex={slashAutocomplete.setActiveIndex}
          onSelect={applySlashSkill}
        />
        {!slashAutocomplete.open && (
          <ProjectComposerArgumentHint entry={slashAutocomplete.argumentHintEntry} />
        )}
        <textarea
          ref={inputRef}
          className="cmp__input"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
        />
        <div className="cmp__toolbar">
          <div className="cmp__tools">
            <button type="button" className="cmp__tool" aria-label="Add" onClick={onAddContext}><Plus size={15} /></button>
            <button type="button" className="cmp__tool" aria-label="Attach file" onClick={onAttachFile}>
              <Paperclip size={15} />
            </button>
            <button type="button" className="cmp__tool" aria-label="Mention" onClick={onMentionProject}>
              <AtSign size={15} />
            </button>
            <button type="button" className="cmp__tool" aria-label="Voice" onClick={onVoice}>
              <Mic size={15} />
            </button>
          </div>
          <div className="cmp__right">
            <span className="cmp__hint"><span className="kbd">⌘</span><span className="kbd">↵</span><span>{isRunning ? 'running' : 'send'}</span></span>
            {isRunning ? (
              <button
                type="button"
                className={`cmp__send cmp__send--running${isAborting ? ' cmp__send--aborting' : ''}`}
                disabled={isAborting}
                aria-label="Stop generation"
                onClick={onStop}
              >
                {isAborting ? 'Stopping...' : 'Stop'}
                <Square size={11} />
              </button>
            ) : (
              <button
                type="submit"
                className="cmp__send"
                disabled={!prompt.trim()}
                aria-label="Send message"
              >
                Send
                <Send size={13} />
              </button>
            )}
          </div>
        </div>
      </form>
      {error && <div className="pc-chat-error" role="alert">{error}</div>}
    </footer>
  );
}
