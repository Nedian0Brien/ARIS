import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { requireApiUser } from '@/lib/auth/guard';
import { appendSessionMessage, HappyHttpError } from '@/lib/happy/client';
import { getWorkspaceById } from '@/lib/happy/workspaces';

const execAsync = promisify(exec);
const MAX_OUTPUT_CHARS = 12000;

function trimOutput(value: string): string {
  if (value.length <= MAX_OUTPUT_CHARS) {
    return value;
  }
  return `${value.slice(0, MAX_OUTPUT_CHARS)}\n\n[output truncated at ${MAX_OUTPUT_CHARS} chars]`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }
  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  const { sessionId } = await params;
  const body = await request.json().catch(() => ({})) as {
    chatId?: string;
    command?: string;
    agent?: string;
    model?: string;
    modelReasoningEffort?: string;
  };
  const command = typeof body.command === 'string' ? body.command.trim() : '';
  const chatId = typeof body.chatId === 'string' ? body.chatId.trim() : '';
  if (!command || !chatId) {
    return NextResponse.json({ error: 'chatId and command are required' }, { status: 400 });
  }

  const workspace = await getWorkspaceById(auth.user.id, sessionId);
  if (!workspace) {
    return NextResponse.json({ error: 'WORKSPACE_NOT_FOUND' }, { status: 404 });
  }

  const startedAt = new Date().toISOString();
  try {
    const userEvent = await appendSessionMessage({
      sessionId,
      type: 'message',
      title: 'Terminal Command',
      text: command,
      meta: {
        role: 'user',
        chatId,
        agent: body.agent,
        model: body.model,
        modelReasoningEffort: body.modelReasoningEffort,
        composerMode: 'terminal',
      },
    });

    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    try {
      const result = await execAsync(command, {
        cwd: workspace.path,
        timeout: 30000,
        maxBuffer: 1024 * 1024,
        shell: '/bin/bash',
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (error) {
      const err = error as Error & { stdout?: string; stderr?: string; code?: number };
      stdout = err.stdout ?? '';
      stderr = err.stderr ?? err.message;
      exitCode = typeof err.code === 'number' ? err.code : 1;
    }

    const output = trimOutput([stdout, stderr].filter(Boolean).join('\n'));
    const preview = output || '(no output)';
    const resultEvent = await appendSessionMessage({
      sessionId,
      type: 'tool',
      title: exitCode === 0 ? 'Terminal completed' : 'Terminal failed',
      text: `$ ${command}\n${preview}`,
      meta: {
        role: 'agent',
        chatId,
        kind: 'command_execution',
        composerMode: 'terminal',
        startedAt,
        completedAt: new Date().toISOString(),
        exitCode,
        command,
      },
    });

    return NextResponse.json({ events: [userEvent, resultEvent] });
  } catch (error) {
    if (error instanceof HappyHttpError && [401, 403, 404].includes(error.status)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : '터미널 명령 실행에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
