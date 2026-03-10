import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOperatorApiUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db/prisma';
import { encryptScopedSetting } from '@/lib/crypto/settings';

const OPENAI_KEY_SALT = 'aris-openai-settings-v1';

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
    select: { openAiApiKeyEncrypted: true },
  });

  return NextResponse.json({
    hasKey: Boolean(preference?.openAiApiKeyEncrypted),
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
      openAiApiKeyEncrypted: encryptScopedSetting(parsed.data.apiKey, OPENAI_KEY_SALT),
    },
    create: {
      userId: auth.user.id,
      openAiApiKeyEncrypted: encryptScopedSetting(parsed.data.apiKey, OPENAI_KEY_SALT),
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
    update: { openAiApiKeyEncrypted: null },
    create: { userId: auth.user.id, openAiApiKeyEncrypted: null },
  });

  return NextResponse.json({ ok: true, hasKey: false });
}
