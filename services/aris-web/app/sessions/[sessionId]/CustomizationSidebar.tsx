'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Blocks,
  CheckCircle2,
  FileText,
  FolderKanban,
  GitBranch,
  type LucideIcon,
  Loader2,
  PlugZap,
  RefreshCw,
  Save,
  TerminalSquare,
  Wrench,
} from 'lucide-react';
import styles from './CustomizationSidebar.module.css';

type SidebarSurface = 'customization' | 'files' | 'git' | 'terminal';
type CustomizationSection = 'instructions' | 'skills' | 'mcp';

type InstructionDocSummary = {
  id: string;
  name: string;
  path: string;
  exists: boolean;
  sizeBytes: number | null;
  updatedAt: string | null;
};

type SkillSummary = {
  id: string;
  name: string;
  description: string;
  source: 'agents' | 'codex';
  relativePath: string;
};

type MpcServerSummary = {
  id: string;
  name: string;
  status: 'connected' | 'needs_auth' | 'failed' | 'connecting' | 'unknown';
  source: string;
  detail: string;
  lastSeenAt: string | null;
};

type CustomizationOverview = {
  workspacePath: string;
  instructionDocs: InstructionDocSummary[];
  skills: SkillSummary[];
  mcpServers: MpcServerSummary[];
};

type InstructionPayload = {
  content: string;
  summary: InstructionDocSummary;
};

type SkillPayload = {
  content: string;
  summary: SkillSummary;
};

type Props = {
  sessionId: string;
  projectName: string;
};

const SURFACE_ITEMS: Array<{
  id: SidebarSurface;
  label: string;
  hint: string;
  Icon: LucideIcon;
  disabled?: boolean;
}> = [
  { id: 'customization', label: 'Customization', hint: '활성', Icon: Wrench },
  { id: 'files', label: 'Files', hint: '다음 단계', Icon: FolderKanban, disabled: true },
  { id: 'git', label: 'Git', hint: '다음 단계', Icon: GitBranch, disabled: true },
  { id: 'terminal', label: 'Terminal', hint: '다음 단계', Icon: TerminalSquare, disabled: true },
];

