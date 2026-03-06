import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOperatorApiUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db/prisma';
import { encryptSetting, decryptSetting } from '@/lib/crypto/settings';

export async function GET(request: NextRequest) {
  const auth = await requireOperatorApiUser(request);
  if ('response' in auth) return auth.response;

  const [userRow, keyRow] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: 'ssh_user' } }),
    prisma.systemSetting.findUnique({ where: { key: 'ssh_private_key' } }),
  ]);

  return NextResponse.json({
    sshUser: userRow?.value ?? 'ubuntu',
    hasKey: !!keyRow,
  });
}

const saveSchema = z.object({
  sshUser: z.string().min(1).max(64),
  sshPrivateKey: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireOperatorApiUser(request);
  if ('response' in auth) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 });
  }

  const { sshUser, sshPrivateKey } = parsed.data;

  await prisma.systemSetting.upsert({
    where: { key: 'ssh_user' },
    update: { value: sshUser },
    create: { key: 'ssh_user', value: sshUser },
  });

  if (sshPrivateKey && sshPrivateKey.trim()) {
    const encrypted = encryptSetting(sshPrivateKey.trim());
    await prisma.systemSetting.upsert({
      where: { key: 'ssh_private_key' },
      update: { value: encrypted },
      create: { key: 'ssh_private_key', value: encrypted },
    });
  }

  return NextResponse.json({ ok: true });
}

