import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ARIS | Agentic Workspace',
  description: 'Streamlined workspace for agentic coding.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        {children}
      </body>
    </html>
  );
}
