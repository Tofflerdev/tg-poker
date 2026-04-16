import React from 'react';

/**
 * Tab + TabBar — Neon Strip underline tab primitives.
 *
 * Phase 2 / Plan 02-01 (D-04, D-06):
 * - Active tab color routes through var(--color-active); inactive uses
 *   var(--color-neutral). Fixed semantic mapping — no variant prop.
 * - Active tab renders a 2px-tall bottom GlowBar (cyan, var(--glow-call)
 *   shadow) that extends below the row's 1px neutral separator.
 * - Tap target min 44px per mobile guidelines.
 * - Used by Plan 06 (Profile 3 tabs: Profile / Avatar / History).
 */

export interface TabProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

export const Tab: React.FC<TabProps> = ({ label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      position: 'relative',
      flex: 1,
      minHeight: 44,
      padding: '10px 12px',
      background: 'transparent',
      border: 'none',
      color: active ? 'var(--color-active)' : 'var(--color-neutral)',
      fontSize: 13,
      fontWeight: 700,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      cursor: 'pointer',
      transition: 'color .15s',
      WebkitTapHighlightColor: 'transparent',
    }}
  >
    {label}
    {active && (
      <span
        style={{
          position: 'absolute',
          bottom: -1,
          left: '15%',
          right: '15%',
          height: 2,
          borderRadius: 2,
          background: 'var(--color-active)',
          boxShadow: '0 0 8px var(--glow-call)',
          pointerEvents: 'none',
        }}
      />
    )}
  </button>
);

export interface TabBarProps {
  tabs: { id: string; label: string }[];
  activeId: string;
  onChange: (id: string) => void;
}

export const TabBar: React.FC<TabBarProps> = ({ tabs, activeId, onChange }) => (
  <div
    role="tablist"
    style={{
      display: 'flex',
      borderBottom: '1px solid color-mix(in srgb, var(--color-neutral) 18%, transparent)',
    }}
  >
    {tabs.map((t) => (
      <Tab
        key={t.id}
        label={t.label}
        active={t.id === activeId}
        onClick={() => onChange(t.id)}
      />
    ))}
  </div>
);
