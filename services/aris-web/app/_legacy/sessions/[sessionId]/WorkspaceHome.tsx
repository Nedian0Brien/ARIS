'use client';

import { useMemo } from 'react';
import {
  MessageSquarePlus,
  FolderOpen,
  ChevronLeft,
  CheckCircle2,
  Clock,
  Play,
  Pin,
  ChevronRight,
  Layers,
  Hash,
} from 'lucide-react';
import type { AgentFlavor, SessionChat } from '@/lib/happy/types';
import { ClaudeIcon, GeminiIcon, CodexIcon } from '@/components/ui/AgentIcons';
import styles from './WorkspaceHome.module.css';
import { limitWorkspaceHomeChats } from './workspaceHome';

// --- 타입 ---

interface WorkspaceHomeProps {
  sessionId: string;
  sessionTitle: string;
  projectPath: string;
  agentFlavor: AgentFlavor | string;
  chats: SessionChat[];
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onBack: () => void;
}

// --- 유틸 ---

function formatRelativeTime(isoString: string): string {
  try {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '방금 전';
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}일 전`;
    return new Date(isoString).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function resolveAgentMeta(flavor: AgentFlavor | string): {
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  accentColor: string;
  accentBg: string;
} {
  switch (flavor) {
    case 'claude':
      return {
        label: 'Claude',
        Icon: ClaudeIcon,
        accentColor: 'var(--agent-claude-accent)',
        accentBg: 'var(--agent-claude-bg)',
      };
    case 'gemini':
      return {
        label: 'Gemini',
        Icon: GeminiIcon,
        accentColor: 'var(--agent-gemini-accent)',
        accentBg: 'var(--agent-gemini-bg)',
      };
    case 'codex':
    default:
      return {
        label: 'Codex',
        Icon: CodexIcon,
        accentColor: 'var(--agent-codex-accent)',
        accentBg: 'var(--agent-codex-bg)',
      };
  }
}

type ChatStatus = 'running' | 'unread' | 'idle' | 'pinned';

function resolveChatStatus(chat: SessionChat): ChatStatus {
  if (chat.isPinned) return 'pinned';
  if (chat.latestEventAt) {
    const lastActivity = new Date(chat.lastActivityAt).getTime();
    const lastRead = chat.lastReadAt ? new Date(chat.lastReadAt).getTime() : 0;
    if (lastActivity > lastRead) return 'unread';
  }
  return 'idle';
}

// --- 서브 컴포넌트 ---

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accent: string;
}) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statIconWrap} style={{ '--stat-accent': accent } as React.CSSProperties}>
        <Icon size={16} />
      </div>
      <div className={styles.statBody}>
        <span className={styles.statValue}>{value}</span>
        <span className={styles.statLabel}>{label}</span>
      </div>
    </div>
  );
}

function ChatStatusBadge({ status }: { status: ChatStatus }) {
  if (status === 'unread') {
    return <span className={styles.unreadDot} aria-label="미읽음" />;
  }
  const meta: Record<Exclude<ChatStatus, 'unread'>, { label: string; className: string }> = {
    running: { label: '실행 중', className: styles.statusRunning },
    idle: { label: '유휴', className: styles.statusIdle },
    pinned: { label: '고정', className: styles.statusPinned },
  };
  const { label, className } = meta[status];
  return <span className={`${styles.statusBadge} ${className}`}>{label}</span>;
}

// --- 메인 컴포넌트 ---

export function WorkspaceHome({
  sessionTitle,
  projectPath,
  agentFlavor,
  chats,
  onSelectChat,
  onNewChat,
  onBack,
}: WorkspaceHomeProps) {
  const agentMeta = useMemo(() => resolveAgentMeta(agentFlavor), [agentFlavor]);
  const AgentIcon = agentMeta.Icon;

  const sortedChats = useMemo(
    () => [...chats].sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()),
    [chats],
  );
  const visibleChats = useMemo(() => limitWorkspaceHomeChats(sortedChats), [sortedChats]);

  const stats = useMemo(() => {
    const total = chats.length;
    const completed = chats.filter((c) => {
      const lastActivity = new Date(c.lastActivityAt).getTime();
      const lastRead = c.lastReadAt ? new Date(c.lastReadAt).getTime() : 0;
      return c.latestEventAt && lastActivity > lastRead;
    }).length;
    const pinned = chats.filter((c) => c.isPinned).length;
    return { total, completed, pinned };
  }, [chats]);

  const shortPath = useMemo(() => {
    const parts = projectPath.replace(/\\/g, '/').replace(/\/+$/, '').split('/').filter(Boolean);
    if (parts.length <= 3) return projectPath;
    return `…/${parts.slice(-3).join('/')}`;
  }, [projectPath]);

  return (
    <div className={styles.homeRoot}>
      {/* ── 뒤로가기 ── */}
      <button type="button" className={styles.backButton} onClick={onBack}>
        <ChevronLeft size={14} />
        세션 목록
      </button>

      {/* ── 히어로 카드 ── */}
      <div className={styles.heroCard}>
        <div
          className={styles.heroIcon}
          style={{
            '--agent-accent': agentMeta.accentColor,
            '--agent-bg': agentMeta.accentBg,
          } as React.CSSProperties}
        >
          <AgentIcon size={28} />
        </div>
        <div className={styles.heroInfo}>
          <h1 className={styles.heroTitle}>{sessionTitle}</h1>
          <div className={styles.heroMeta}>
            <FolderOpen size={13} className={styles.heroMetaIcon} />
            <span className={styles.heroMetaPath} title={projectPath}>{shortPath}</span>
            <span className={styles.heroMetaDivider} aria-hidden="true">·</span>
            <span
              className={styles.heroAgentBadge}
              style={{ '--agent-accent': agentMeta.accentColor, '--agent-bg': agentMeta.accentBg } as React.CSSProperties}
            >
              {agentMeta.label}
            </span>
          </div>
        </div>
        <button
          type="button"
          className={styles.newChatHeroButton}
          onClick={onNewChat}
        >
          <MessageSquarePlus size={16} />
          새 채팅
        </button>
      </div>

      {/* ── 수치 요약 ── */}
      <div className={styles.statsRow}>
        <StatCard label="전체 채팅" value={stats.total} icon={Layers} accent="var(--primary)" />
        <StatCard label="미읽음" value={stats.completed} icon={CheckCircle2} accent="#ef4444" />
        <StatCard label="고정됨" value={stats.pinned} icon={Pin} accent="var(--accent-amber)" />
      </div>

      {/* ── 채팅 목록 ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>채팅 목록</span>
          <span className={styles.sectionCount}>{Math.min(chats.length, visibleChats.length)} / {chats.length}개</span>
        </div>

        {sortedChats.length === 0 ? (
          <div className={styles.emptyState}>
            <Hash size={32} className={styles.emptyIcon} />
            <p className={styles.emptyTitle}>아직 채팅이 없습니다</p>
            <p className={styles.emptyDesc}>새 채팅을 시작해서 에이전트와 대화해보세요.</p>
            <button type="button" className={styles.emptyNewChatButton} onClick={onNewChat}>
              <MessageSquarePlus size={15} />
              새 채팅 시작
            </button>
          </div>
        ) : (
          <ul className={styles.chatList}>
            {visibleChats.map((chat) => {
              const status = resolveChatStatus(chat);
              const ChatAgentMeta = resolveAgentMeta(chat.agent);
              const ChatIcon = ChatAgentMeta.Icon;
              const hasPreview = (chat.latestPreview ?? '').trim().length > 0;

              return (
                <li key={chat.id}>
                  <button
                    type="button"
                    className={styles.chatItem}
                    onClick={() => onSelectChat(chat.id)}
                  >
                    <div
                      className={styles.chatItemIcon}
                      style={{
                        '--chat-agent-accent': ChatAgentMeta.accentColor,
                        '--chat-agent-bg': ChatAgentMeta.accentBg,
                      } as React.CSSProperties}
                    >
                      {status === 'running' ? (
                        <Play size={12} className={styles.chatIconRunning} />
                      ) : (
                        <ChatIcon size={12} />
                      )}
                    </div>

                    <div className={styles.chatItemBody}>
                      <div className={styles.chatItemTop}>
                        <span className={styles.chatItemTitle}>{chat.title}</span>
                        <div className={styles.chatItemMeta}>
                          <ChatStatusBadge status={status} />
                          <span className={styles.chatItemTime}>
                            <Clock size={11} />
                            {formatRelativeTime(chat.lastActivityAt)}
                          </span>
                        </div>
                      </div>
                      {hasPreview && (
                        <p className={styles.chatItemPreview}>{chat.latestPreview}</p>
                      )}
                    </div>

                    <ChevronRight size={14} className={styles.chatItemArrow} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── 새 채팅 FAB ── */}
      {chats.length > 0 && (
        <div className={styles.newChatFooter}>
          <button type="button" className={styles.newChatFooterButton} onClick={onNewChat}>
            <MessageSquarePlus size={16} />
            새 채팅 시작
          </button>
        </div>
      )}
    </div>
  );
}
