import { Blocks, CheckCircle2, FileText, Loader2, PlugZap } from 'lucide-react';
import styles from '../../CustomizationSidebar.module.css';
import { formatBytes, formatTimestamp, getMcpStatusClass, getMcpStatusLabel } from '../shared';
import type { CustomizationOverview, CustomizationSection } from '../types';

type Props = {
  activeSection: CustomizationSection;
  overview: CustomizationOverview | null;
  overviewLoading: boolean;
  overviewError: string | null;
  selectedInstructionId: string | null;
  selectedSkillId: string | null;
  onOpenInstruction: (instructionId: string) => void;
  onOpenSkill: (skillId: string) => void;
  onSectionChange: (section: CustomizationSection) => void;
};

export function CustomizationOverviewSection({
  activeSection,
  overview,
  overviewError,
  overviewLoading,
  selectedInstructionId,
  selectedSkillId,
  onOpenInstruction,
  onOpenSkill,
  onSectionChange,
}: Props) {
  return (
    <>
      <div className={styles.sectionTabs}>
        <button
          type="button"
          className={`${styles.sectionTab} ${activeSection === 'instructions' ? styles.sectionTabActive : ''}`}
          onClick={() => onSectionChange('instructions')}
        >
          AGENTS.md
        </button>
        <button
          type="button"
          className={`${styles.sectionTab} ${activeSection === 'skills' ? styles.sectionTabActive : ''}`}
          onClick={() => onSectionChange('skills')}
        >
          Skills
        </button>
        <button
          type="button"
          className={`${styles.sectionTab} ${activeSection === 'mcp' ? styles.sectionTabActive : ''}`}
          onClick={() => onSectionChange('mcp')}
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
              <div className={styles.listCard}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardTitle}>AGENTS.md</span>
                  <span className={styles.cardMeta}>{overview.instructionDocs.length}개</span>
                </div>
                <div className={`${styles.itemList} ${styles.documentGrid}`}>
                  {overview.instructionDocs.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      className={`${styles.itemButton} ${styles.documentTile} ${selectedInstructionId === doc.id ? styles.itemButtonActive : ''}`}
                      onClick={() => onOpenInstruction(doc.id)}
                    >
                      <span className={styles.itemTitleRow}>
                        <FileText size={14} />
                        <span className={styles.itemTitle}>{doc.name}</span>
                      </span>
                      <span className={styles.itemDescription}>
                        {doc.exists ? `${formatBytes(doc.sizeBytes)} · ${formatTimestamp(doc.updatedAt)}` : '아직 생성되지 않음'}
                      </span>
                      <span className={`${styles.tag} ${doc.exists ? styles.tagGood : styles.tagWarn}`}>
                        {doc.exists ? '열기' : '새로 작성'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeSection === 'skills' && (
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
                      onClick={() => onOpenSkill(skill.id)}
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
  );
}
