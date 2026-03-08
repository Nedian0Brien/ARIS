#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(appRoot, relativePath), 'utf8');
}

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function findBlock(css, selector) {
  const cleanCss = stripComments(css);
  const start = cleanCss.indexOf(selector);
  if (start === -1) return null;
  const open = cleanCss.indexOf('{', start);
  if (open === -1) return null;

  let depth = 0;
  for (let i = open; i < cleanCss.length; i += 1) {
    if (cleanCss[i] === '{') depth += 1;
    if (cleanCss[i] === '}') depth -= 1;
    if (depth === 0) {
      return cleanCss.slice(open + 1, i);
    }
  }
  return null;
}

function parseVars(block) {
  const vars = {};
  if (!block) return vars;
  const pattern = /--([A-Za-z0-9_-]+)\s*:\s*([^;]+);/g;
  for (const match of block.matchAll(pattern)) {
    vars[`--${match[1]}`] = match[2].trim();
  }
  return vars;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseAlpha(raw) {
  if (raw == null) return 1;
  const value = raw.trim();
  if (value.endsWith('%')) {
    return clamp(Number.parseFloat(value) / 100, 0, 1);
  }
  return clamp(Number.parseFloat(value), 0, 1);
}

function parseRgb(expr) {
  const normalized = expr.replace(/\s+/g, ' ').trim();
  const rgba = normalized.match(/^rgba?\(\s*([0-9.]+)\s*[, ]\s*([0-9.]+)\s*[, ]\s*([0-9.]+)(?:\s*[,/]\s*([0-9.%]+))?\s*\)$/i);
  if (!rgba) return null;
  return {
    r: clamp(Number.parseFloat(rgba[1]), 0, 255),
    g: clamp(Number.parseFloat(rgba[2]), 0, 255),
    b: clamp(Number.parseFloat(rgba[3]), 0, 255),
    a: parseAlpha(rgba[4]),
  };
}

function parseHex(expr) {
  const value = expr.trim().replace('#', '');
  if (![3, 4, 6, 8].includes(value.length)) return null;

  const hex = value.length <= 4
    ? value.split('').map((ch) => ch + ch).join('')
    : value;

  const hasAlpha = hex.length === 8;
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
    a: hasAlpha ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
  };
}

function splitVarExpression(content) {
  let depth = 0;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      return [content.slice(0, i).trim(), content.slice(i + 1).trim()];
    }
  }
  return [content.trim(), null];
}

function extractFirstColorToken(value) {
  const token = value.match(/var\([^()]+\)|#[0-9A-Fa-f]{3,8}|rgba?\([^()]+\)|\btransparent\b|\bwhite\b|\bblack\b/i);
  return token?.[0] ?? null;
}

function composite(fg, bg) {
  if (fg.a >= 0.999) {
    return { r: fg.r, g: fg.g, b: fg.b, a: 1 };
  }
  const alpha = clamp(fg.a, 0, 1);
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
    a: 1,
  };
}

