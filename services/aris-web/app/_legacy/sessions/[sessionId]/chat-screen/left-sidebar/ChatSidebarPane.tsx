'use client';

import React, { useMemo, useState } from 'react';
import type { ComponentType, RefObject } from 'react';
import { MessageSquarePlus, Search, X } from 'lucide-react';
import type { ChatSidebarSectionKey } from '../types';
import styles from '../../ChatInterface.module.css';
import { ChatSidebarItem, type ChatSidebarItemViewModel } from './ChatSidebarItem';
import { ChatSidebarSection } from './ChatSidebarSection';

export type ChatSidebarSectionViewModel = {
  key: ChatSidebarSectionKey;
  label: string;
  totalCount: number;
  items: ChatSidebarItemViewModel[];
};

export function ChatSidebarPane({
  sessionTitle,
  chatCount,
  chatMutationError,
  isWorkspaceHome,
  isCreatingChat,
  isChatSidebarOpen,
  isMobileLayout,
  isLeftSidebarOverlayLayout,
  isMounted,
  hasMoreChats,
  sections,
  sidebarRef,
  chatListRef,
  chatListSentinelRef,
  actionMenuRef,
  onCloseSidebar,
  onGoHome,
  onCreateChat,
  RelativeTimeComponent,
  ElapsedTimerComponent,
}: {
  sessionTitle: string;
  chatCount: number;
  chatMutationError: string | null;
  isWorkspaceHome: boolean;
  isCreatingChat: boolean;
  isChatSidebarOpen: boolean;
  isMobileLayout: boolean;
  isLeftSidebarOverlayLayout: boolean;
  isMounted: boolean;
  hasMoreChats: boolean;
  sections: ChatSidebarSectionViewModel[];
  sidebarRef: RefObject<HTMLElement | null>;
  chatListRef: RefObject<HTMLDivElement | null>;
  chatListSentinelRef: RefObject<HTMLDivElement | null>;
  actionMenuRef: RefObject<HTMLDivElement | null>;
  onCloseSidebar: () => void;
  onGoHome: () => void;
  onCreateChat: () => void;
  RelativeTimeComponent: ComponentType<{ timestamp: string; className?: string }>;
  ElapsedTimerComponent: ComponentType<{ since: string; className?: string }>;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredSections = useMemo(() => {
    if (!normalizedSearchQuery) {
      return sections;
    }

    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          return `${item.title} ${item.previewText} ${item.runPhaseLabel ?? ''}`.toLowerCase().includes(normalizedSearchQuery);
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [normalizedSearchQuery, sections]);

  return (
    <>
      {isLeftSidebarOverlayLayout && isChatSidebarOpen && (
        <button
          type="button"
          className={styles.chatSidebarBackdrop}
          onClick={onCloseSidebar}
          aria-label="채팅 사이드바 닫기"
        />
      )}
      <aside
        ref={sidebarRef}
        className={`${styles.chatSidebar} ${styles.csSidebar} ${
          isChatSidebarOpen ? styles.chatSidebarOpen : styles.chatSidebarClosed
        } ${isMobileLayout ? styles.chatSidebarMobile : ''} ${
          isLeftSidebarOverlayLayout ? styles.chatSidebarOverlay : ''
        }`}
      >
        <div className={`${styles.chatSidebarHeader} ${styles.csSidebarTop}`}>
          <button
            type="button"
            className={`${styles.chatSidebarBrand} ${isWorkspaceHome ? styles.chatSidebarBrandActive : ''}`}
            onClick={onGoHome}
            title="워크스페이스 홈"
          >
            <span className={`${styles.chatSidebarBrandMark} ${styles.csSidebarLogo}`}>A</span>
            <span className={`${styles.chatSidebarBrandText} ${styles.csSidebarBrand}`}>
              <span className={`${styles.chatSidebarWordmark} ${styles.csSidebarBrandName}`}>ARIS</span>
              <span className={`${styles.chatSidebarProjectName} ${styles.csSidebarBrandSub}`}>v1.0.0</span>
            </span>
          </button>
        </div>

        <div className={styles.createChatMenuWrap}>
          <button
            type="button"
            className={`${styles.chatSidebarNewButton} ${styles.csSidebarNewchat}`}
            onClick={onCreateChat}
            disabled={isCreatingChat}
            title="새 채팅"
          >
            <span className={styles.csSidebarNewchatLeft}>
              <MessageSquarePlus size={15} />
              New chat
            </span>
          </button>
        </div>

        {chatMutationError && <div className={styles.chatSidebarError}>{chatMutationError}</div>}

        <div className={styles.chatSidebarListWrap}>
          <label className={`${styles.chatSidebarSearch} ${styles.csSidebarSearch}`}>
            <Search size={14} />
            <input
              className={styles.chatSidebarSearchInput}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search chats"
              aria-label="채팅 검색"
            />
            {searchQuery && (
              <button
                type="button"
                className={styles.chatSidebarSearchClear}
                onClick={() => setSearchQuery('')}
                aria-label="검색어 지우기"
              >
                <X size={12} />
              </button>
            )}
            <kbd>⌘K</kbd>
          </label>
          <div className={styles.chatSidebarListHead}>
            <span className={styles.chatSidebarListLabel}>채팅 {chatCount}개</span>
          </div>
          <div ref={chatListRef} className={`${styles.chatList} ${styles.csSidebarList}`}>
            {filteredSections.map((section, sectionIndex) => (
              <ChatSidebarSection
                key={section.key}
                section={section}
                sectionIndex={sectionIndex}
                showInfiniteSentinel={!normalizedSearchQuery && section.key === 'history' && hasMoreChats}
                sentinelRef={section.key === 'history' ? chatListSentinelRef : undefined}
              >
                {section.items.map((item) => (
                  <ChatSidebarItem
                    key={item.id}
                    item={item}
                    isMounted={isMounted}
                    actionMenuRef={actionMenuRef}
                    RelativeTimeComponent={RelativeTimeComponent}
                    ElapsedTimerComponent={ElapsedTimerComponent}
                  />
                ))}
              </ChatSidebarSection>
            ))}
          </div>
        </div>
        <div className={styles.csSidebarBottom}>
          <div className={styles.csSidebarUser}>
            <span className={`${styles.chatSidebarBrandMark} ${styles.csSidebarLogo}`}>A</span>
            <span className={styles.csSidebarUserInfo}>
              <span className={styles.csSidebarUserName}>{sessionTitle}</span>
              <span className={styles.csSidebarUserPlan}>Pro · 200k ctx</span>
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
