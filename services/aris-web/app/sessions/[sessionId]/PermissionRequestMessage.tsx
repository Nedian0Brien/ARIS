'use client';

import { Button } from '@/components/ui';
import type { PermissionDecision, PermissionRequest } from '@/lib/happy/types';
import { CircleCheckBig, CircleX, ShieldAlert } from 'lucide-react';
import styles from './ChatInterface.module.css';

type PermissionRequestMessageProps = {
  permission: PermissionRequest;
  disabled: boolean;
  loading: boolean;
  anchorId?: string;
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

function stateLabel(state: PermissionRequest['state']): string {
  if (state === 'approved') {
    return '승인됨';
  }
  if (state === 'denied') {
    return '거절됨';
  }
  return '대기 중';
}

export function PermissionRequestMessage({
  permission,
  disabled,
  loading,
  anchorId,
  onDecide,
}: PermissionRequestMessageProps) {
  const isPending = permission.state === 'pending';
  const isApproved = permission.state === 'approved';
  const bubbleStateClass = isPending
    ? ''
    : isApproved
      ? styles.permissionMessageBubbleApproved
      : styles.permissionMessageBubbleDenied;

  return (
    <article id={anchorId} className={`${styles.messageRow} ${styles.messageRowAgent}`}>
      <div className={`${styles.messageBubble} ${styles.permissionMessageBubble} ${bubbleStateClass}`}>
        <header className={styles.permissionMessageHeader}>
          <span className={styles.permissionMessageTitle}>
            <ShieldAlert size={14} />
            Permission Request
          </span>
          <div className={styles.permissionHeaderMeta}>
            <span className={styles.permissionTime}>{formatRequestedTime(permission.requestedAt)}</span>
            <span
              className={`${styles.permissionStateChip} ${
                isPending
                  ? styles.permissionStatePending
                  : isApproved
                    ? styles.permissionStateApproved
                    : styles.permissionStateDenied
              }`}
            >
              {stateLabel(permission.state)}
            </span>
          </div>
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

        {isPending ? (
          disabled ? (
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
                워크스페이스 허용
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
          )
        ) : (
          <div
            className={`${styles.permissionDecisionState} ${
              isApproved ? styles.permissionDecisionApproved : styles.permissionDecisionDenied
            }`}
            role="status"
            aria-live="polite"
          >
            {isApproved ? <CircleCheckBig size={15} /> : <CircleX size={15} />}
            <span>{isApproved ? '권한 요청이 승인되었습니다.' : '권한 요청이 거절되었습니다.'}</span>
          </div>
        )}
      </div>
    </article>
  );
}
