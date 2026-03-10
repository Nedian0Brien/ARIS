import { NextResponse } from 'next/server';
import { getCurrentUserFromCookies } from '@/lib/auth/session';
import { saveUserModelSettings, getUserModelSettings } from '@/lib/settings/providerPreferences';
import { normalizePartialProviderModelSelections } from '@/lib/settings/providerModels';

export async function GET() {
  try {
    const session = await getCurrentUserFromCookies();
    if (!session?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(await getUserModelSettings(session.id));
  } catch (error) {
    console.error('Failed to get model settings:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getCurrentUserFromCookies();
    if (!session?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const rawProviders = body?.providers;
    const rawLegacyCustomModels = body?.legacyCustomModels;
    const providers = normalizePartialProviderModelSelections(rawProviders);

    await saveUserModelSettings({
      userId: session.id,
      providers,
      legacyCustomModels: rawLegacyCustomModels,
    });

    return NextResponse.json(await getUserModelSettings(session.id));
  } catch (error) {
    console.error('Failed to save model settings:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
