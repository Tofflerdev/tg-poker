import React from 'react';
import type { TableInfo } from '../../../types/index';
import { useTelegram } from '../hooks/useTelegram';
import { Badge, Card, Button, type ActionTier } from '../components/ui';

interface TableListProps {
  tables: TableInfo[];
  onSelectTable: (tableId: string) => void;
  onBack: () => void;
}

/**
 * Plan 02-05 (UI-02):
 * Table List redesigned in Neon Strip — grouped by stake tier (D-18) with
 * tier-colored section headers (D-19). High Stakes uses `fold` (red) per
 * RESEARCH Q9 — red distinguishes more cleanly from Pro's amber than the
 * allin orange does.
 *
 * Tier classification keyed off bigBlind (matches server/config/tables.ts):
 *   bb ≤ 10  → Beginner    (sit / green)
 *   bb ≤ 20  → Standard    (call / cyan)
 *   bb ≤ 50  → Pro         (raise / amber)
 *   else     → High Stakes (fold / red)
 *
 * Visual layer only — data flow (tables prop, onSelectTable, onBack)
 * preserved from the previous implementation.
 */

type Tier = 'Beginner' | 'Standard' | 'Pro' | 'High Stakes';

const TIER_ORDER: readonly Tier[] = [
  'Beginner',
  'Standard',
  'Pro',
  'High Stakes',
] as const;

const TIER_VARIANT: Record<Tier, ActionTier> = {
  Beginner: 'sit',
  Standard: 'call',
  Pro: 'raise',
  'High Stakes': 'fold',
};

function tierOf(t: TableInfo): Tier {
  const bb = t.config.bigBlind;
  if (bb <= 10) return 'Beginner';
  if (bb <= 20) return 'Standard';
  if (bb <= 50) return 'Pro';
  return 'High Stakes';
}

function groupByTier(tables: TableInfo[]): Record<Tier, TableInfo[]> {
  const groups: Record<Tier, TableInfo[]> = {
    Beginner: [],
    Standard: [],
    Pro: [],
    'High Stakes': [],
  };
  for (const t of tables) {
    groups[tierOf(t)].push(t);
  }
  return groups;
}

