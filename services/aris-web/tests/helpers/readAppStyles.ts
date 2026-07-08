import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const stylesDir = resolve(__dirname, '../../app/styles');

// app/globals.css의 실제 @import 순서와 일치시킨다 — 순서가 다르면 동률
// specificity에서 실제 프로덕션 캐스케이드와 다른 승자가 선택되어 테스트가
// 거짓 양성을 낼 수 있다(layout.css가 빠져 있던 것이 실제 사례).
const appStyleFiles = [
  'ui.css',
  'ia-shell.css',
  'home.css',
  'project.css',
  'project-chat.css',
  'files.css',
  'ui-responsive.css',
  'layout.css',
];

export function readAppStyles() {
  return appStyleFiles
    .map((fileName) => readCssWithImports(resolve(stylesDir, fileName)))
    .join('\n');
}

export function readCssWithImports(filePath: string): string {
  const source = readFileSync(filePath, 'utf8');
  const fileDir = dirname(filePath);

  return source.replace(/^@import\s+['"](.+)['"];\s*$/gm, (_statement, importPath: string) => {
    return readCssWithImports(resolve(fileDir, importPath));
  });
}
