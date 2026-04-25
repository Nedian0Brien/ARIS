import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { parse } from 'node:url';
import { createDecipheriv, scryptSync, randomUUID } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import next from 'next';
import { WebSocket, WebSocketServer } from 'ws';
import { jwtVerify } from 'jose';
import { applyDevProxyAssetPrefix } from './lib/routing/devProxyAssetPrefix.mjs';

const require = createRequire(import.meta.url);
const pty = require('node-pty');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);
const devProxyAssetPrefix = applyDevProxyAssetPrefix(process.env, { dev, port });

if (dev && devProxyAssetPrefix.changed) {
  console.log(`[web-dev] using asset prefix ${devProxyAssetPrefix.serverPrefix} for port ${port}`);
}

const JWT_SECRET = process.env.AUTH_JWT_SECRET || 'dev-only-jwt-secret-dev-only-jwt-secret';
const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'aris_session';
const RUNTIME_API_URL = process.env.RUNTIME_API_URL || process.env.HAPPY_SERVER_URL || 'http://localhost:4080';
const RUNTIME_API_TOKEN = process.env.RUNTIME_API_TOKEN || process.env.HAPPY_SERVER_TOKEN || '';
const SSH_KEY_ENCRYPTION_SECRET = process.env.SSH_KEY_ENCRYPTION_SECRET || 'dev-only-ssh-enc-secret-change-me';
const SSH_HOST = process.env.SSH_HOST || 'host.docker.internal';
const LOCAL_PREVIEW_PREFIX = '/__local_preview';

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

function parseLocalPreviewPort(value) {
  if (!value || !/^\d+$/.test(value)) return null;
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return port;
}

function normalizeLocalPreviewPath(pathname) {
  if (!pathname || pathname === '/') {
    return '/';
  }

  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

function parseLocalPreviewRequest(reqUrl) {
  const parsed = parse(reqUrl, true);
  const pathname = parsed.pathname || '';
  const match = pathname.match(/^\/__local_preview\/([^/]+)\/([^/]+)(\/.*)?$/);
  if (!match) {
    return null;
  }

  return {
    sessionId: decodeURIComponent(match[1]),
    panelId: decodeURIComponent(match[2]),
    forwardedPath: match[3] || '/',
    query: parsed.query,
  };
}

function buildPreviewBasePath(sessionId, panelId) {
  return `${LOCAL_PREVIEW_PREFIX}/${encodeURIComponent(sessionId)}/${encodeURIComponent(panelId)}`;
}

function buildPreviewInjectionScript({ sessionId, panelId, port }) {
  const basePath = buildPreviewBasePath(sessionId, panelId);
  return `<script>(function(){var BASE=${JSON.stringify(basePath)};var PORT=${JSON.stringify(String(port))};function rewrite(input){try{var url=new URL(String(input),window.location.origin);if(url.origin!==window.location.origin)return input;if(!url.pathname.startsWith(BASE)){url.pathname=BASE+url.pathname;}if(!url.searchParams.has('port')){url.searchParams.set('port',PORT);}return url.toString();}catch{return input;}}var NativeWS=window.WebSocket;if(typeof NativeWS==='function'){window.WebSocket=function(url,protocols){return protocols===undefined?new NativeWS(rewrite(url)):new NativeWS(rewrite(url),protocols);};window.WebSocket.prototype=NativeWS.prototype;}var NativeES=window.EventSource;if(typeof NativeES==='function'){window.EventSource=function(url,config){return config===undefined?new NativeES(rewrite(url)):new NativeES(rewrite(url),config);};window.EventSource.prototype=NativeES.prototype;}var nativeFetch=window.fetch;if(typeof nativeFetch==='function'){window.fetch=function(input,init){if(typeof input==='string'||input instanceof URL){return nativeFetch.call(this,rewrite(input),init);}if(input&&typeof input.url==='string'){return nativeFetch.call(this,new Request(rewrite(input.url),input),init);}return nativeFetch.call(this,input,init);};}var NativeXhr=window.XMLHttpRequest;if(typeof NativeXhr==='function'){var nativeOpen=NativeXhr.prototype.open;NativeXhr.prototype.open=function(method,url){var args=Array.prototype.slice.call(arguments);if(typeof url==='string'){args[1]=rewrite(url);}return nativeOpen.apply(this,args);};}})();</script>`;
}

function rewriteLocalPreviewHtml(html, { sessionId, panelId, port }) {
  const basePath = buildPreviewBasePath(sessionId, panelId);
  const rewritten = html.replace(
    /\b(href|src|action)=("|')\/(?!\/)/g,
    (_match, attribute, quote) => `${attribute}=${quote}${basePath}/`,
  );
  const injection = buildPreviewInjectionScript({ sessionId, panelId, port });
  if (rewritten.includes('</head>')) {
    return rewritten.replace('</head>', `${injection}</head>`);
  }
  return `${injection}${rewritten}`;
}

function rewritePreviewLocation(location, { sessionId, panelId }) {
  if (!location || !location.startsWith('/')) {
    return location;
  }

  return `${buildPreviewBasePath(sessionId, panelId)}${location}`;
}

function toNodeHeaders(headers) {
  const result = {};
  headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return;
    result[key] = value;
  });
  return result;
}

