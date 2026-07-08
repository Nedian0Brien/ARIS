import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const stylesDir = resolve(__dirname, '../../app/styles');

const appStyleFiles = [
  'ui.css',
  'ia-shell.css',
  'home.css',
  'project.css',
  'project-chat.css',
  'files.css',
  'ui-responsive.css',
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
