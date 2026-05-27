'use client';

import { AlertCircle, Check, X } from 'lucide-react';
import type { PermissionDecision, PermissionRequest } from '@/lib/happy/types';

type ProjectPermissionRequestMessageProps = {
  permission: PermissionRequest;
  disabled: boolean;
  loading: boolean;
  interactive?: boolean;
  pendingHint?: string | null;
  onDecide: (permissionId: string, decision: PermissionDecision) => void | Promise<void>;
};

function riskLabel(risk: PermissionRequest['risk']): string {
  if (risk === 'high') return 'HIGH RISK';
  if (risk === 'low') return 'LOW RISK';
  return 'MEDIUM RISK';
}

function stateLabel(state: PermissionRequest['state']): string {
  if (state === 'approved') return '승인됨';
  if (state === 'denied') return '거절됨';
  return '대기 중';
}

function formatRequestedTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ProjectPermissionRequestMessage({
  permission,
  disabled,
  loading,
  interactive = true,
  pendingHint = null,
  onDecide,
}: ProjectPermissionRequestMessageProps) {
  const isPending = permission.state === 'pending';
  const isApproved = permission.state === 'approved';

  return (
    <>
      <span className="msg__avatar msg__avatar--permission" aria-hidden="true">
        <AlertCircle size={15} />
      </span>
      <div className="msg__body">
        <div className="msg__header">
          <span className="msg__name">Permission Request</span>
          <span className="msg__time">{formatRequestedTime(permission.requestedAt)}</span>
        </div>
        <article className="pc-permission" data-state={permission.state} data-risk={permission.risk}>
          <div className="pc-permission__head">
            <span className="pc-permission__risk">{riskLabel(permission.risk)}</span>
            <span className="pc-permission__state">{stateLabel(permission.state)}</span>
          </div>
          <p className="pc-permission__command">{permission.command}</p>
          <p className="pc-permission__reason">{permission.reason}</p>

          {isPending ? (
            !interactive ? (
              <p className="pc-permission__hint">
                {pendingHint ?? '실시간 승인 세션을 찾을 수 없습니다. 에이전트를 다시 실행해 주세요.'}
              </p>
            ) : disabled ? (
              <p className="pc-permission__hint">Operator 권한이 필요합니다.</p>
            ) : (
              <div className="pc-permission__actions">
                <button
                  type="button"
                  className="pc-permission__button pc-permission__button--deny"
                  onClick={() => onDecide(permission.id, 'deny')}
                  disabled={loading}
                >
                  거절
                </button>
                <button
                  type="button"
                  className="pc-permission__button pc-permission__button--session"
                  onClick={() => onDecide(permission.id, 'allow_session')}
                  disabled={loading}
                >
                  워크스페이스 허용
                </button>
                <button
                  type="button"
                  className="pc-permission__button pc-permission__button--once"
                  onClick={() => onDecide(permission.id, 'allow_once')}
                  disabled={loading}
                >
                  1회 허용
                </button>
              </div>
            )
          ) : (
            <div className="pc-permission__decision" role="status" aria-live="polite">
              {isApproved ? <Check size={14} /> : <X size={14} />}
              <span>{isApproved ? '권한 요청이 승인되었습니다.' : '권한 요청이 거절되었습니다.'}</span>
            </div>
          )}
        </article>
      </div>
    </>
  );
}
