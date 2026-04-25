import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ViewportHeightSync } from '@/components/layout/ViewportHeightSync';
import { normalizeAppBasePath, withAppBasePath } from '@/lib/routing/appPath';

const appBasePath = normalizeAppBasePath(process.env.NEXT_PUBLIC_ARIS_WEB_ASSET_PREFIX || process.env.ARIS_WEB_ASSET_PREFIX);

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

const proxyAwareClientRoutingScript = `
(() => {
  const basePath = ${JSON.stringify(appBasePath)};
  if (!basePath) return;
  window.__ARIS_APP_BASE_PATH__ = basePath;

  const shouldPrefix = (url) => {
    return url.origin === window.location.origin
      && url.pathname !== basePath
      && !url.pathname.startsWith(basePath + '/')
      && (url.pathname === '/api' || url.pathname.startsWith('/api/'));
  };

  const rewrite = (value) => {
    try {
      const url = new URL(String(value), window.location.href);
      if (shouldPrefix(url)) {
        url.pathname = basePath + url.pathname;
        return url.toString();
      }
    } catch {
      return value;
    }
    return value;
  };

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = function(input, init) {
      if (typeof input === 'string' || input instanceof URL) {
        return nativeFetch.call(this, rewrite(input), init);
      }
      if (input && typeof input.url === 'string') {
        return nativeFetch.call(this, new Request(rewrite(input.url), input), init);
      }
      return nativeFetch.call(this, input, init);
    };
  }

  const NativeXhr = window.XMLHttpRequest;
  if (typeof NativeXhr === 'function') {
    const nativeOpen = NativeXhr.prototype.open;
    NativeXhr.prototype.open = function(method, url) {
      const args = Array.prototype.slice.call(arguments);
      if (typeof url === 'string' || url instanceof URL) {
        args[1] = rewrite(url);
      }
      return nativeOpen.apply(this, args);
    };
  }

  const NativeEventSource = window.EventSource;
  if (typeof NativeEventSource === 'function') {
    window.EventSource = function(url, config) {
      return config === undefined ? new NativeEventSource(rewrite(url)) : new NativeEventSource(rewrite(url), config);
    };
    window.EventSource.prototype = NativeEventSource.prototype;
  }
})();
`;

export const metadata: Metadata = {
  title: 'ARIS | Agentic Workspace',
  description: 'Streamlined workspace for agentic coding.',
  icons: {
    icon: [
      { url: withAppBasePath('/icon', appBasePath), type: 'image/png', sizes: '32x32' },
      { url: withAppBasePath('/icon', appBasePath), type: 'image/png', sizes: '16x16' },
    ],
    apple: [{ url: withAppBasePath('/apple-icon', appBasePath), type: 'image/png', sizes: '180x180' }],
  },
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
        <script dangerouslySetInnerHTML={{ __html: proxyAwareClientRoutingScript }} />
      </head>
      <body>
        <ViewportHeightSync />
        {children}
      </body>
    </html>
  );
}
