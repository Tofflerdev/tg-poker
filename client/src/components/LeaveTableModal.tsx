import React from 'react';

interface LeaveTableModalProps {
  /** Chips currently in front of the player; null when only spectating. */
  stack: number | null;
  /** True while the player still has a live hand — leaving auto-folds it. */
  inHand: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// crypto-payments-rake peg: 1 chip = $0.01.
const usd = (chips: number) => `$${(chips / 100).toFixed(2)}`;

/**
 * Leave-table confirmation. Replaces Telegram's `showConfirm` system dialog,
 * which rendered in the client's own locale and in native chrome that clashed
 * with the felt. Same bottom-sheet shell as BuyInModal so both table-exit
 * decision points (top up / leave) look like one flow.
 */
const LeaveTableModal: React.FC<LeaveTableModalProps> = ({ stack, inHand, onConfirm, onCancel }) => {
  const hasStack = stack !== null && stack > 0;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      }}
      onClick={onCancel}
    >
      <div
        data-testid="leave-table-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460,
          background: 'rgba(10,10,14,0.92)', backdropFilter: 'blur(12px)',
          borderTop: '1.5px solid rgba(255,71,87,0.5)',
          borderRadius: '18px 18px 0 0',
          padding: `20px 20px max(env(safe-area-inset-bottom), 20px)`,
          boxShadow: '0 -8px 32px rgba(255,71,87,0.15)',
        }}
      >
        <div
          style={{
            color: '#ff4757', fontSize: 13, fontWeight: 800, marginBottom: 6,
            textTransform: 'uppercase', letterSpacing: '0.06em',
            textShadow: '0 0 8px rgba(255,71,87,0.4)',
          }}
        >
          Leave table
        </div>
        <div style={{ color: '#fff', fontSize: 16, fontWeight: 700, marginBottom: 2 }}>
          Stand up and go back to the lobby?
        </div>
        <div style={{ color: '#b0bec5', fontSize: 11, marginBottom: 18, letterSpacing: '0.04em', lineHeight: 1.6 }}>
          {inHand
            ? 'Your current hand will be folded.'
            : 'Your seat will be freed for another player.'}
        </div>

        {hasStack && (
          <div
            style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 10,
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 30, fontWeight: 700, color: '#ffab00',
                textShadow: '0 0 10px rgba(255,171,0,0.4)',
              }}
            >
              {stack!.toLocaleString()}
            </span>
            <span style={{ color: '#00e5ff', fontSize: 15, fontFamily: 'ui-monospace, monospace' }}>
              {usd(stack!)}
            </span>
          </div>
        )}
        {hasStack && (
          <div
            style={{
              textAlign: 'center', color: '#78909c', fontSize: 10, marginBottom: 18,
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}
          >
            returned to your balance
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, height: 48, borderRadius: 12, background: 'transparent',
              border: '1.5px solid rgba(176,190,197,0.4)',
              color: '#b0bec5',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
            className="active:scale-95"
          >
            Stay
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 2, height: 48, borderRadius: 12,
              background: 'rgba(255,71,87,0.15)',
              border: '1.5px solid rgba(255,71,87,0.6)',
              color: '#ff4757',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              boxShadow: 'inset 0 0 12px rgba(255,71,87,0.15)',
            }}
            className="active:scale-95"
          >
            Leave table
          </button>
        </div>
      </div>
    </div>
  );
};

export default LeaveTableModal;
