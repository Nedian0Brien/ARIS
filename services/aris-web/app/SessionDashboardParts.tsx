'use client';

import React from 'react';
import { Cell, Pie, PieChart } from 'recharts';
import { DeferredResponsiveContainer } from '@/components/charts/DeferredResponsiveContainer';
import styles from './SessionDashboard.module.css';

export type ServerDonutData = Array<{
  name: string;
  value: number;
  color: string;
}>;

export function ServerDonutCard({
  data,
  label,
  value,
  cellKeyPrefix,
}: {
  data: ServerDonutData;
  label: string;
  value: string;
  cellKeyPrefix: string;
}) {
  return (
    <div className={styles.serverDonutCard}>
      <div className={styles.serverDonutChart}>
        <DeferredResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={140}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="62%"
              outerRadius="86%"
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              animationBegin={0}
              animationDuration={800}
              stroke="none"
              paddingAngle={1}
              cornerRadius={8}
            >
              {data.map((entry, index) => (
                <Cell key={`${cellKeyPrefix}-cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </DeferredResponsiveContainer>
        <div className={styles.serverDonutCenter}>
          <div className={styles.serverDonutValue}>{value}</div>
          <div className={styles.serverDonutLabel}>{label}</div>
        </div>
      </div>
    </div>
  );
}
