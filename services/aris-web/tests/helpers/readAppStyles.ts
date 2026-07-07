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
    .map((fileName) => readFileSync(resolve(stylesDir, fileName), 'utf8'))
    .join('\n');
}
