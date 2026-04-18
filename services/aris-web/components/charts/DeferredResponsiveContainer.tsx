'use client';

import React, { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';

type ResponsiveSize = number | `${number}%`;

type DeferredResponsiveContainerProps = {
  children?: ReactNode;
  width?: ResponsiveSize;
  height?: ResponsiveSize;
  minWidth?: number;
  minHeight?: number;
  className?: string;
  style?: CSSProperties;
};

function toCssSize(value: ResponsiveSize | number | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return typeof value === 'number' ? `${value}px` : value;
}

export function DeferredResponsiveContainer({
  children,
  width = '100%',
  height = '100%',
  minWidth = 0,
  minHeight,
  className,
  style,
}: DeferredResponsiveContainerProps) {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return (
      <div
        data-chart-shell="true"
        className={className}
        style={{
          width: toCssSize(width),
          height: toCssSize(height),
          minWidth: toCssSize(minWidth),
          minHeight: toCssSize(minHeight),
          maxWidth: '100%',
          boxSizing: 'border-box',
          ...style,
        }}
        aria-hidden="true"
      />
    );
  }

  return (
    <ResponsiveContainer
      width={width}
      height={height}
      minWidth={minWidth}
      minHeight={minHeight}
      className={className}
    >
      {children}
    </ResponsiveContainer>
  );
}
