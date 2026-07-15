import React, { useEffect } from 'react';

/**
 * exit-reconnect F: tells the player where their chips are.
 *
 * Leaving mid-hand cannot pay out immediately — the refund reads the hand-boundary
 * checkpoint, so it lands when the hand ends. Without this the balance simply sits
 * wrong for a few seconds and then jumps, which is exactly how a player concludes
 * the app ate their stack.
 *
 * Neon Strip: dark translucent surface, colour-matched border + glow, bottom-docked
 * with safe-area padding (see CLAUDE.md "Neon Strip").
 */

export type ExitToastState =
  | { kind: 'pending' }
  | { kind: 'done'; refunded: number; reason: 'left' | 'disconnected' };

export interface ExitToastProps {
  state: ExitToastState;
  onDismiss: () => void;
  /** ms before a settled toast auto-hides. Pending never auto-hides — it resolves. */
  autoDismissMs?: number;
}

const NEON = {
  pending: { color: '#ffab00', glow: 'rgba(255,171,0,0.45)' },
  done:    { color: '#00e5ff', glow: 'rgba(0,229,255,0.45)' },
};

export function ExitToast({ state, onDismiss, autoDismissMs = 6000 }: ExitToastProps): JSX.Element {
  useEffect(() => {
    if (state.kind !== 'done') return;
    const t = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(t);
  }, [state, onDismiss, autoDismissMs]);

  const tone = state.kind === 'pending' ? NEON.pending : NEON.done;

  const text =
    state.kind === 'pending'
      ? 'Finishing the current hand — your chips return to your balance when it ends.'
      : state.reason === 'disconnected'
        ? `You were away too long and left the table. ${state.refunded} chips returned to your balance.`
        : `${state.refunded} chips returned to your balance.`;

  return (
    <div
      data-testid={`exit-toast-${state.kind}`}
      role="status"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'max(env(safe-area-inset-bottom), 12px)',
        zIndex: 1100,
        background: 'rgba(10,10,14,0.9)',
        backdropFilter: 'blur(12px)',
        border: `1.5px solid ${tone.color}99`,
        borderRadius: 14,
        boxShadow: `0 0 12px ${tone.glow}`,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ flex: 1, color: '#e8eaed', fontSize: 13, lineHeight: 1.4 }}>{text}</div>
      {state.kind === 'done' && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            background: 'transparent',
            border: `1.5px solid ${tone.color}99`,
            color: tone.color,
            borderRadius: 10,
            minWidth: 44,
            minHeight: 44,
            cursor: 'pointer',
          }}
          className="active:scale-95"
        >
          OK
        </button>
      )}
    </div>
  );
}
