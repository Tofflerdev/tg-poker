import React from 'react';
import { Card } from '../../components/ui';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { AdminState } from '../../../../types/index';

/**
 * Phase 5 / Plan 05-05 / ADMIN-03 / AdminEconomy.
 *
 * Economy tab — StatCards (Total Chips in Play, Active Players) and a recharts
 * BarChart showing chips per table. ResponsiveContainer is wrapped in a Card
 * with explicit height: 320 (Pitfall 7 — 0px parent prevents ResizeObserver).
 */

interface StatCardProps {
  label: string;
  value: string;
  color?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, color }) => (
  <Card variant="neutral" style={{ padding: 16, flex: 1 }}>
    <div
      style={{
        fontSize: 13,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--color-neutral)',
        marginBottom: 8,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: 28,
        fontWeight: 700,
        color: color ?? 'var(--color-active)',
        textShadow: `0 0 12px ${color ?? 'var(--color-active)'}`,
      }}
    >
      {value}
    </div>
  </Card>
);

interface Props {
  state: AdminState;
}

export const AdminEconomy: React.FC<Props> = ({ state }) => {
  const tableData = state.tables.map((t) => ({
    name: t.name,
    chips: state.users
      .filter((u) => u.tableId === t.id)
      .reduce((sum, u) => sum + u.chips, 0),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 16 }}>
        <StatCard
          label="Total Chips in Play"
          value={state.totalChipsInPlay.toLocaleString()}
          color="var(--color-chip)"
        />
        <StatCard
          label="Active Players"
          value={String(state.users.length)}
        />
      </div>
      <Card variant="neutral" style={{ padding: 16, height: 320 }}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={tableData}>
            <CartesianGrid
              stroke="color-mix(in srgb, var(--color-neutral) 15%, transparent)"
            />
            <XAxis
              dataKey="name"
              stroke="var(--color-neutral)"
              fontSize={13}
            />
            <YAxis stroke="var(--color-neutral)" fontSize={13} />
            <Tooltip
              contentStyle={{
                background: 'rgba(10,10,14,0.95)',
                border: '1.5px solid var(--color-active)',
                fontSize: 13,
                color: '#fff',
              }}
            />
            <Bar dataKey="chips" fill="var(--color-chip)" fillOpacity={0.8} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
};
