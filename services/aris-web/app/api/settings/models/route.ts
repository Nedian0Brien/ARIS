import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUserFromCookies } from '@/lib/auth/session';
import { sanitizeCustomModel } from '@/lib/happy/modelPolicy';

export async function GET() {
  try {
    const session = await getCurrentUserFromCookies();
    if (!session?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pref = await prisma.uiPreference.findUnique({
      where: { userId: session.id },
      select: { customAiModels: true },
    });

    const rawModels = pref?.customAiModels
      ? (typeof pref.customAiModels === 'string' ? JSON.parse(pref.customAiModels) : pref.customAiModels)
      : {};
    const customAiModels = {
      codex: sanitizeCustomModel((rawModels as Record<string, unknown>)?.codex) ?? '',
      claude: sanitizeCustomModel((rawModels as Record<string, unknown>)?.claude) ?? '',
      gemini: sanitizeCustomModel((rawModels as Record<string, unknown>)?.gemini) ?? '',
    };

    return NextResponse.json(customAiModels);
  } catch (error) {
    console.error('Failed to get custom models:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getCurrentUserFromCookies();
    if (!session?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { codex, claude, gemini } = body;

    const customModels = {
      codex: sanitizeCustomModel(codex) ?? '',
      claude: sanitizeCustomModel(claude) ?? '',
      gemini: sanitizeCustomModel(gemini) ?? '',
    };

    await prisma.uiPreference.upsert({
      where: { userId: session.id },
      update: { customAiModels: customModels },
      create: {
        userId: session.id,
        customAiModels: customModels,
      },
    });

    return NextResponse.json({ success: true, customModels });
  } catch (error) {
    console.error('Failed to save custom models:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