function filterProxyRequestHeaders(headers) {
  const nextHeaders = { ...headers };
  delete nextHeaders.host;
  delete nextHeaders.cookie;
  delete nextHeaders.connection;
  delete nextHeaders.origin;
  delete nextHeaders.referer;
  delete nextHeaders['content-length'];
  delete nextHeaders.upgrade;
  delete nextHeaders['sec-websocket-key'];
  delete nextHeaders['sec-websocket-version'];
  delete nextHeaders['sec-websocket-extensions'];
  delete nextHeaders['sec-websocket-protocol'];
  return nextHeaders;
}

async function getStoredLocalPreviewPanel(userId, sessionId, panelId) {
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: sessionId,
      userId,
    },
    select: {
      panelLayoutJson: true,
    },
  });

  const layout = workspace?.panelLayoutJson;
  const panels = Array.isArray(layout?.panels) ? layout.panels : [];
  const panel = panels.find((candidate) => candidate?.id === panelId && candidate?.type === 'preview');
  if (!panel) {
    return null;
  }

  const config = panel?.config && typeof panel.config === 'object' ? panel.config : {};
  const port = parseLocalPreviewPort(
    typeof config.port === 'number' || typeof config.port === 'string' ? String(config.port) : null,
  );

  return {
    port: port ?? 3305,
    path: normalizeLocalPreviewPath(typeof config.path === 'string' ? config.path : '/'),
  };
}

async function resolveLocalPreviewTarget(userId, reqUrl) {
  const preview = parseLocalPreviewRequest(reqUrl);
  if (!preview) {
    return null;
  }

  const stored = await getStoredLocalPreviewPanel(userId, preview.sessionId, preview.panelId);
  const port = parseLocalPreviewPort(typeof preview.query.port === 'string' ? preview.query.port : null) ?? stored?.port;
  if (!port) {
    return null;
  }

  const requestedRootPath = normalizeLocalPreviewPath(
    typeof preview.query.path === 'string' ? preview.query.path : stored?.path ?? '/',
  );
  const upstreamPath = preview.forwardedPath === '/' ? requestedRootPath : preview.forwardedPath;
  const search = new URLSearchParams();
  Object.entries(preview.query).forEach(([key, value]) => {
    if (key === 'port' || key === 'path') return;
    if (typeof value === 'string') {
      search.set(key, value);
    }
  });

  return {
    ...preview,
    port,
    upstreamPath,
    upstreamSearch: search.toString(),
  };
}