function formatTimestamp(value: string | null): string {
  if (!value) return '시간 정보 없음';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function formatBytes(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return '--';
  }
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}KB`;
  return `${(value / (1024 * 1024)).toFixed(1)}MB`;
}

function getMcpStatusClass(status: MpcServerSummary['status']): string {
  if (status === 'connected') return styles.tagGood;
  if (status === 'needs_auth') return styles.tagWarn;
  if (status === 'failed') return styles.tagDanger;
  return styles.tagMuted;
}

function getMcpStatusLabel(status: MpcServerSummary['status']): string {
  if (status === 'connected') return '연결됨';
  if (status === 'needs_auth') return '인증 필요';
  if (status === 'failed') return '실패';
  if (status === 'connecting') return '연결 중';
  return '확인 불가';
}

export function CustomizationSidebar({ sessionId, projectName }: Props) {
  const [activeSurface, setActiveSurface] = useState<SidebarSurface>('customization');
  const [activeSection, setActiveSection] = useState<CustomizationSection>('instructions');
  const [overview, setOverview] = useState<CustomizationOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [selectedInstructionId, setSelectedInstructionId] = useState<string | null>(null);
  const [instructionContent, setInstructionContent] = useState('');
  const [instructionLoading, setInstructionLoading] = useState(false);
  const [instructionSaving, setInstructionSaving] = useState(false);
  const [instructionDirty, setInstructionDirty] = useState(false);
  const [instructionStatus, setInstructionStatus] = useState<string | null>(null);

  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [skillContent, setSkillContent] = useState('');
  const [skillLoading, setSkillLoading] = useState(false);
  const [skillError, setSkillError] = useState<string | null>(null);

  const selectedInstruction = useMemo(
    () => overview?.instructionDocs.find((doc) => doc.id === selectedInstructionId) ?? null,
    [overview, selectedInstructionId],
  );
  const selectedSkill = useMemo(
    () => overview?.skills.find((skill) => skill.id === selectedSkillId) ?? null,
    [overview, selectedSkillId],
  );

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(sessionId)}/customization`, {
        cache: 'no-store',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Customization 정보를 불러오지 못했습니다.');
      }

      const nextOverview = data as CustomizationOverview;
      setOverview(nextOverview);
      setSelectedInstructionId((prev) => {
        if (prev && nextOverview.instructionDocs.some((doc) => doc.id === prev)) {
          return prev;
        }
        return nextOverview.instructionDocs.find((doc) => doc.exists)?.id
          ?? nextOverview.instructionDocs[0]?.id
          ?? null;
      });
      setSelectedSkillId((prev) => {
        if (prev && nextOverview.skills.some((skill) => skill.id === prev)) {
          return prev;
        }
        return nextOverview.skills[0]?.id ?? null;
      });
    } catch (error) {
      setOverviewError(error instanceof Error ? error.message : 'Customization 정보를 불러오지 못했습니다.');
    } finally {
      setOverviewLoading(false);
    }
  }, [sessionId]);

  const loadInstruction = useCallback(async (instructionId: string) => {
    setInstructionLoading(true);
    setInstructionStatus(null);
    try {
      const response = await fetch(
        `/api/runtime/sessions/${encodeURIComponent(sessionId)}/customization?kind=instruction&id=${encodeURIComponent(instructionId)}`,
        { cache: 'no-store' },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error(typeof data?.error === 'string' ? data.error : '문서를 불러오지 못했습니다.');
      }

      setInstructionContent((data as InstructionPayload).content);
      setInstructionDirty(false);
    } catch (error) {
      setInstructionStatus(error instanceof Error ? error.message : '문서를 불러오지 못했습니다.');
      setInstructionContent('');
    } finally {
      setInstructionLoading(false);
    }
  }, [sessionId]);

  const loadSkill = useCallback(async (skillId: string) => {
    setSkillLoading(true);
    setSkillError(null);
    try {
      const response = await fetch(
        `/api/runtime/sessions/${encodeURIComponent(sessionId)}/customization?kind=skill&id=${encodeURIComponent(skillId)}`,
        { cache: 'no-store' },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error(typeof data?.error === 'string' ? data.error : '스킬 내용을 불러오지 못했습니다.');
      }

      setSkillContent((data as SkillPayload).content);
    } catch (error) {
      setSkillError(error instanceof Error ? error.message : '스킬 내용을 불러오지 못했습니다.');
      setSkillContent('');
    } finally {
      setSkillLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!selectedInstructionId) return;
    void loadInstruction(selectedInstructionId);
  }, [loadInstruction, selectedInstructionId]);

  useEffect(() => {
    if (!selectedSkillId) return;
    void loadSkill(selectedSkillId);
  }, [loadSkill, selectedSkillId]);

  const handleSaveInstruction = useCallback(async () => {
    if (!selectedInstructionId) return;
    setInstructionSaving(true);
    setInstructionStatus(null);
    try {
      const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(sessionId)}/customization`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'instruction',
          id: selectedInstructionId,
          content: instructionContent,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error(typeof data?.error === 'string' ? data.error : '문서를 저장하지 못했습니다.');
      }

      setInstructionDirty(false);
      setInstructionStatus('저장됨');
      await loadOverview();
    } catch (error) {
      setInstructionStatus(error instanceof Error ? error.message : '문서를 저장하지 못했습니다.');
    } finally {
      setInstructionSaving(false);
    }
  }, [instructionContent, loadOverview, selectedInstructionId, sessionId]);

  const headerWorkspacePath = overview?.workspacePath ?? projectName;

  return (
    <aside className={styles.sidebarRoot}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <div className={styles.eyebrow}>
              <Wrench size={13} />
              Workspace Sidebar
            </div>
            <h3 className={styles.title}>Customization</h3>
            <p className={styles.subtle}>지침 문서, Skills, MCP 상태를 한 곳에서 확인하고 조정합니다.</p>
          </div>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => void loadOverview()}
            disabled={overviewLoading}
            aria-label="Customization 새로고침"
            title="Customization 새로고침"
          >
            <RefreshCw size={15} className={overviewLoading ? styles.rotate : ''} />
          </button>
        </div>

        <span className={styles.workspacePath}>{headerWorkspacePath}</span>

        <div className={styles.surfaceTabs}>
          {SURFACE_ITEMS.map(({ id, label, hint, Icon, disabled }) => {
            const isActive = activeSurface === id;
            return (
              <button
                key={id}
                type="button"
                className={`${styles.surfaceTab} ${isActive ? styles.surfaceTabActive : ''} ${disabled ? styles.surfaceTabDisabled : ''}`}
                onClick={() => {
                  if (!disabled) {
                    setActiveSurface(id);
                  }
                }}
                disabled={disabled}
              >
                <Icon size={14} />
                <span className={styles.surfaceTabLabel}>{label}</span>
                <span className={styles.surfaceTabHint}>{hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.body}>
        {activeSurface !== 'customization' ? (
          <div className={styles.content}>
            <div className={styles.emptyState}>
              <FolderKanban size={18} />
              <p>이 패널은 다음 구현 단계에서 연결됩니다.</p>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.sectionTabs}>
              <button
                type="button"
                className={`${styles.sectionTab} ${activeSection === 'instructions' ? styles.sectionTabActive : ''}`}
                onClick={() => setActiveSection('instructions')}
              >
                지침 문서
              </button>
              <button
                type="button"
                className={`${styles.sectionTab} ${activeSection === 'skills' ? styles.sectionTabActive : ''}`}
                onClick={() => setActiveSection('skills')}
              >
                Skills
              </button>
              <button
                type="button"
                className={`${styles.sectionTab} ${activeSection === 'mcp' ? styles.sectionTabActive : ''}`}
                onClick={() => setActiveSection('mcp')}
              >
                MCP
              </button>
            </div>

            <div className={styles.content}>
              {overviewLoading && !overview ? (
                <div className={styles.loadingState}>
                  <Loader2 size={18} className={styles.rotate} />
                  <p>Customization 데이터를 불러오는 중입니다.</p>
                </div>
              ) : overviewError ? (
                <div className={styles.errorState}>
                  <FileText size={18} />
                  <p>{overviewError}</p>
                </div>
              ) : overview ? (
                <>
                  <div className={styles.statsRow}>
                    <div className={styles.statCard}>
                      <span className={styles.statValue}>{overview.instructionDocs.filter((doc) => doc.exists).length}</span>
                      <span className={styles.statLabel}>지침 문서</span>
                    </div>
                    <div className={styles.statCard}>
                      <span className={styles.statValue}>{overview.skills.length}</span>
                      <span className={styles.statLabel}>Skills</span>
                    </div>
                    <div className={styles.statCard}>
                      <span className={styles.statValue}>{overview.mcpServers.length}</span>
                      <span className={styles.statLabel}>MCP Servers</span>
                    </div>
                  </div>

                  {activeSection === 'instructions' && (
                    <div className={styles.splitPane}>
                      <div className={styles.listCard}>
                        <div className={styles.cardHeader}>
                          <span className={styles.cardTitle}>문서 목록</span>
                          <span className={styles.cardMeta}>{overview.instructionDocs.length}개</span>
                        </div>
                        <div className={styles.itemList}>
                          {overview.instructionDocs.map((doc) => (
                            <button
                              key={doc.id}
                              type="button"
                              className={`${styles.itemButton} ${selectedInstructionId === doc.id ? styles.itemButtonActive : ''}`}
                              onClick={() => setSelectedInstructionId(doc.id)}
                            >
                              <span className={styles.itemTitleRow}>
                                <FileText size={13} />
                                <span className={styles.itemTitle}>{doc.name}</span>
                              </span>
                              <span className={styles.itemDescription}>
                                {doc.exists ? `${formatBytes(doc.sizeBytes)} · ${formatTimestamp(doc.updatedAt)}` : '아직 생성되지 않음'}
                              </span>
                              <span className={`${styles.tag} ${doc.exists ? styles.tagGood : styles.tagWarn}`}>
                                {doc.exists ? '사용 중' : '생성 가능'}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className={styles.detailCard}>
                        <div className={styles.cardHeader}>
                          <span className={styles.cardTitle}>문서 편집</span>
                          <span className={styles.cardMeta}>
                            {selectedInstruction ? selectedInstruction.name : '선택 없음'}
                          </span>
                        </div>
                        {selectedInstruction ? (
                          <div className={styles.detailBody}>
                            <div>
                              <h4 className={styles.detailTitle}>{selectedInstruction.name}</h4>
                              <p className={styles.detailSubtle}>{selectedInstruction.path}</p>
                            </div>
                            {instructionLoading ? (
                              <div className={styles.loadingState}>
                                <Loader2 size={16} className={styles.rotate} />
                                <p>문서를 불러오는 중입니다.</p>
                              </div>
                            ) : (
                              <>
                                <textarea
                                  className={styles.editor}
                                  value={instructionContent}
                                  onChange={(event) => {
                                    setInstructionContent(event.target.value);
                                    setInstructionDirty(true);
                                    setInstructionStatus(null);
                                  }}
                                  spellCheck={false}
                                />
                                <div className={styles.actions}>
                                  <span className={styles.statusText}>
                                    {instructionStatus
                                      ?? (instructionDirty ? '저장되지 않은 변경사항 있음' : '변경사항 없음')}
                                  </span>
                                  <button
                                    type="button"
                                    className={styles.saveButton}
                                    onClick={() => void handleSaveInstruction()}
                                    disabled={instructionSaving || instructionLoading || !instructionDirty}
                                  >
                                    {instructionSaving ? <Loader2 size={14} className={styles.rotate} /> : <Save size={14} />}
                                    저장
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className={styles.emptyState}>
                            <FileText size={18} />
                            <p>편집할 문서를 선택해 주세요.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeSection === 'skills' && (
                    <div className={styles.splitPane}>
                      <div className={styles.listCard}>
                        <div className={styles.cardHeader}>
                          <span className={styles.cardTitle}>Skill 목록</span>
                          <span className={styles.cardMeta}>{overview.skills.length}개</span>
                        </div>
                        <div className={styles.itemList}>
                          {overview.skills.map((skill) => (
                            <button
                              key={skill.id}
                              type="button"
                              className={`${styles.itemButton} ${selectedSkillId === skill.id ? styles.itemButtonActive : ''}`}
                              onClick={() => setSelectedSkillId(skill.id)}
                            >
                              <span className={styles.itemTitleRow}>
                                <Blocks size={13} />
                                <span className={styles.itemTitle}>{skill.name}</span>
                              </span>
                              <span className={styles.itemDescription}>{skill.description}</span>
                              <span className={`${styles.tag} ${skill.source === 'codex' ? styles.tagWarn : styles.tagMuted}`}>
                                {skill.source === 'codex' ? 'Codex' : 'Agents'}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className={styles.detailCard}>
                        <div className={styles.cardHeader}>
                          <span className={styles.cardTitle}>Skill 본문</span>
                          <span className={styles.cardMeta}>{selectedSkill?.relativePath ?? '선택 없음'}</span>
                        </div>
                        {selectedSkill ? (
                          <div className={styles.detailBody}>
                            <div>
                              <h4 className={styles.detailTitle}>{selectedSkill.name}</h4>
                              <p className={styles.detailSubtle}>{selectedSkill.description}</p>
                            </div>
                            {skillLoading ? (
                              <div className={styles.loadingState}>
                                <Loader2 size={16} className={styles.rotate} />
                                <p>스킬 본문을 불러오는 중입니다.</p>
                              </div>
                            ) : skillError ? (
                              <div className={styles.errorState}>
                                <Blocks size={18} />
                                <p>{skillError}</p>
                              </div>
                            ) : (
                              <div className={styles.preview}>
                                <pre>{skillContent}</pre>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className={styles.emptyState}>
                            <Blocks size={18} />
                            <p>확인할 Skill을 선택해 주세요.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeSection === 'mcp' && (
                    <>
                      {overview.mcpServers.length === 0 ? (
                        <div className={styles.emptyState}>
                          <PlugZap size={18} />
                          <p>감지된 MCP 서버가 없습니다.</p>
                        </div>
                      ) : (
                        <div className={styles.mcpList}>
                          {overview.mcpServers.map((server) => (
                            <article key={server.id} className={styles.mcpCard}>
                              <div className={styles.mcpHeader}>
                                <div className={styles.mcpTitle}>{server.name}</div>
                                <span className={`${styles.tag} ${getMcpStatusClass(server.status)}`}>
                                  {getMcpStatusLabel(server.status)}
                                </span>
                              </div>
                              <div className={styles.mcpMeta}>
                                <span className={styles.tag}>{server.source}</span>
                                <span className={styles.tag}>{formatTimestamp(server.lastSeenAt)}</span>
                              </div>
                              <div className={styles.mcpDetail}>{server.detail}</div>
                            </article>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <div className={styles.emptyState}>
                  <CheckCircle2 size={18} />
                  <p>표시할 Customization 데이터가 없습니다.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
