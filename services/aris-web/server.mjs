import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { parse } from 'node:url';
import { createDecipheriv, scryptSync, randomUUID } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import next from 'next';
import { WebSocketServer } from 'ws';
import { jwtVerify } from 'jose';

const require = createRequire(import.meta.url);
const pty = require('node-pty');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const JWT_SECRET = process.env.AUTH_JWT_SECRET || 'dev-only-jwt-secret-dev-only-jwt-secret';
const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'aris_session';
const HAPPY_SERVER_URL = process.env.HAPPY_SERVER_URL || 'http://localhost:4080';
const HAPPY_SERVER_TOKEN = process.env.HAPPY_SERVER_TOKEN || '';
const SSH_KEY_ENCRYPTION_SECRET = process.env.SSH_KEY_ENCRYPTION_SECRET || 'dev-only-ssh-enc-secret-change-me';
const SSH_HOST = process.env.SSH_HOST || 'host.docker.internal';

// ── 쿠키 파싱 ──────────────────────────────────────────────────────────────
function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(';').map((part) => {
      const idx = part.indexOf('=');
      if (idx < 0) return [part.trim(), ''];
      return [part.slice(0, idx).trim(), decodeURIComponent(part.slice(idx + 1))];
    }),
  );
}

// ── JWT 검증 ───────────────────────────────────────────────────────────────
async function verifyToken(token) {
  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    return payload;
  } catch {
    return null;
  }
}

// ── AES-256-GCM 복호화 ─────────────────────────────────────────────────────
function decryptSetting(ciphertext) {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Invalid ciphertext');
  const [ivHex, authTagHex, encHex] = parts;
  const key = scryptSync(SSH_KEY_ENCRYPTION_SECRET, 'aris-ssh-settings-v1', 32);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]).toString('utf-8');
}

// ── DB에서 SSH 설정 조회 ────────────────────────────────────────────────────
async function getSshSettings() {
  const [userRow, keyRow] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: 'ssh_user' } }),
    prisma.systemSetting.findUnique({ where: { key: 'ssh_private_key' } }),
  ]);
  if (!keyRow) return null;
  try {
    return {
      sshUser: userRow?.value ?? 'ubuntu',
      sshPrivateKey: decryptSetting(keyRow.value),
    };
  } catch {
    return null;
  }
}

// ── Happy 서버에서 세션 CWD 조회 ───────────────────────────────────────────
async function getSessionCwd(sessionId) {
  if (!HAPPY_SERVER_TOKEN) return null;
  try {
    const res = await fetch(
      `${HAPPY_SERVER_URL}/v1/sessions/${encodeURIComponent(sessionId)}`,
      { headers: { Authorization: `Bearer ${HAPPY_SERVER_TOKEN}` } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (
      data?.session?.path ??
      data?.path ??
      data?.metadata?.path ??
      data?.workingDirectory ??
      null
    );
  } catch {
    return null;
  }
}

// ── SSH PTY 스폰 ────────────────────────────────────────────────────────────
function spawnSshPty(settings, sessionId, sessionCwd) {
  // Private key를 임시 파일에 기록 (SSH는 파일 경로로만 키를 받음)
  const tmpKey = join(tmpdir(), `aris_key_${randomUUID()}`);
  writeFileSync(tmpKey, settings.sshPrivateKey.trim() + '\n', { mode: 0o600 });

  const sshArgs = [
    '-i', tmpKey,
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'UserKnownHostsFile=/dev/null',
    '-o', 'LogLevel=ERROR',
    '-o', 'ServerAliveInterval=30',
  ];

  // 세션 지정 시 tmux attach 우선, 실패 시 세션 경로로 cd
  if (sessionId) {
    const cdCmd = sessionCwd ? `cd '${sessionCwd.replace(/'/g, "'\\''")}' && ` : '';
    sshArgs.push('-t');
    sshArgs.push(`${settings.sshUser}@${SSH_HOST}`);
    sshArgs.push(
      `tmux attach-session -t '${sessionId}' 2>/dev/null || { ${cdCmd}exec $SHELL; }`,
    );
  } else {
    sshArgs.push(`${settings.sshUser}@${SSH_HOST}`);
  }

  const ptyProcess = pty.spawn('ssh', sshArgs, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    env: { ...process.env, TERM: 'xterm-256color' },
  });

  // SSH가 키를 읽은 뒤 임시 파일 제거
  setTimeout(() => { try { unlinkSync(tmpKey); } catch {} }, 3000);

  return ptyProcess;
}

// ── WebSocket 서버 ──────────────────────────────────────────────────────────
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', async (ws, _req, { sessionId, sessionCwd }) => {
  const settings = await getSshSettings();

  if (!settings) {
    const msg = '\r\n\x1b[33mSSH 설정이 구성되지 않았습니다.\x1b[0m\r\n'
      + '설정 탭(Settings)에서 SSH 유저와 Private Key를 입력한 뒤 다시 접속하세요.\r\n\r\n';
    ws.send(Buffer.from(msg, 'utf-8'));
    ws.close();
    return;
  }

  let ptyProcess;
  try {
    ptyProcess = spawnSshPty(settings, sessionId, sessionCwd);
  } catch (err) {
    ws.send(Buffer.from(`\r\n\x1b[31m오류: ${err.message}\x1b[0m\r\n`, 'utf-8'));
    ws.close();
    return;
  }

  ptyProcess.onData((data) => {
    if (ws.readyState === ws.OPEN) ws.send(Buffer.from(data, 'utf-8'));
  });

  ptyProcess.onExit(() => {
    if (ws.readyState === ws.OPEN) ws.close();
  });

  ws.on('message', (data) => {
    try {
      const text = Buffer.isBuffer(data) ? data.toString('utf-8') : String(data);
      if (text.startsWith('{')) {
        const msg = JSON.parse(text);
        if (msg.type === 'resize' && msg.cols && msg.rows) {
          ptyProcess.resize(Math.max(2, msg.cols), Math.max(1, msg.rows));
          return;
        }
      }
      ptyProcess.write(text);
    } catch {
      try { ptyProcess.write(data.toString()); } catch {}
    }
  });

  ws.on('close', () => {
    try { ptyProcess.kill(); } catch {}
  });
});

// ── Next.js + HTTP 서버 ─────────────────────────────────────────────────────
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    await handle(req, res, parse(req.url, true));
  });

  server.on('upgrade', async (req, socket, head) => {
    const { pathname } = parse(req.url);

    if (!pathname.startsWith('/ws/terminal')) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[AUTH_COOKIE_NAME];
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const payload = await verifyToken(token);
    if (!payload) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    if (payload.role !== 'operator') {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    const sessionMatch = pathname.match(/^\/ws\/terminal\/(.+)$/);
    const sessionId = sessionMatch ? decodeURIComponent(sessionMatch[1]) : null;
    const sessionCwd = sessionId ? await getSessionCwd(sessionId) : null;

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, { sessionId, sessionCwd });
    });
  });

  server.listen(port, hostname, () => {
    console.log(`> ARIS Web ready on http://${hostname}:${port}`);
  });
});
