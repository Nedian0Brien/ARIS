import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ViewportHeightSync } from '@/components/layout/ViewportHeightSync';

const themeBootScript = `
(() => {
  try {
    const key = 'aris-theme';
    const stored = localStorage.getItem(key);
    const mode = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolved = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.themeMode = mode;
  } catch {
    document.documentElement.dataset.theme = 'light';
  }
})();
`;

export const metadata: Metadata = {
  title: 'ARIS | Agentic Workspace',
  description: 'Streamlined workspace for agentic coding.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <ViewportHeightSync />
        {children}
      </body>
    </html>
  );
}