function parseColor(expr, vars, seen = new Set()) {
  if (!expr) return null;
  const value = expr.trim();

  if (value.startsWith('var(') && value.endsWith(')')) {
    const inside = value.slice(4, -1);
    const [varName, fallback] = splitVarExpression(inside);
    if (!varName.startsWith('--')) {
      return fallback ? parseColor(fallback, vars, seen) : null;
    }
    if (seen.has(varName)) return null;
    seen.add(varName);
    const resolved = vars[varName];
    const fromVar = resolved ? parseColor(resolved, vars, seen) : null;
    seen.delete(varName);
    return fromVar ?? (fallback ? parseColor(fallback, vars, seen) : null);
  }

  if (value.startsWith('#')) {
    return parseHex(value);
  }

  if (/^rgba?\(/i.test(value)) {
    return parseRgb(value);
  }

  if (/^(linear-gradient|radial-gradient|conic-gradient)\(/i.test(value)) {
    const token = extractFirstColorToken(value);
    return token ? parseColor(token, vars, seen) : null;
  }

  if (/^color-mix\(/i.test(value)) {
    const mix = value.match(/^color-mix\(\s*in\s+srgb\s*,\s*(.+?)\s+([0-9.]+)%\s*,\s*(.+?)\s+([0-9.]+)%\s*\)$/i);
    if (!mix) return null;
    const left = parseColor(mix[1], vars, seen);
    const right = parseColor(mix[3], vars, seen);
    if (!left || !right) return null;
    const lw = Number.parseFloat(mix[2]) / 100;
    const rw = Number.parseFloat(mix[4]) / 100;
    return {
      r: left.r * lw + right.r * rw,
      g: left.g * lw + right.g * rw,
      b: left.b * lw + right.b * rw,
      a: left.a * lw + right.a * rw,
    };
  }

  if (/^transparent$/i.test(value)) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  if (/^white$/i.test(value)) {
    return { r: 255, g: 255, b: 255, a: 1 };
  }
  if (/^black$/i.test(value)) {
    return { r: 0, g: 0, b: 0, a: 1 };
  }

  return null;
}

function toLinear(rgbChannel) {
  const s = rgbChannel / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(color) {
  const r = toLinear(color.r);
  const g = toLinear(color.g);
  const b = toLinear(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const bright = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}

function resolvePairContrast(vars, theme, fgExpr, bgExpr) {
  const defaultCanvas = theme === 'dark' ? { r: 11, g: 18, b: 32, a: 1 } : { r: 248, g: 250, b: 252, a: 1 };
  const canvas = parseColor('var(--bg)', vars) ?? defaultCanvas;
  const flatCanvas = canvas.a < 1 ? composite(canvas, defaultCanvas) : canvas;

  const bgRaw = parseColor(bgExpr, vars);
  if (!bgRaw) return null;
  const bg = bgRaw.a < 1 ? composite(bgRaw, flatCanvas) : bgRaw;

  const fgRaw = parseColor(fgExpr, vars);
  if (!fgRaw) return null;
  const fg = fgRaw.a < 1 ? composite(fgRaw, bg) : fgRaw;

  return contrastRatio(fg, bg);
}

function mergeVars(...groups) {
  return Object.assign({}, ...groups);
}

const tokensCss = read('app/styles/tokens.css');
const chatCss = read('app/sessions/[sessionId]/ChatInterface.module.css');
const dashboardCss = read('app/SessionDashboard.module.css');

const globalLight = parseVars(findBlock(tokensCss, ':root'));
const globalDark = parseVars(findBlock(tokensCss, "html[data-theme='dark']"));
const chatLight = parseVars(findBlock(chatCss, '.chatShell'));
const chatDark = parseVars(findBlock(chatCss, ":global(html[data-theme='dark']) .chatShell"));
const dashboardLight = parseVars(findBlock(dashboardCss, '.sessionDashboardLayout'));
const dashboardDark = parseVars(findBlock(dashboardCss, ":global(html[data-theme='dark']) .sessionDashboardLayout"));

const themeVars = {
  light: {
    global: mergeVars(globalLight),
    chat: mergeVars(globalLight, chatLight),
    dashboard: mergeVars(globalLight, dashboardLight),
  },
  dark: {
    global: mergeVars(globalLight, globalDark),
    chat: mergeVars(globalLight, globalDark, chatLight, chatDark),
    dashboard: mergeVars(globalLight, globalDark, dashboardLight, dashboardDark),
  },
};

const checks = [
  { id: 'global/text-bg', scope: 'global', fg: 'var(--text)', bg: 'var(--bg)', min: 7 },
  { id: 'global/text-surface', scope: 'global', fg: 'var(--text)', bg: 'var(--surface)', min: 7 },
  { id: 'global/muted-surface', scope: 'global', fg: 'var(--text-muted)', bg: 'var(--surface)', min: 4.5 },
  { id: 'chat/primary-panel', scope: 'chat', fg: 'var(--chat-text-primary)', bg: 'var(--chat-panel-bg)', min: 4.5 },
  { id: 'chat/muted-panel', scope: 'chat', fg: 'var(--chat-text-muted)', bg: 'var(--chat-panel-bg)', min: 3 },
  { id: 'chat/control', scope: 'chat', fg: 'var(--chat-control-text)', bg: 'var(--chat-control-bg)', min: 4.5 },
  { id: 'dashboard/text-card', scope: 'dashboard', fg: 'var(--text)', bg: 'var(--dashboard-card-bg)', min: 4.5 },
  { id: 'dashboard/muted-card', scope: 'dashboard', fg: 'var(--text-muted)', bg: 'var(--dashboard-card-bg)', min: 3 },
];

let failures = 0;
let unresolved = 0;

for (const theme of ['light', 'dark']) {
  for (const check of checks) {
    const vars = themeVars[theme][check.scope];
    const ratio = resolvePairContrast(vars, theme, check.fg, check.bg);
    if (ratio == null || Number.isNaN(ratio)) {
      unresolved += 1;
      failures += 1;
      console.log(`[FAIL] ${theme} ${check.id}: could not resolve colors`);
      continue;
    }
    const pass = ratio >= check.min;
    if (!pass) failures += 1;
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${theme} ${check.id}: ${ratio.toFixed(2)} (min ${check.min.toFixed(1)})`);
  }
}

if (unresolved > 0) {
  console.log(`\nUnresolved checks: ${unresolved}`);
}

if (failures > 0) {
  console.log(`\nContrast audit failed: ${failures} check(s) did not meet thresholds.`);
  process.exit(1);
}

console.log('\nContrast audit passed.');
