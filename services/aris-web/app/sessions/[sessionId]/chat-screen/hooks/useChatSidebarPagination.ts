import { useEffect, useState, type RefObject } from 'react';
import { SIDEBAR_CHAT_PAGE_SIZE } from '../constants';

type Params = {
  chatHistoryCount: number;
  chatListRef: RefObject<HTMLDivElement | null>;
  chatListSentinelRef: RefObject<HTMLDivElement | null>;
  isChatSidebarOpen: boolean;
};

export function useChatSidebarPagination({
  chatHistoryCount,
  chatListRef,
  chatListSentinelRef,
  isChatSidebarOpen,
}: Params) {
  const [chatVisibleCount, setChatVisibleCount] = useState(SIDEBAR_CHAT_PAGE_SIZE);
  const hasMoreChats = chatHistoryCount > chatVisibleCount;

  useEffect(() => {
    setChatVisibleCount((prev) => {
      const nextMax = Math.max(SIDEBAR_CHAT_PAGE_SIZE, chatHistoryCount);
      return Math.min(prev, nextMax);
    });
  }, [chatHistoryCount]);

  useEffect(() => {
    const listElement = chatListRef.current;
    const sentinelElement = chatListSentinelRef.current;
    if (!isChatSidebarOpen || !listElement || !sentinelElement || !hasMoreChats) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) {
          return;
        }
        setChatVisibleCount((prev) => (
          prev >= chatHistoryCount
            ? prev
            : Math.min(prev + SIDEBAR_CHAT_PAGE_SIZE, chatHistoryCount)
        ));
      },
      {
        root: listElement,
        rootMargin: '0px 0px 140px 0px',
        threshold: 0.1,
      },
    );

    observer.observe(sentinelElement);
    return () => {
      observer.disconnect();
    };
  }, [chatHistoryCount, chatListRef, chatListSentinelRef, hasMoreChats, isChatSidebarOpen]);

  return {
    chatVisibleCount,
    hasMoreChats,
  };
}
