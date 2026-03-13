import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOperatorApiUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db/prisma';
import { encryptScopedSetting } from '@/lib/crypto/settings';

const CLAUDE_KEY_SALT = 'aris-claude-settings-v1';

const saveSchema = z.object({
  apiKey: z.string().trim().min(20).max(300),
});

export async function GET(request: NextRequest) {
  const auth = await requireOperatorApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const preference = await prisma.uiPreference.findUnique({
    where: { userId: auth.user.id },
    select: { claudeApiKeyEncrypted: true },
  });

  return NextResponse.json({
    hasKey: Boolean(preference?.claudeApiKeyEncrypted),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireOperatorApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 });
  }

  await prisma.uiPreference.upsert({
    where: { userId: auth.user.id },
    update: {
      claudeApiKeyEncrypted: encryptScopedSetting(parsed.data.apiKey, CLAUDE_KEY_SALT),
    },
    create: {
      userId: auth.user.id,
      claudeApiKeyEncrypted: encryptScopedSetting(parsed.data.apiKey, CLAUDE_KEY_SALT),
    },
  });

  return NextResponse.json({ ok: true, hasKey: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireOperatorApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  await prisma.uiPreference.upsert({
    where: { userId: auth.user.id },
    update: { claudeApiKeyEncrypted: null },
    create: { userId: auth.user.id, claudeApiKeyEncrypted: null },
  });

  return NextResponse.json({ ok: true, hasKey: false });
}
