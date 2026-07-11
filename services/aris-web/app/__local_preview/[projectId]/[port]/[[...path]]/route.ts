import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import {
  resolveWorkspacePanelExecutionTarget,
  WorkspacePanelExecutionTargetError,
} from '@/lib/workspacePanels/executionTarget';
import {
  buildLocalPreviewProxyBasePath,
  parseLocalPreviewPort,
  rewriteLocalPreviewHtml,
} from '@/lib/preview/localPreviewProxy';

export const dynamic = 'force-dynamic';

const PREVIEW_PROXY_TIMEOUT_MS = 10_000;
const PREVIEW_PROXY_MAX_HTML_BYTES = 10 * 1024 * 1024;

// 업스트림 응답에서 브라우저로 그대로 넘기면 안 되는 홉 단위/인코딩 헤더.
// fetch가 본문을 이미 디코드하므로 content-encoding/length는 무효가 된다.
const STRIPPED_RESPONSE_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'set-cookie',
]);

/**
 * 로컬 dev 서버 프리뷰 프록시. `127.0.0.1:{port}`로만 나가고(SSRF 차단),
 * operator + 프로젝트 소유권 검사를 거친다 — operator는 이미 터미널로 임의
 * 명령을 실행할 수 있으므로 로컬 포트 조회는 새로운 권한이 아니다.
 * HTML은 루트 상대 경로를 프록시 기준으로 재작성해 iframe 안에서
 * 에셋·내비게이션이 동작하게 한다.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; port: string; path?: string[] }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }
  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  const { projectId, port: portRaw, path: pathSegments } = await params;
  const port = parseLocalPreviewPort(portRaw);
  if (port === null) {
    return NextResponse.json({ error: '유효한 포트가 아닙니다.' }, { status: 400 });
  }

  try {
    await resolveWorkspacePanelExecutionTarget({
      userId: auth.user.id,
      projectId,
      workspacePanelId: null,
    });
  } catch (error) {
    if (error instanceof WorkspacePanelExecutionTargetError) {
      return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
    }
    throw error;
  }

  const targetPath = `/${(pathSegments ?? []).join('/')}`;
  const search = request.nextUrl.search ?? '';
  const targetUrl = `http://127.0.0.1:${port}${targetPath}${search}`;
  const proxyBasePath = buildLocalPreviewProxyBasePath({ projectId, port });

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(PREVIEW_PROXY_TIMEOUT_MS),
      headers: { accept: request.headers.get('accept') ?? '*/*' },
    });
  } catch (error) {
    const message = error instanceof Error && error.name === 'TimeoutError'
      ? `127.0.0.1:${port} 응답이 없습니다 (timeout).`
      : `127.0.0.1:${port}에 연결할 수 없습니다. dev 서버가 실행 중인지 확인하세요.`;
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  headers.set('cache-control', 'no-store');

  // 리다이렉트는 로컬 루트 상대 경로만 프록시 기준으로 재작성해 따라가게 한다.
  if (upstream.status >= 300 && upstream.status < 400) {
    const location = upstream.headers.get('location') ?? '';
    if (location.startsWith('/')) {
      headers.set('location', `${proxyBasePath}${location}`);
    }
    return new NextResponse(null, { status: upstream.status, headers });
  }

  const contentType = upstream.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) {
    const html = await upstream.text();
    if (html.length > PREVIEW_PROXY_MAX_HTML_BYTES) {
      return NextResponse.json({ error: '응답이 너무 큽니다.' }, { status: 502 });
    }
    return new NextResponse(rewriteLocalPreviewHtml(html, proxyBasePath), {
      status: upstream.status,
      headers,
    });
  }

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
