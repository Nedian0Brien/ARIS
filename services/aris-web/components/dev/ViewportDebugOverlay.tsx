'use client';

import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'aris.vv-debug';
const MAX_EVENTS = 12;

/**
 * 모바일 키보드-컴포저 버그의 실기기 진단용 오버레이.
 *
 * headless 브라우저는 iOS Safari의 비주얼 뷰포트 패닝(키보드가 열릴 때
 * 레이아웃 뷰포트는 그대로 두고 보이는 영역만 이동시키며, 필요하면 없던
 * 스크롤 공간까지 만들어 문서를 밀어올리는 동작)을 재현하지 못한다.
 * 이 오버레이는 재현 순간의 실제 값(visualViewport.height/offsetTop,
 * scrollY, 문서/셸 높이, 이벤트 타임라인)을 화면에 직접 그려서,
 * 스크린샷 한 장으로 원인을 확정할 수 있게 한다.
 *
 * 활성화: 아무 페이지나 ?vvdebug=1 을 붙여 접속(localStorage에 저장되어
 * 유지됨). 비활성화: ?vvdebug=0.
 *
 * 오버레이 자체는 vv.offsetTop만큼 top을 보정하므로 뷰포트가 패닝된
 * 상태에서도 항상 화면 안에 남는다.
 */
function readEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    const param = new URLSearchParams(window.location.search).get('vvdebug');
    if (param === '1') {
      window.localStorage.setItem(STORAGE_KEY, '1');
      return true;
    }
    if (param === '0') {
      window.localStorage.removeItem(STORAGE_KEY);
      return false;
    }
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

type Snapshot = {
  vvHeight: number;
  vvOffsetTop: number;
  innerHeight: number;
  scrollY: number;
  bodyScrollHeight: number;
  docScrollHeight: number;
  shellHeight: number | null;
  cmpTop: number | null;
  cmpBottom: number | null;
  keyboardOpen: string;
};

function takeSnapshot(): Snapshot {
  const shell = document.querySelector('[data-project-chat-screen] .shell, .pc-proto .shell');
  const cmp = document.querySelector('.cmp-wrap .cmp');
  const shellRect = shell?.getBoundingClientRect();
  const cmpRect = cmp?.getBoundingClientRect();
  return {
    vvHeight: Math.round(window.visualViewport?.height ?? -1),
    vvOffsetTop: Math.round(window.visualViewport?.offsetTop ?? -1),
    innerHeight: window.innerHeight,
    scrollY: Math.round(window.scrollY),
    bodyScrollHeight: document.body.scrollHeight,
    docScrollHeight: document.documentElement.scrollHeight,
    shellHeight: shellRect ? Math.round(shellRect.height) : null,
    cmpTop: cmpRect ? Math.round(cmpRect.top) : null,
    cmpBottom: cmpRect ? Math.round(cmpRect.bottom) : null,
    keyboardOpen: document.documentElement.dataset.keyboardOpen ?? '-',
  };
}

export function ViewportDebugOverlay() {
  const [enabled, setEnabled] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const focusEpochRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    setEnabled(readEnabled());
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const pushEvent = (label: string) => {
      const t = focusEpochRef.current
        ? `+${Math.round(performance.now() - focusEpochRef.current)}ms`
        : 't?';
      setEvents((current) => [...current.slice(-(MAX_EVENTS - 1)), `${t} ${label}`]);
    };

    const refresh = () => {
      if (rafRef.current !== null) {
        return;
      }
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        setSnapshot(takeSnapshot());
      });
    };

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      focusEpochRef.current = performance.now();
      pushEvent(`focusin ${target?.tagName?.toLowerCase() ?? '?'}.${(target?.className ?? '').toString().split(' ')[0]}`);
      refresh();
    };
    const onFocusOut = () => {
      pushEvent('focusout');
      refresh();
    };
    const onVvResize = () => {
      const vv = window.visualViewport;
      pushEvent(`vv.resize h=${Math.round(vv?.height ?? -1)} top=${Math.round(vv?.offsetTop ?? -1)}`);
      refresh();
    };
    const onVvScroll = () => {
      const vv = window.visualViewport;
      pushEvent(`vv.scroll h=${Math.round(vv?.height ?? -1)} top=${Math.round(vv?.offsetTop ?? -1)}`);
      refresh();
    };
    const onWindowScroll = () => {
      pushEvent(`win.scroll sY=${Math.round(window.scrollY)}`);
      refresh();
    };

    document.addEventListener('focusin', onFocusIn, { passive: true } as AddEventListenerOptions);
    document.addEventListener('focusout', onFocusOut, { passive: true } as AddEventListenerOptions);
    window.visualViewport?.addEventListener('resize', onVvResize, { passive: true } as AddEventListenerOptions);
    window.visualViewport?.addEventListener('scroll', onVvScroll, { passive: true } as AddEventListenerOptions);
    window.addEventListener('scroll', onWindowScroll, { passive: true });
    // 이벤트가 발생하지 않는 변화(레이아웃 전환 등)도 주기적으로 갱신한다.
    const interval = window.setInterval(refresh, 300);
    refresh();

    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      window.visualViewport?.removeEventListener('resize', onVvResize);
      window.visualViewport?.removeEventListener('scroll', onVvScroll);
      window.removeEventListener('scroll', onWindowScroll);
      window.clearInterval(interval);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [enabled]);

  if (!enabled || !snapshot) {
    return null;
  }

  const s = snapshot;
  return (
    <div
      data-vv-debug-overlay
      style={{
        position: 'fixed',
        // 비주얼 뷰포트가 패닝돼도 항상 보이도록 offsetTop만큼 보정한다.
        top: s.vvOffsetTop + 44,
        left: 4,
        right: 4,
        zIndex: 2147483000,
        pointerEvents: 'none',
        background: 'rgba(0, 0, 0, 0.78)',
        color: '#7dff9a',
        font: '10px/1.45 ui-monospace, Menlo, monospace',
        padding: '6px 8px',
        borderRadius: 6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}
    >
      {`vv h=${s.vvHeight} top=${s.vvOffsetTop} | innerH=${s.innerHeight} sY=${s.scrollY} kb=${s.keyboardOpen}
body sh=${s.bodyScrollHeight} doc sh=${s.docScrollHeight} | shell h=${s.shellHeight ?? '-'} | cmp ${s.cmpTop ?? '-'}..${s.cmpBottom ?? '-'}
${events.join('\n')}`}
    </div>
  );
}
