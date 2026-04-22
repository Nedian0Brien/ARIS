'use client';

import React from 'react';
import { AlertTriangle, Blocks, CheckCircle2, FileText, Loader2, PlugZap, Save } from 'lucide-react';
import styles from './WorkspaceShell.module.css';
import type {
  CustomizationOverview,
  CustomizationSection,
  InstructionDocSummary,
  MpcServerSummary,
  SkillSummary,
} from '../customization-sidebar/types';
import { formatBytes, formatTimestamp } from '../customization-sidebar/shared';

type Props = {
  activeSection: CustomizationSection;
  instructionContent: string;
  instructionDirty: boolean;
  instructionLoading: boolean;
  instructionSaving: boolean;
  instructionStatus: string | null;
  overview: CustomizationOverview | null;
  overviewError: string | null;
  overviewLoading: boolean;
  selectedInstruction: InstructionDocSummary | null;
  selectedInstructionId: string | null;
  selectedMcp: MpcServerSummary | null;
  selectedMcpId: string | null;
  selectedSkill: SkillSummary | null;
  selectedSkillId: string | null;
  skillContent: string;
  skillError: string | null;
  skillLoading: boolean;
  onInstructionChange: (value: string) => void;
  onOpenInstruction: (instructionId: string) => void;
  onOpenSkill: (skillId: string) => void;
  onSaveInstruction: () => void;
  onSectionChange: (section: CustomizationSection) => void;
  onSelectMcp: (mcpId: string) => void;
};

function getMcpTone(status: MpcServerSummary['status']): string {
  if (status === 'connected') return styles.toneGood;
  if (status === 'needs_auth') return styles.toneWarn;
  if (status === 'failed') return styles.toneDanger;
  return styles.toneMuted;
}

function getMcpStatusLabel(status: MpcServerSummary['status']): string {
  if (status === 'connected') return '연결됨';
  if (status === 'needs_auth') return '인증 필요';
  if (status === 'failed') return '실패';
  if (status === 'connecting') return '연결 중';
  return '확인 불가';
}

