import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn(),
  rmdir: vi.fn(),
  readFile: vi.fn(),
  requireApiUser: vi.fn(),
  getWorkspaceById: vi.fn(),
  randomUUID: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: mocks.mkdir,
    writeFile: mocks.writeFile,
    unlink: mocks.unlink,
    rmdir: mocks.rmdir,
    readFile: mocks.readFile,
  },
}));

vi.mock('node:crypto', () => ({
  randomUUID: mocks.randomUUID,
}));

vi.mock('@/lib/auth/guard', () => ({
  requireApiUser: mocks.requireApiUser,
}));

vi.mock('@/lib/happy/workspaces', () => ({
  getWorkspaceById: mocks.getWorkspaceById,
}));

vi.mock('@/lib/config', () => ({
  env: {
    NODE_ENV: 'production',
    HOST_HOME_DIR: '/home/ubuntu',
    HOST_PROJECTS_ROOT: '/home/ubuntu/project',
  },
}));

describe('chat image upload route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ user: { role: 'operator', id: 'user-1' } });
    mocks.getWorkspaceById.mockResolvedValue({ id: 'session-1', path: '/home/ubuntu/project/ARIS' });
    mocks.randomUUID.mockReturnValue('asset-123');
    mocks.mkdir.mockResolvedValue(undefined);
    mocks.writeFile.mockResolvedValue(undefined);
    mocks.unlink.mockResolvedValue(undefined);
    mocks.rmdir.mockResolvedValue(undefined);
    mocks.readFile.mockResolvedValue(Buffer.from([137, 80, 78, 71]));
  });

  it('stores an uploaded image and returns attachment metadata', async () => {
    const form = new FormData();
    form.set('file', new File([Uint8Array.from([137, 80, 78, 71])], 'screen.png', { type: 'image/png' }));

    const { POST } = await import('@/app/api/runtime/sessions/[sessionId]/assets/images/route');
    const response = await POST(
      new NextRequest('http://localhost/api/runtime/sessions/session-1/assets/images', {
        method: 'POST',
        body: form,
      }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.mkdir).toHaveBeenCalledWith('/home/ubuntu/.aris/chat-assets/session-1', { recursive: true });
    expect(mocks.writeFile).toHaveBeenCalledTimes(1);
    expect(await response.json()).toMatchObject({
      attachment: {
        assetId: 'asset-123',
        kind: 'image',
        name: 'screen.png',
        mimeType: 'image/png',
        size: 4,
        serverPath: '/home/ubuntu/.aris/chat-assets/session-1/asset-123-screen.png',
        previewUrl: '/api/runtime/sessions/session-1/assets/images?path=%2Fhome%2Fubuntu%2F.aris%2Fchat-assets%2Fsession-1%2Fasset-123-screen.png',
      },
    });
  });

  it('rejects requests for sessions the current user does not own', async () => {
    mocks.getWorkspaceById.mockResolvedValue(null);
    const form = new FormData();
    form.set('file', new File([Uint8Array.from([137, 80, 78, 71])], 'screen.png', { type: 'image/png' }));

    const { POST } = await import('@/app/api/runtime/sessions/[sessionId]/assets/images/route');
    const response = await POST(
      new NextRequest('http://localhost/api/runtime/sessions/session-1/assets/images', {
        method: 'POST',
        body: form,
      }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(404);
  });

  it('rejects requests without a file', async () => {
    const { POST } = await import('@/app/api/runtime/sessions/[sessionId]/assets/images/route');
    const response = await POST(
      new NextRequest('http://localhost/api/runtime/sessions/session-1/assets/images', {
        method: 'POST',
        body: new FormData(),
      }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: '이미지 파일이 필요합니다.' });
  });

  it('rejects non-image uploads', async () => {
    const form = new FormData();
    form.set('file', new File(['hello'], 'notes.txt', { type: 'text/plain' }));

    const { POST } = await import('@/app/api/runtime/sessions/[sessionId]/assets/images/route');
    const response = await POST(
      new NextRequest('http://localhost/api/runtime/sessions/session-1/assets/images', {
        method: 'POST',
        body: form,
      }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: '이미지 파일만 업로드할 수 있습니다.' });
  });

  it('rejects non-operator uploads', async () => {
    mocks.requireApiUser.mockResolvedValue({ user: { role: 'viewer', id: 'user-1' } });
    const form = new FormData();
    form.set('file', new File([Uint8Array.from([137, 80, 78, 71])], 'screen.png', { type: 'image/png' }));

    const { POST } = await import('@/app/api/runtime/sessions/[sessionId]/assets/images/route');
    const response = await POST(
      new NextRequest('http://localhost/api/runtime/sessions/session-1/assets/images', {
        method: 'POST',
        body: form,
      }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(403);
  });

  it('rejects unsafe session ids that escape the asset root', async () => {
    const form = new FormData();
    form.set('file', new File([Uint8Array.from([137, 80, 78, 71])], 'screen.png', { type: 'image/png' }));

    const { POST } = await import('@/app/api/runtime/sessions/[sessionId]/assets/images/route');
    const response = await POST(
      new NextRequest('http://localhost/api/runtime/sessions/../../.ssh/assets/images', {
        method: 'POST',
        body: form,
      }),
      { params: Promise.resolve({ sessionId: '../../.ssh' }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: '유효하지 않은 세션 식별자입니다.' });
  });

  it('rejects bare dot-segment session ids', async () => {
    const form = new FormData();
    form.set('file', new File([Uint8Array.from([137, 80, 78, 71])], 'screen.png', { type: 'image/png' }));

    const { POST } = await import('@/app/api/runtime/sessions/[sessionId]/assets/images/route');
    const response = await POST(
      new NextRequest('http://localhost/api/runtime/sessions/../assets/images', {
        method: 'POST',
        body: form,
      }),
      { params: Promise.resolve({ sessionId: '..' }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: '유효하지 않은 세션 식별자입니다.' });
  });

  it('rejects oversized image uploads before buffering them to disk', async () => {
    const largeBytes = new Uint8Array(10 * 1024 * 1024 + 1);
    const form = new FormData();
    form.set('file', new File([largeBytes], 'huge.png', { type: 'image/png' }));

    const { POST } = await import('@/app/api/runtime/sessions/[sessionId]/assets/images/route');
    const response = await POST(
      new NextRequest('http://localhost/api/runtime/sessions/session-1/assets/images', {
        method: 'POST',
        body: form,
      }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ error: '이미지 파일은 10MB 이하만 업로드할 수 있습니다.' });
  });

  it('rejects multipart requests whose declared body size exceeds the request ceiling', async () => {
    const { POST } = await import('@/app/api/runtime/sessions/[sessionId]/assets/images/route');
    const response = await POST(
      new NextRequest('http://localhost/api/runtime/sessions/session-1/assets/images', {
        method: 'POST',
        body: new FormData(),
        headers: {
          'content-length': String(10 * 1024 * 1024 + 256 * 1024 + 1),
        },
      }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: '이미지 파일은 10MB 이하만 업로드할 수 있습니다.' });
  });

  it('does not reject near-limit multipart overhead before the file is parsed', async () => {
    const { POST } = await import('@/app/api/runtime/sessions/[sessionId]/assets/images/route');
    const response = await POST(
      new NextRequest('http://localhost/api/runtime/sessions/session-1/assets/images', {
        method: 'POST',
        body: new FormData(),
        headers: {
          'content-length': String(10 * 1024 * 1024 + 1024),
        },
      }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: '이미지 파일이 필요합니다.' });
  });

  it('deletes a stored image asset when the composer removes it', async () => {
    const { DELETE } = await import('@/app/api/runtime/sessions/[sessionId]/assets/images/route');
    const response = await DELETE(
      new NextRequest('http://localhost/api/runtime/sessions/session-1/assets/images', {
        method: 'DELETE',
        body: JSON.stringify({
          serverPath: '/home/ubuntu/.aris/chat-assets/session-1/asset-123-screen.png',
        }),
        headers: {
          'content-type': 'application/json',
        },
      }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.unlink).toHaveBeenCalledWith('/home/ubuntu/.aris/chat-assets/session-1/asset-123-screen.png');
  });

  it('serves a stored image preview to authenticated viewers', async () => {
    mocks.requireApiUser.mockResolvedValue({ user: { role: 'viewer', id: 'user-2' } });
    const { GET } = await import('@/app/api/runtime/sessions/[sessionId]/assets/images/route');
    const response = await GET(
      new NextRequest('http://localhost/api/runtime/sessions/session-1/assets/images?path=%2Fhome%2Fubuntu%2F.aris%2Fchat-assets%2Fsession-1%2Fasset-123-screen.png'),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(mocks.readFile).toHaveBeenCalledWith('/home/ubuntu/.aris/chat-assets/session-1/asset-123-screen.png');
  });

  it('rejects deleting another session path through the current session endpoint', async () => {
    const { DELETE } = await import('@/app/api/runtime/sessions/[sessionId]/assets/images/route');
    const response = await DELETE(
      new NextRequest('http://localhost/api/runtime/sessions/session-1/assets/images', {
        method: 'DELETE',
        body: JSON.stringify({
          serverPath: '/home/ubuntu/.aris/chat-assets/session-2/asset-999-screen.png',
        }),
        headers: {
          'content-type': 'application/json',
        },
      }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.unlink).not.toHaveBeenCalledWith('/home/ubuntu/.aris/chat-assets/session-2/asset-999-screen.png');
  });
});
