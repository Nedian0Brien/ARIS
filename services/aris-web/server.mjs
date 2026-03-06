import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { parse } from 'node:url';
import { execSync } from 'node:child_process';
import next from 'next';
import { WebSocketServer } from 'ws';
import { jwtVerify } from 'jose';

// node-pty는 native 모듈이므로 createRequire로 로드
const require = createRequire(import.meta.url);
const pty = require('node-pty');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const JWT_SECRET = process.env.AUTH_JWT_SECRET || 'dev-only-jwt-secret-dev-only-jwt-secret';
const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'aris_session';
const HAPPY_SERVER_URL = process.env.HAPPY_SERVER_URL || 'http://localhost:4080';
const HAPPY_SERVER_TOKEN = process.env.HAPPY_SERVER_TOKEN || '';

// 쿠키 헤더 파싱
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

// JWT 검증 (서명만 확인)
async function verifyToken(token) {
  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    return payload;
  } catch {
    return null;
  }
}

// Happy 서버에서 세션 경로 조회
async function getSessionCwd(sessionId) {
  if (!HAPPY_SERVER_TOKEN) return null;
  try {
    const res = await fetch(
      `${HAPPY_SERVER_URL}/v1/sessions/${encodeURIComponent(sessionId)}`,
      { headers: { Authorization: `Bearer ${HAPPY_SERVER_TOKEN}` } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    // 다양한 응답 구조 시도
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

// tmux 세션 존재 여부 확인
function hasTmuxSession(sessionId) {
  try {
    execSync(`tmux has-session -t ${sessionId}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// PTY 스폰 (tmux 우선 시도, 실패 시 bash fallback)
function resolveShell() {
  const candidates = [
    process.env.DEFAULT_SHELL,
    process.env.SHELL,
    '/bin/bash',
    '/bin/sh',
  ];
  for (const s of candidates) {
    if (!s) continue;
    try {
      execSync(`test -x ${s}`, { stdio: 'ignore' });
      return s;
    } catch {}
  }
  return '/bin/sh';
}

function spawnPty(sessionId, cwd) {
  const shell = resolveShell();
  const env = { ...process.env, TERM: 'xterm-256color' };

  if (sessionId && hasTmuxSession(sessionId)) {
    try {
      return pty.spawn('tmux', ['attach-session', '-t', sessionId], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: cwd || process.env.HOME || '/',
        env,
      });
    } catch {
      // tmux attach 실패 시 bash fallback
    }
  }

  return pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: cwd || process.env.HOME || '/',
    env,
  });
}

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, _req, { sessionId, cwd }) => {
  const ptyProcess = spawnPty(sessionId, cwd);

  ptyProcess.onData((data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(Buffer.from(data, 'utf-8'));
    }
  });

  ptyProcess.onExit(() => {
    if (ws.readyState === ws.OPEN) ws.close();
  });

  ws.on('message', (data) => {
    try {
      const text = Buffer.isBuffer(data) ? data.toString('utf-8') : data;
      // 리사이즈 메시지 처리
      if (typeof text === 'string' && text.startsWith('{')) {
        const msg = JSON.parse(text);
        if (msg.type === 'resize' && msg.cols && msg.rows) {
          ptyProcess.resize(Math.max(2, msg.cols), Math.max(1, msg.rows));
          return;
        }
      }
      ptyProcess.write(typeof text === 'string' ? text : text.toString());
    } catch {
      // 파싱 실패 시 raw 데이터 전송
      try {
        ptyProcess.write(data.toString());
      } catch {}
    }
  });

  ws.on('close', () => {
    try {
      ptyProcess.kill();
    } catch {}
  });
});

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    const parsedUrl = parse(req.url, true);
    await handle(req, res, parsedUrl);
  });

  server.on('upgrade', async (req, socket, head) => {
    const { pathname } = parse(req.url);

    if (!pathname.startsWith('/ws/terminal')) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    // 인증
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

    // operator만 터미널 접근 허용
    if (payload.role !== 'operator') {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    // 세션 ID 및 CWD 결정
    const sessionMatch = pathname.match(/^\/ws\/terminal\/(.+)$/);
    const sessionId = sessionMatch ? decodeURIComponent(sessionMatch[1]) : null;
    let cwd = process.env.HOME || '/';
    if (sessionId) {
      const sessionPath = await getSessionCwd(sessionId);
      if (sessionPath) cwd = sessionPath;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, { sessionId, cwd });
    });
  });

  server.listen(port, hostname, () => {
    console.log(`> ARIS Web ready on http://${hostname}:${port}`);
  });
});