async function handleLocalPreviewHttp(req, res, userId) {
  const target = await resolveLocalPreviewTarget(userId, req.url);
  if (!target) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('유효한 로컬 프리뷰 요청이 아닙니다.');
    return;
  }

  const upstreamUrl = `http://127.0.0.1:${target.port}${target.upstreamPath}${target.upstreamSearch ? `?${target.upstreamSearch}` : ''}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers: filterProxyRequestHeaders(req.headers),
      ...(req.method && req.method !== 'GET' && req.method !== 'HEAD'
        ? { body: req, duplex: 'half' }
        : {}),
    });

    const headers = toNodeHeaders(upstream.headers);
    if (headers.location) {
      headers.location = rewritePreviewLocation(headers.location, target);
    }

    const contentType = upstream.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const html = await upstream.text();
      const rewritten = rewriteLocalPreviewHtml(html, target);
      delete headers['content-length'];
      res.writeHead(upstream.status, headers);
      res.end(rewritten);
      return;
    }

    res.writeHead(upstream.status, headers);
    if (!upstream.body) {
      res.end();
      return;
    }
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`로컬 개발서버(${target.port})에 연결하지 못했습니다.`);
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
  if (!RUNTIME_API_TOKEN) return null;
  try {
    const res = await fetch(
      `${RUNTIME_API_URL}/v1/sessions/${encodeURIComponent(sessionId)}`,
      { headers: { Authorization: `Bearer ${RUNTIME_API_TOKEN}` } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (
      data?.session?.hostPath ??
      data?.session?.metadata?.path ??
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
const localPreviewWss = new WebSocketServer({ noServer: true });

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

localPreviewWss.on('connection', async (ws, req, { userId }) => {
  const target = await resolveLocalPreviewTarget(userId, req.url);
  if (!target) {
    ws.close(1008, 'invalid_preview_target');
    return;
  }

  const upstreamUrl = `ws://127.0.0.1:${target.port}${target.upstreamPath}${target.upstreamSearch ? `?${target.upstreamSearch}` : ''}`;
  const upstream = new WebSocket(upstreamUrl, {
    headers: filterProxyRequestHeaders(req.headers),
  });

  upstream.on('open', () => {
    ws.on('message', (data, isBinary) => {
      if (upstream.readyState === upstream.OPEN) {
        upstream.send(data, { binary: isBinary });
      }
    });
  });

  upstream.on('message', (data, isBinary) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(data, { binary: isBinary });
    }
  });

  upstream.on('close', (code, reason) => {
    if (ws.readyState === ws.OPEN) {
      ws.close(code, reason.toString());
    }
  });

  upstream.on('error', () => {
    if (ws.readyState === ws.OPEN) {
      ws.close(1011, 'preview_upstream_error');
    }
  });

  ws.on('close', () => {
    if (upstream.readyState === upstream.OPEN || upstream.readyState === upstream.CONNECTING) {
      upstream.close();
    }
  });
});

// ── Next.js + HTTP 서버 ─────────────────────────────────────────────────────
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    const { pathname } = parse(req.url, true);

    if (pathname?.startsWith(LOCAL_PREVIEW_PREFIX)) {
      const cookies = parseCookies(req.headers.cookie);
      const token = cookies[AUTH_COOKIE_NAME];
      if (!token) {
        res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Unauthorized');
        return;
      }

      const payload = await verifyToken(token);
      if (!payload?.sub) {
        res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Unauthorized');
        return;
      }

      await handleLocalPreviewHttp(req, res, payload.sub);
      return;
    }

    await handle(req, res, parse(req.url, true));
  });

  server.on('upgrade', async (req, socket, head) => {
    const { pathname } = parse(req.url);

    if (pathname?.startsWith(LOCAL_PREVIEW_PREFIX)) {
      const cookies = parseCookies(req.headers.cookie);
      const token = cookies[AUTH_COOKIE_NAME];
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const payload = await verifyToken(token);
      if (!payload?.sub) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      localPreviewWss.handleUpgrade(req, socket, head, (ws) => {
        localPreviewWss.emit('connection', ws, req, { userId: payload.sub });
      });
      return;
    }

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
