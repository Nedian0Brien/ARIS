import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { getHostHomeDir } from '@/lib/fs/pathResolver';
import { getWorkspaceById } from '@/lib/happy/workspaces';
import { collectProjectSkills } from '@/lib/projectSkills';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const { projectId } = await params;
  const workspace = await getWorkspaceById(auth.user.id, projectId);
  if (!workspace) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }

  try {
    const skills = await collectProjectSkills({
      projectPath: workspace.path?.trim() ? workspace.path : null,
      userHomeDir: getHostHomeDir(),
    });
    return NextResponse.json({ skills });
  } catch (error) {
    const message = error instanceof Error ? error.message : '스킬 목록을 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
