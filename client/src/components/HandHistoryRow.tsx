import React from 'react';
import { Card } from './ui';
import { Badge } from './ui/Badge';
import HandDisplay from './HandDisplay';
import type { HandHistoryDTO } from '../../../types/index';

/**
 * Phase 3 / Plan 03-05 (PROFILE-03, PROFILE-04 client-side defense).
 *
 * One Card primitive per hand, collapsed by default. Tap toggles expanded.
 *
 * SECURITY (T-3-PRIVACY-UI): the server (Plan 03-04 HandHistoryRepository.findForUser
 * line 140) is the source of truth for opponent card visibility — it strips
 * `holeCards` to `[]` when the opponent did not show down. This component
 * performs a defense-in-depth check via `visibleShowdownOpponents`: it renders
 * the SHOWN AT SHOWDOWN section only when at least one opponent has BOTH
 * `showedDown === true` AND `holeCards.length > 0`. If those signals disagree
 * (server bug, replay attack, mock data), the cards are NOT rendered.
 *
 * SECURITY (T-3-XSS-CLIENT): all text — tableName, card identifiers, time
 * strings — is rendered as React text children, never via raw HTML injection.
 */

export interface HandHistoryRowProps {
  row: HandHistoryDTO;
  expanded: boolean;
  onToggle: (handId: string) => void;
}

/** Convert ISO string to a short relative-time label. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor((now.getTime() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'yesterday';
  if (diffD < 7) return `${diffD}d ago`;
  const diffW = Math.floor(diffD / 7);
  if (diffW < 5) return `${diffW}w ago`;
  return new Date(iso).toISOString().slice(0, 10); // YYYY-MM-DD fallback
}

/** Compute the result badge per UI-SPEC §Copywriting Contract. */
export function resultLabel(
  netDelta: number,
): { text: 'WIN' | 'LOST' | 'CHOP'; variant: 'sit' | 'fold' | 'neutral' } {
  if (netDelta > 0) return { text: 'WIN', variant: 'sit' };
  if (netDelta < 0) return { text: 'LOST', variant: 'fold' };
  return { text: 'CHOP', variant: 'neutral' };
}

/**
 * Defense-in-depth privacy filter (T-3-PRIVACY-UI).
 *
 * Even though the server (Plan 03-04) strips opponent holeCards to `[]` when
 * showedDown=false, the client double-checks BOTH signals before rendering.
 * If they disagree (e.g. showedDown=true but holeCards=[]), we trust the
 * cards array and render NOTHING for that opponent.
 */
function visibleShowdownOpponents(row: HandHistoryDTO) {
  return row.opponents.filter((o) => o.showedDown && o.holeCards.length > 0);
}

export const HandHistoryRow: React.FC<HandHistoryRowProps> = ({ row, expanded, onToggle }) => {
  const result = resultLabel(row.netDelta);
  const deltaSign = row.netDelta > 0 ? '+' : row.netDelta < 0 ? '-' : '';
  const deltaAbs = Math.abs(row.netDelta);
  const deltaColorVar =
    row.netDelta > 0
      ? 'var(--color-action-sit)'
      : row.netDelta < 0
        ? 'var(--color-action-fold)'
        : 'var(--color-neutral)';
  const deltaGlowVar =
    row.netDelta > 0
      ? 'var(--glow-sit)'
      : row.netDelta < 0
        ? 'var(--glow-fold)'
        : 'var(--glow-neutral)';

  const showdownOpponents = visibleShowdownOpponents(row);

  return (
    <Card
      role="listitem"
      variant={expanded ? 'active' : 'neutral'}
      padding={12}
      glow={expanded}
      style={{ cursor: 'pointer' }}
      aria-expanded={expanded}
      aria-label={`Hand at ${row.tableName}, ${result.text}`}
      onClick={() => onToggle(row.handId)}
    >
      {/* Collapsed row content — always visible */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div
          data-testid="row-time"
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.05em',
            color: 'var(--color-neutral)',
            flex: '0 0 auto',
          }}
        >
          {relativeTime(row.playedAt)}
        </div>
        <div
          data-testid="row-table"
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--color-neutral)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 100,
            flex: '0 1 auto',
          }}
        >
          {row.tableName}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
          <div
            data-testid="row-delta"
            style={{
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'monospace',
              fontVariantNumeric: 'tabular-nums',
              color: deltaColorVar,
              textShadow: `0 0 6px ${deltaGlowVar}`,
            }}
          >
            {deltaSign}
            {deltaAbs}
          </div>
          <Badge variant={result.variant}>{result.text}</Badge>
        </div>
      </div>

      {/* Expanded section — board + own cards + (only if any) showdown opponents */}
      {expanded && (
        <div
          data-testid="row-expanded"
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid color-mix(in srgb, var(--color-neutral) 12%, transparent)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div data-testid="row-board" aria-label="Board cards">
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'var(--color-neutral)',
                marginBottom: 4,
                textTransform: 'uppercase',
              }}
            >
              BOARD
            </div>
            <HandDisplay cards={row.board} size={32} overlap={10} />
          </div>

          <div data-testid="row-own" aria-label="Your hole cards">
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'var(--color-action-call)',
                marginBottom: 4,
                textTransform: 'uppercase',
              }}
            >
              YOUR CARDS
            </div>
            <HandDisplay cards={row.holeCards} size={32} overlap={10} />
          </div>

          {showdownOpponents.length > 0 && (
            <div data-testid="row-showdown" aria-label="Opponents shown at showdown">
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: 'var(--color-neutral)',
                  marginBottom: 4,
                  textTransform: 'uppercase',
                }}
              >
                SHOWN AT SHOWDOWN
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {showdownOpponents.map((o) => (
                  <div
                    key={`${row.handId}-${o.telegramId}`}
                    data-testid={`row-opp-${o.telegramId}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <span style={{ fontSize: 11, color: 'var(--color-neutral)' }}>
                      Seat {o.seat}
                    </span>
                    <HandDisplay cards={o.holeCards} size={32} overlap={10} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