export const TableList: React.FC<TableListProps> = ({
  tables,
  onSelectTable,
  onBack,
}) => {
  const { showBackButton, hideBackButton, hapticFeedback, setHeaderColor } =
    useTelegram();

  React.useEffect(() => {
    // Plan 02-03: dark Neon Strip surface (matches --color-surface-base).
    setHeaderColor('#0a0a0e');
    showBackButton(onBack);

    return () => {
      hideBackButton();
    };
  }, [showBackButton, hideBackButton, setHeaderColor, onBack]);

  const handleSelect = (table: TableInfo) => {
    hapticFeedback?.impactOccurred('light');
    onSelectTable(table.id);
  };

  const handleBackClick = () => {
    hapticFeedback?.impactOccurred('light');
    onBack();
  };

  const groups = groupByTier(tables);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-surface-base)',
        paddingTop: 'max(env(safe-area-inset-top), 16px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
        paddingLeft: 16,
        paddingRight: 16,
        color: '#fff',
      }}
    >
      {/* Header: back + title */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <Button
          variant="neutral"
          onClick={handleBackClick}
          aria-label="Back"
          style={{
            minHeight: 40,
            minWidth: 40,
            padding: '0 12px',
            fontSize: 14,
          }}
        >
          ← Back
        </Button>
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: '#fff',
          }}
        >
          Tables
        </h1>
      </div>

      {tables.length === 0 ? (
        <EmptyState />
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {TIER_ORDER.map((tier) => {
            const tierTables = groups[tier];
            if (tierTables.length === 0) return null;
            return (
              <TierSection
                key={tier}
                tier={tier}
                tables={tierTables}
                onSelect={handleSelect}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ---------- Internal pieces ---------- */

interface TierSectionProps {
  tier: Tier;
  tables: TableInfo[];
  onSelect: (table: TableInfo) => void;
}

const TierSection: React.FC<TierSectionProps> = ({ tier, tables, onSelect }) => {
  const variant = TIER_VARIANT[tier];
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          paddingLeft: 2,
          marginBottom: 2,
        }}
      >
        <Badge variant={variant}>{tier}</Badge>
        <span
          style={{
            flex: 1,
            height: 1,
            background: `color-mix(in srgb, ${tierColorVar(variant)} 25%, transparent)`,
          }}
        />
        <span
          style={{
            fontSize: 11,
            color: 'var(--color-neutral)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          {tables.length} {tables.length === 1 ? 'table' : 'tables'}
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {tables.map((table) => (
          <TableRow
            key={table.id}
            table={table}
            variant={variant}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
};

interface TableRowProps {
  table: TableInfo;
  variant: ActionTier;
  onSelect: (table: TableInfo) => void;
}

const TableRow: React.FC<TableRowProps> = ({ table, variant, onSelect }) => {
  const isFull = table.playerCount >= table.maxPlayers;
  const isActive = table.status === 'playing';

  return (
    <Card
      variant={variant}
      padding={0}
      onClick={() => onSelect(table)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(table);
        }
      }}
      style={{
        cursor: 'pointer',
        opacity: isFull ? 0.5 : 1,
        transition: 'opacity .15s, box-shadow .15s, transform .1s',
        WebkitTapHighlightColor: 'transparent',
      }}
      className="active:scale-[0.99]"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 14px',
          minHeight: 56,
        }}
      >
        {/* Left: name + live indicator */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            minWidth: 0,
            flex: 1,
          }}
        >
          <div
            style={{
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {table.name}
          </div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: isActive
                ? 'var(--color-active)'
                : 'var(--color-neutral)',
              textShadow: isActive ? '0 0 6px var(--glow-call)' : 'none',
            }}
          >
            {isActive ? 'Live' : isFull ? 'Full' : 'Open'}
          </div>
        </div>

        {/* Middle: blinds */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            minWidth: 58,
          }}
        >
          <span
            style={{
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 13,
              color: 'var(--color-chip)',
              textShadow: '0 0 6px var(--glow-raise)',
              letterSpacing: '0.02em',
            }}
          >
            {table.config.smallBlind}/{table.config.bigBlind}
          </span>
          <span
            style={{
              fontSize: 9,
              color: 'var(--color-neutral)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginTop: 1,
            }}
          >
            Blinds
          </span>
        </div>

        {/* Right: buy-in + N/6 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            minWidth: 64,
          }}
        >
          <span
            style={{
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 13,
              color: 'var(--color-chip)',
              textShadow: '0 0 6px var(--glow-raise)',
              letterSpacing: '0.02em',
            }}
          >
            {table.config.buyIn.toLocaleString()}
          </span>
          <span
            style={{
              fontSize: 10,
              color: '#fff',
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              letterSpacing: '0.02em',
              marginTop: 2,
            }}
          >
            {table.playerCount}/{table.maxPlayers}
          </span>
        </div>
      </div>
    </Card>
  );
};

const EmptyState: React.FC = () => (
  <Card
    variant="neutral"
    style={{
      marginTop: 40,
      textAlign: 'center',
      padding: '40px 20px',
    }}
  >
    <div
      style={{
        fontSize: 14,
        color: 'var(--color-neutral)',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      No tables available
    </div>
  </Card>
);

/* ---------- Helpers ---------- */

/**
 * Map an ActionTier variant to its matching CSS custom property reference.
 * Kept inline because this is the one place in this file where we need the
 * raw token string for `color-mix()` interpolation (the separator rule).
 * No hex literals — all routes through the shared neon.css tokens.
 */
function tierColorVar(variant: ActionTier): string {
  switch (variant) {
    case 'fold':
      return 'var(--color-action-fold)';
    case 'call':
      return 'var(--color-action-call)';
    case 'raise':
      return 'var(--color-action-raise)';
    case 'allin':
      return 'var(--color-action-allin)';
    case 'sit':
      return 'var(--color-action-sit)';
    case 'active':
      return 'var(--color-active)';
    case 'neutral':
    default:
      return 'var(--color-neutral)';
  }
}
