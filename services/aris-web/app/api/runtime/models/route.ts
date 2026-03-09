import { NextRequest, NextResponse } from 'next/server';
import type { AgentFlavor } from '@/lib/happy/types';
import { fetchModelsForAgent } from '@/lib/models/catalog';

function normalizeAgent(value: string | null): AgentFlavor {
  if (value === 'claude' || value === 'codex' || value === 'gemini') {
    return value;
  }
  return 'codex';
}

export async function GET(request: NextRequest) {
  const agent = normalizeAgent(request.nextUrl.searchParams.get('agent'));
  try {
    const models = await fetchModelsForAgent(agent);
    return NextResponse.json({ agent, models });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load models';
    return NextResponse.json({ agent, models: [], error: message }, { status: 500 });
  }
}