export function WorkspaceContextPane({
  activeSection,
  instructionContent,
  instructionDirty,
  instructionLoading,
  instructionSaving,
  instructionStatus,
  overview,
  overviewError,
  overviewLoading,
  selectedInstruction,
  selectedInstructionId,
  selectedMcp,
  selectedMcpId,
  selectedSkill,
  selectedSkillId,
  skillContent,
  skillError,
  skillLoading,
  onInstructionChange,
  onOpenInstruction,
  onOpenSkill,
  onSaveInstruction,
  onSectionChange,
  onSelectMcp,
}: Props) {
  const renderList = () => {
    if (overviewLoading && !overview) {
      return (
        <div className={styles.workspaceEmptyState}>
          <Loader2 size={18} className={styles.rotate} />
          <p>Context 정보를 불러오는 중입니다.</p>
        </div>
      );
    }

    if (overviewError) {
      return (
        <div className={styles.workspaceEmptyState}>
          <AlertTriangle size={18} />
          <p>{overviewError}</p>
        </div>
      );
    }

    if (!overview) {
      return (
        <div className={styles.workspaceEmptyState}>
          <CheckCircle2 size={18} />
          <p>표시할 Context 데이터가 없습니다.</p>
        </div>
      );
    }

    if (activeSection === 'instructions') {
      return (
        <div className={styles.contextList}>
          {overview.instructionDocs.map((doc) => (
            <button
              key={doc.id}
              type="button"
              className={`${styles.contextListItem} ${selectedInstructionId === doc.id ? styles.contextListItemActive : ''}`}
              onClick={() => onOpenInstruction(doc.id)}
            >
              <span className={styles.contextListItemTitleRow}>
                <FileText size={14} />
                <span className={styles.contextListItemTitle}>{doc.name}</span>
              </span>
              <span className={styles.contextListItemMeta}>
                {doc.exists ? `${formatBytes(doc.sizeBytes)} · ${formatTimestamp(doc.updatedAt)}` : '아직 생성되지 않음'}
              </span>
            </button>
          ))}
        </div>
      );
    }

    if (activeSection === 'skills') {
      return (
        <div className={styles.contextList}>
          {overview.skills.map((skill) => (
            <button
              key={skill.id}
              type="button"
              className={`${styles.contextListItem} ${selectedSkillId === skill.id ? styles.contextListItemActive : ''}`}
              onClick={() => onOpenSkill(skill.id)}
            >
              <span className={styles.contextListItemTitleRow}>
                <Blocks size={14} />
                <span className={styles.contextListItemTitle}>{skill.name}</span>
              </span>
              <span className={styles.contextListItemMeta}>{skill.description}</span>
            </button>
          ))}
        </div>
      );
    }

    return (
      <div className={styles.contextList}>
        {overview.mcpServers.map((server) => (
          <button
            key={server.id}
            type="button"
            className={`${styles.contextListItem} ${selectedMcpId === server.id ? styles.contextListItemActive : ''}`}
            onClick={() => onSelectMcp(server.id)}
          >
            <span className={styles.contextListItemTitleRow}>
              <PlugZap size={14} />
              <span className={styles.contextListItemTitle}>{server.name}</span>
            </span>
            <span className={styles.contextListItemMeta}>{server.detail}</span>
          </button>
        ))}
      </div>
    );
  };

  const renderDetail = () => {
    if (!overview) {
      return (
        <div className={styles.workspaceEmptyState}>
          <FileText size={18} />
          <p>상세 정보를 표시할 수 없습니다.</p>
        </div>
      );
    }

    if (activeSection === 'instructions') {
      if (!selectedInstruction) {
        return (
          <div className={styles.workspaceEmptyState}>
            <FileText size={18} />
            <p>열 문서를 선택해 주세요.</p>
          </div>
        );
      }

      return (
        <div className={styles.contextDetailStack}>
          <div className={styles.contextDetailMeta}>
            <span className={styles.contextDetailEyebrow}>AGENTS.md</span>
            <h3 className={styles.contextDetailTitle}>{selectedInstruction.name}</h3>
            <p className={styles.contextDetailPath}>{selectedInstruction.path}</p>
          </div>
          <textarea
            className={styles.contextEditor}
            value={instructionContent}
            onChange={(event) => onInstructionChange(event.target.value)}
            disabled={instructionLoading || instructionSaving}
          />
          <div className={styles.contextDetailActions}>
            <span className={styles.contextDetailStatus}>
              {instructionLoading ? '문서를 불러오는 중입니다.' : instructionStatus ?? 'Workspace 안에서 바로 수정할 수 있습니다.'}
            </span>
            <button
              type="button"
              className={styles.contextPrimaryButton}
              onClick={onSaveInstruction}
              disabled={instructionLoading || instructionSaving || !instructionDirty}
            >
              {instructionSaving ? <Loader2 size={14} className={styles.rotate} /> : <Save size={14} />}
              저장
            </button>
          </div>
        </div>
      );
    }

    if (activeSection === 'skills') {
      if (!selectedSkill) {
        return (
          <div className={styles.workspaceEmptyState}>
            <Blocks size={18} />
            <p>볼 Skill을 선택해 주세요.</p>
          </div>
        );
      }

      if (skillLoading) {
        return (
          <div className={styles.workspaceEmptyState}>
            <Loader2 size={18} className={styles.rotate} />
            <p>Skill 내용을 불러오는 중입니다.</p>
          </div>
        );
      }

      if (skillError) {
        return (
          <div className={styles.workspaceEmptyState}>
            <AlertTriangle size={18} />
            <p>{skillError}</p>
          </div>
        );
      }

      return (
        <div className={styles.contextDetailStack}>
          <div className={styles.contextDetailMeta}>
            <span className={styles.contextDetailEyebrow}>Skill</span>
            <h3 className={styles.contextDetailTitle}>{selectedSkill.name}</h3>
            <p className={styles.contextDetailPath}>{selectedSkill.relativePath}</p>
          </div>
          <pre className={styles.contextPreview}>{skillContent}</pre>
        </div>
      );
    }

    if (!selectedMcp) {
      return (
        <div className={styles.workspaceEmptyState}>
          <PlugZap size={18} />
          <p>볼 MCP 서버를 선택해 주세요.</p>
        </div>
      );
    }

    return (
      <div className={styles.contextDetailStack}>
        <div className={styles.contextDetailMeta}>
          <span className={styles.contextDetailEyebrow}>MCP</span>
          <h3 className={styles.contextDetailTitle}>{selectedMcp.name}</h3>
          <p className={styles.contextDetailPath}>{selectedMcp.source}</p>
        </div>
        <div className={styles.contextMcpCard}>
          <div className={styles.contextMcpHeader}>
            <span className={`${styles.contextStatusBadge} ${getMcpTone(selectedMcp.status)}`}>
              {getMcpStatusLabel(selectedMcp.status)}
            </span>
            <span className={styles.contextMcpUpdatedAt}>{formatTimestamp(selectedMcp.lastSeenAt)}</span>
          </div>
          <p className={styles.contextMcpDetail}>{selectedMcp.detail}</p>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.modePaneSplit}>
      <section className={styles.modePaneNavColumn}>
        <div className={styles.contextSectionTabs}>
          <button
            type="button"
            className={`${styles.contextSectionTab} ${activeSection === 'instructions' ? styles.contextSectionTabActive : ''}`}
            onClick={() => onSectionChange('instructions')}
          >
            AGENTS.md
          </button>
          <button
            type="button"
            className={`${styles.contextSectionTab} ${activeSection === 'skills' ? styles.contextSectionTabActive : ''}`}
            onClick={() => onSectionChange('skills')}
          >
            Skills
          </button>
          <button
            type="button"
            className={`${styles.contextSectionTab} ${activeSection === 'mcp' ? styles.contextSectionTabActive : ''}`}
            onClick={() => onSectionChange('mcp')}
          >
            MCP
          </button>
        </div>
        {renderList()}
      </section>
      <section className={styles.modePaneDetailCard}>
        <div className={styles.modePaneDetailBody}>
          {renderDetail()}
        </div>
      </section>
    </div>
  );
}
