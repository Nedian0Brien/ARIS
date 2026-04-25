'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    __ARIS_REACT_GRAB_BOOTED__?: boolean;
  }
}

export function ReactGrabDevBoot() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    if (window.__ARIS_REACT_GRAB_BOOTED__) {
      return;
    }

    window.__ARIS_REACT_GRAB_BOOTED__ = true;

    void import('react-grab').catch((error) => {
      window.__ARIS_REACT_GRAB_BOOTED__ = false;
      console.error('Failed to load react-grab in development mode.', error);
    });
  }, []);

  return null;
}
