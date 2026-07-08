'use client';

import { type KeyboardEvent, type RefObject, useCallback, useEffect, useMemo, useState } from 'react';
import { filterSkillEntriesForAutocomplete, findArgumentHintEntry } from '@/components/project-chat/helpers/skillEntries';
import type { ProjectSkillEntry } from '@/lib/projectSkills';

/**
 * 컴포저 `/` 인라인 자동완성 상태 머신.
 * 프롬프트가 슬래시 토큰 하나로만 이뤄진 동안 열리고,
 * 키보드(↑/↓/Enter/Tab/ESC)와 바깥 탭을 처리한다.
 * 선택 직후(`/cmd `)에는 인자 힌트 엔트리를 노출한다.
 */
export function useSlashAutocomplete({
  containerRef,
  disabled = false,
  entries,
  loadEntries,
  loading,
  onApply,
  prompt,
  recentCommands,
}: {
  containerRef: RefObject<HTMLElement | null>;
  disabled?: boolean;
  entries: ProjectSkillEntry[];
  loadEntries: () => void | Promise<void>;
  loading: boolean;
  onApply: (entry: ProjectSkillEntry) => void;
  prompt: string;
  recentCommands: string[];
}) {
  const slashQuery = useMemo(() => /^\/(\S*)$/.exec(prompt)?.[1] ?? null, [prompt]);
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    // ESC/바깥 탭으로 닫아도 다음 입력에서 다시 열린다
    setDismissed(false);
    setActiveIndex(0);
  }, [prompt]);

  const matches = useMemo(
    () => (slashQuery === null ? [] : filterSkillEntriesForAutocomplete(entries, slashQuery, recentCommands)),
    [slashQuery, entries, recentCommands],
  );

  const open = slashQuery !== null
    && !dismissed
    && !disabled
    && (loading || matches.length > 0);

  useEffect(() => {
    if (slashQuery !== null && !dismissed && !disabled) {
      void loadEntries();
    }
  }, [slashQuery, dismissed, disabled, loadEntries]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const dismissOnOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setDismissed(true);
      }
    };
    document.addEventListener('pointerdown', dismissOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', dismissOnOutsidePointer);
  }, [open, containerRef]);

  const argumentHintEntry = useMemo(
    () => (disabled ? null : findArgumentHintEntry(entries, prompt)),
    [disabled, entries, prompt],
  );

  /** 자동완성이 소비한 키 입력이면 true를 반환한다. */
  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!open || matches.length === 0) {
      return false;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % matches.length);
      return true;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + matches.length) % matches.length);
      return true;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setDismissed(true);
      return true;
    }
    if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey)) {
      event.preventDefault();
      onApply(matches[activeIndex] ?? matches[0]);
      return true;
    }
    return false;
  }, [open, matches, activeIndex, onApply]);

  return {
    activeIndex,
    argumentHintEntry,
    handleKeyDown,
    matches,
    open,
    setActiveIndex,
  };
}
