import os from 'node:os';
import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CpuSnapshot = {
  idle: number;
  total: number;
};

let lastCpuSnapshot: CpuSnapshot | null = null;

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function readCpuSnapshot(): CpuSnapshot {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    const { user, nice, sys, idle: idleTime, irq } = cpu.times;
    idle += idleTime;
    total += user + nice + sys + idleTime + irq;
  }

  return { idle, total };
}

function readCpuPercent(): number {
  const current = readCpuSnapshot();
  let percent = 0;

  if (lastCpuSnapshot) {
    const totalDiff = current.total - lastCpuSnapshot.total;
    const idleDiff = current.idle - lastCpuSnapshot.idle;
    if (totalDiff > 0) {
      percent = (1 - idleDiff / totalDiff) * 100;
    }
  } else {
    const cpuCount = Math.max(1, os.cpus().length);
    const oneMinuteLoadAvg = os.loadavg()[0] ?? 0;
    percent = (oneMinuteLoadAvg / cpuCount) * 100;
  }

  lastCpuSnapshot = current;
  return clampPercent(percent);
}

function ratioPercent(used: number, total: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return 0;
  return clampPercent((used / total) * 100);
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const totalMemoryBytes = Math.max(0, os.totalmem());
  const freeMemoryBytes = Math.max(0, os.freemem());
  const ramUsedBytes = Math.max(0, totalMemoryBytes - freeMemoryBytes);
  const processMemUsedBytes = Math.max(0, process.memoryUsage().rss);
  const cpuPercent = readCpuPercent();

  return NextResponse.json(
    {
      metrics: {
        cpu: {
          percent: cpuPercent,
          usedBytes: 0,
          totalBytes: 0,
        },
        ram: {
          percent: ratioPercent(ramUsedBytes, totalMemoryBytes),
          usedBytes: ramUsedBytes,
          totalBytes: totalMemoryBytes,
        },
        mem: {
          percent: ratioPercent(processMemUsedBytes, totalMemoryBytes),
          usedBytes: processMemUsedBytes,
          totalBytes: totalMemoryBytes,
        },
      },
      capturedAt: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    },
  );
}
