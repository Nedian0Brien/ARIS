'use client';

import { Button } from '@/components/ui';
import type { PermissionDecision, PermissionRequest } from '@/lib/happy/types';
import { ShieldAlert } from 'lucide-react';
import styles from './ChatInterface.module.css';

type PermissionRequestMessageProps = {
  permission: PermissionRequest;
  disabled: boolean;
  loading: boolean;
  onDecide: (permissionId: string, decision: PermissionDecision) => void;
};

function riskLabel(risk: PermissionRequest['risk']): string {
  if (risk === 'high') {
    return 'HIGH RISK';
  }
  if (risk === 'low') {
    return 'LOW RISK';
  }
  return 'MEDIUM RISK';
}

function formatRequestedTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function PermissionRequestMessage({
  permission,
  disabled,
  loading,
  onDecide,
}: PermissionRequestMessageProps) {
  return (
    <article className={`${styles.messageRow} ${styles.messageRowAgent}`}>
      <div className={`${styles.messageBubble} ${styles.permissionMessageBubble}`}>
        <header className={styles.permissionMessageHeader}>
          <span className={styles.permissionMessageTitle}>
            <ShieldAlert size={14} />
            Permission Request
          </span>
          <span className={styles.permissionTime}>{formatRequestedTime(permission.requestedAt)}</span>
        </header>

        <div className={styles.permissionRiskRow}>
          <span
            className={`${styles.permissionRiskChip} ${
              permission.risk === 'high'
                ? styles.permissionRiskHigh
                : permission.risk === 'low'
                  ? styles.permissionRiskLow
                  : styles.permissionRiskMedium
            }`}
          >
            {riskLabel(permission.risk)}
          </span>
        </div>

        <p className={styles.permissionCommand}>{permission.command}</p>
        <p className={styles.permissionReason}>{permission.reason}</p>

        {disabled ? (
          <p className={styles.permissionViewerHint}>Operator 권한이 필요합니다.</p>
        ) : (
          <div className={styles.permissionActions}>
            <Button
              type="button"
              variant="secondary"
              className={styles.permissionBtn}
              onClick={() => onDecide(permission.id, 'deny')}
              disabled={loading}
            >
              거절
            </Button>
            <Button
              type="button"
              className={styles.permissionBtnAllowSession}
              onClick={() => onDecide(permission.id, 'allow_session')}
              disabled={loading}
            >
              세션 허용
            </Button>
            <Button
              type="button"
              className={styles.permissionBtnAllowOnce}
              onClick={() => onDecide(permission.id, 'allow_once')}
              disabled={loading}
            >
              1회 허용
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}
