import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';

const execAsync = promisify(exec);

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

async function readStorageSnapshot(): Promise<{ usedBytes: number; totalBytes: number } | null> {
  try {
    // df -P /: root 파티션 정보 (POSIX 형식)
    const { stdout } = await execAsync('df -P /');
    const lines = stdout.split('\n');
    if (lines.length < 2) return null;
    
    // 두 번째 줄 파싱 (Filesystem 1024-blocks Used Available Capacity Mounted on)
    const parts = lines[1].split(/\s+/);
    if (parts.length < 5) return null;

    const totalK = parseInt(parts[1], 10);
    const usedK = parseInt(parts[2], 10);

    if (isNaN(totalK) || isNaN(usedK)) return null;

    return {
      usedBytes: usedK * 1024,
      totalBytes: totalK * 1024,
    };
  } catch (err) {
    console.error('Storage info read failed:', err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const totalMemoryBytes = Math.max(0, os.totalmem());
  const freeMemoryBytes = Math.max(0, os.freemem());
  const ramUsedBytes = Math.max(0, totalMemoryBytes - freeMemoryBytes);
  const storage = await readStorageSnapshot();
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
        storage: {
          percent: storage ? ratioPercent(storage.usedBytes, storage.totalBytes) : 0,
          usedBytes: storage?.usedBytes ?? 0,
          totalBytes: storage?.totalBytes ?? 0,
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
