import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
  randomUUID: vi.fn(),
  tmpdir: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: mocks.mkdir,
    writeFile: mocks.writeFile,
    readFile: mocks.readFile,
    stat: mocks.stat,
  },
}));

vi.mock('node:crypto', () => ({
  randomUUID: mocks.randomUUID,
}));

vi.mock('node:os', () => ({
  tmpdir: mocks.tmpdir,
}));

vi.mock('@/lib/auth/guard', () => ({
  requireApiUser: mocks.requireApiUser,
}));

function buildUploadRequest(file?: File): NextRequest {
  const formData = new FormData();
  if (file) {
    formData.set('file', file);
  }

  return new NextRequest('http://localhost/api/runtime/sessions/session-1/assets/images', {
    method: 'POST',
    body: formData,
  });
}

describe('chat image upload route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tmpdir.mockReturnValue('/tmp');
    mocks.randomUUID.mockReturnValue('asset-123');
    mocks.requireApiUser.mockResolvedValue({ user: { id: 'user-1', role: 'operator' } });
    mocks.mkdir.mockResolvedValue(undefined);
    mocks.writeFile.mockResolvedValue(undefined);
    mocks.readFile.mockResolvedValue(Buffer.from([]));
    mocks.stat.mockResolvedValue({ isFile: () => true });
  });

  it('stores an uploaded image under the runtime asset directory and returns attachment metadata', async () => {
    const { POST } = await import('@/app/api/runtime/sessions/[sessionId]/assets/images/route');
    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO8B9mEAAAAASUVORK5CYII=',
      'base64',
    );

    const response = await POST(
      buildUploadRequest(new File([pngBytes], 'avatar.png', { type: 'image/png' })),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.mkdir).toHaveBeenCalledWith('/tmp/aris-runtime-assets/session-1/images', { recursive: true });
    expect(mocks.writeFile).toHaveBeenCalledWith(
      '/tmp/aris-runtime-assets/session-1/images/asset-123.png',
      pngBytes,
    );

    const payload = await response.json() as {
      assetId: string;
      kind: 'image';
      name: string;
      mimeType: string;
      size: number;
      serverPath: string;
      previewUrl: string;
      width?: number;
      height?: number;
    };

    expect(payload).toEqual(expect.objectContaining({
      assetId: 'asset-123',
      kind: 'image',
      name: 'avatar.png',
      mimeType: 'image/png',
      size: pngBytes.length,
      serverPath: '/tmp/aris-runtime-assets/session-1/images/asset-123.png',
      previewUrl: '/api/fs/raw?path=%2Ftmp%2Faris-runtime-assets%2Fsession-1%2Fimages%2Fasset-123.png',
      width: 1,
      height: 1,
    }));
  });

  it('rejects uploads without a file', async () => {
    const { POST } = await import('@/app/api/runtime/sessions/[sessionId]/assets/images/route');

    const response = await POST(buildUploadRequest(), {
      params: Promise.resolve({ sessionId: 'session-1' }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'File required' });
  });

  it('rejects non-image uploads', async () => {
    const { POST } = await import('@/app/api/runtime/sessions/[sessionId]/assets/images/route');

    const response = await POST(
      buildUploadRequest(new File(['plain text'], 'notes.txt', { type: 'text/plain' })),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Only image files are supported' });
  });

  it('requires operator auth', async () => {
    mocks.requireApiUser.mockResolvedValue({ user: { id: 'user-1', role: 'viewer' } });
    const { POST } = await import('@/app/api/runtime/sessions/[sessionId]/assets/images/route');

    const response = await POST(
      buildUploadRequest(new File(['plain text'], 'notes.txt', { type: 'text/plain' })),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Operator role required' });
  });
});
