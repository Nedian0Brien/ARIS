import { BackendNotice } from '@/components/ui/BackendNotice';
import styles from '../../ChatInterface.module.css';

type ChatStatusNoticesProps = {
  runtimeNotice: string | null;
  showDisconnectRetry: boolean;
  onRetryDisconnected: () => void;
  isRetryDisabled: boolean;
  isSubmitting: boolean;
  effectivePendingPermissionCount: number;
  pendingPermissionsCount: number;
  onJumpToPendingPermission: () => void;
};

export function ChatStatusNotices({
  runtimeNotice,
  showDisconnectRetry,
  onRetryDisconnected,
  isRetryDisabled,
  isSubmitting,
  effectivePendingPermissionCount,
  pendingPermissionsCount,
  onJumpToPendingPermission,
}: ChatStatusNoticesProps) {
  return (
    <>
      {runtimeNotice && (
        <div className={styles.noticeWrap}>
          <BackendNotice message={`백엔드 연결 상태: ${runtimeNotice}`} />
        </div>
      )}

      {showDisconnectRetry && (
        <div className={styles.disconnectNoticeBar} role="status" aria-live="polite">
          <span>에이전트 연결이 중단되었습니다.</span>
          <button
            type="button"
            className={styles.disconnectNoticeAction}
            onClick={onRetryDisconnected}
            disabled={isRetryDisabled}
          >
            {isSubmitting ? '재시도 중...' : '재시도'}
          </button>
        </div>
      )}

      {effectivePendingPermissionCount > 0 && (
        <div className={styles.permissionNoticeBar} role="status" aria-live="polite">
          <span>
            승인 요청 {effectivePendingPermissionCount}건이 대기 중입니다.
            {pendingPermissionsCount === 0 ? ' 실시간 승인 세션이 없어 재실행이 필요할 수 있습니다.' : ''}
          </span>
          <button type="button" className={styles.permissionNoticeAction} onClick={onJumpToPendingPermission}>
            바로 보기
          </button>
        </div>
      )}
    </>
  );
}
