import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Pie, PieChart } from 'recharts';

import { SessionDashboard } from '@/app/SessionDashboard';
import { DeferredResponsiveContainer } from '@/components/charts/DeferredResponsiveContainer';
import type { SessionSummary } from '@/lib/happy/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DeferredResponsiveContainer', () => {
  it('renders a placeholder during SSR without triggering the Recharts negative size warning', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const markup = renderToString(
      React.createElement(
        DeferredResponsiveContainer,
        { width: '100%', height: '100%', minHeight: 140 },
        React.createElement(
          PieChart,
          null,
          React.createElement(Pie, {
            data: [{ name: 'used', value: 64 }],
            dataKey: 'value',
          }),
        ),
      ),
    );

    const loggedOutput = consoleErrorSpy.mock.calls.flat().map(String).join('\n');

    expect(markup).toContain('data-chart-shell="true"');
    expect(markup).toContain('min-height:140px');
    expect(loggedOutput).not.toContain('The width(-1) and height(-1) of chart should be greater than 0');
  });

  it('keeps SessionDashboard SSR free from the Recharts negative size warning', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sessions: SessionSummary[] = [
      {
        id: 'session-1',
        agent: 'codex',
        status: 'idle',
        lastActivityAt: '2026-04-18T00:00:00.000Z',
        riskScore: 0,
        projectName: '/workspace/session-1',
      },
    ];

    renderToString(
      React.createElement(SessionDashboard, {
        initialSessions: sessions,
        isOperator: false,
        browserRootPath: '/home/ubuntu',
      }),
    );

    const loggedOutput = consoleErrorSpy.mock.calls.flat().map(String).join('\n');

    expect(loggedOutput).not.toContain('The width(-1) and height(-1) of chart should be greater than 0');
  });
});
