import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ViewportHeightSync } from '@/components/layout/ViewportHeightSync';

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
    <html lang="ko">
      <body>
        <ViewportHeightSync />
        {children}
      </body>
    </html>
  );
}
