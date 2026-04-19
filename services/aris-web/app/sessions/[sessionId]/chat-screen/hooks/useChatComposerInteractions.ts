'use client';

import { useCallback, type Dispatch, type FormEvent, type KeyboardEventHandler, type SetStateAction } from 'react';
import type { ModelReasoningEffort } from '../types';

type PlusMenuMode = 'closed' | 'menu' | 'file' | 'text';
type SetBooleanState = Dispatch<SetStateAction<boolean>>;
type SetPlusMenuMode = Dispatch<SetStateAction<PlusMenuMode>>;

type UseChatComposerInteractionsParams = {
  handleSelectGeminiMode: (modeId: string) => Promise<void>;
  handleSelectModel: (modelId: string) => Promise<void>;
  handleSelectModelReasoningEffort: (value: unknown) => Promise<void>;
  handleSubmit: (event: FormEvent) => Promise<void>;
  setIsCommandMenuOpen: SetBooleanState;
  setIsGeminiModeDropdownOpen: SetBooleanState;
  setIsModelDropdownOpen: SetBooleanState;
  setPlusMenuMode: SetPlusMenuMode;
  setTextContextInput: (value: string) => void;
};

export function useChatComposerInteractions({
  handleSelectGeminiMode,
  handleSelectModel,
  handleSelectModelReasoningEffort,
  handleSubmit,
  setIsCommandMenuOpen,
  setIsGeminiModeDropdownOpen,
  setIsModelDropdownOpen,
  setPlusMenuMode,
  setTextContextInput,
}: UseChatComposerInteractionsParams) {
  const handleToggleCommandMenu = useCallback(() => {
    setIsCommandMenuOpen((value) => !value);
  }, [setIsCommandMenuOpen]);

  const handleToggleModelDropdown = useCallback(() => {
    setIsModelDropdownOpen((value) => !value);
  }, [setIsModelDropdownOpen]);

  const handleModelSelect = useCallback((modelId: string) => {
    void handleSelectModel(modelId);
  }, [handleSelectModel]);

  const handleToggleGeminiModeDropdown = useCallback(() => {
    setIsGeminiModeDropdownOpen((value) => !value);
  }, [setIsGeminiModeDropdownOpen]);

  const handleGeminiModeSelect = useCallback((modeId: string) => {
    void handleSelectGeminiMode(modeId);
  }, [handleSelectGeminiMode]);

  const handleModelReasoningEffortSelect = useCallback((value: string | ModelReasoningEffort) => {
    void handleSelectModelReasoningEffort(value);
  }, [handleSelectModelReasoningEffort]);

  const handleTogglePlusMenu = useCallback(() => {
    setPlusMenuMode((mode) => (mode === 'closed' ? 'menu' : 'closed'));
  }, [setPlusMenuMode]);

  const handleOpenTextContextEditor = useCallback(() => {
    setPlusMenuMode('text');
    setTextContextInput('');
  }, [setPlusMenuMode, setTextContextInput]);

  const handleCancelTextContext = useCallback(() => {
    setPlusMenuMode('menu');
  }, [setPlusMenuMode]);

  const handlePromptKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = useCallback((event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      void handleSubmit(event);
    }
  }, [handleSubmit]);

  return {
    handleCancelTextContext,
    handleGeminiModeSelect,
    handleModelReasoningEffortSelect,
    handleModelSelect,
    handleOpenTextContextEditor,
    handlePromptKeyDown,
    handleToggleCommandMenu,
    handleToggleGeminiModeDropdown,
    handleToggleModelDropdown,
    handleTogglePlusMenu,
  };
}
