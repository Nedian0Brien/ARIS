import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUserFromCookies } from '@/lib/auth/session';

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

    const customAiModels = pref?.customAiModels 
      ? (typeof pref.customAiModels === 'string' ? JSON.parse(pref.customAiModels) : pref.customAiModels)
      : { codex: '', claude: '', gemini: '' };

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
      codex: typeof codex === 'string' ? codex : '',
      claude: typeof claude === 'string' ? claude : '',
      gemini: typeof gemini === 'string' ? gemini : '',
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
