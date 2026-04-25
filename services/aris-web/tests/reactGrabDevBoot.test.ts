import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(import.meta.dirname, '..');

describe('ReactGrabDevBoot wiring', () => {
  it('loads react-grab through the dev boot component', () => {
    const source = readFileSync(path.join(appRoot, 'components/dev/ReactGrabDevBoot.tsx'), 'utf8');

    expect(source).toContain("import('react-grab')");
    expect(source).toContain("__ARIS_REACT_GRAB_BOOTED__");
  });

  it('renders the dev boot only in development layout', () => {
    const source = readFileSync(path.join(appRoot, 'app/layout.tsx'), 'utf8');

    expect(source).toContain("import { ReactGrabDevBoot } from '@/components/dev/ReactGrabDevBoot';");
    expect(source).toContain("process.env.NODE_ENV === 'development' ? <ReactGrabDevBoot /> : null");
  });

  it('declares react-grab as an app dependency', () => {
    const packageJson = readFileSync(path.join(appRoot, 'package.json'), 'utf8');

    expect(packageJson).toContain('"react-grab": "^0.1.32"');
  });
});
