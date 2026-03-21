import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { updateSessionApprovalPolicy } from '@/lib/happy/client';
import type { ApprovalPolicy } from '@/lib/happy/types';

/**
 * PATCH /api/runtime/sessions/[sessionId]
 * 세션의 approvalPolicy를 변경합니다. operator 권한이 필요합니다.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  const { sessionId } = await params;

  try {
    const body = await request.json();
    const { approvalPolicy } = body as { approvalPolicy?: string };

    const validPolicies: ApprovalPolicy[] = ['on-request', 'on-failure', 'never', 'yolo'];
    if (!approvalPolicy || !validPolicies.includes(approvalPolicy as ApprovalPolicy)) {
      return NextResponse.json(
        { error: 'approvalPolicy must be one of: on-request, on-failure, never, yolo' },
        { status: 400 },
      );
    }

    const session = await updateSessionApprovalPolicy(sessionId, approvalPolicy as ApprovalPolicy);
    return NextResponse.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update session';
    if (message === 'SESSION_NOT_FOUND') {
      return NextResponse.json({ error: '세션을 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
