import React, { useMemo, useState } from 'react';
import type { TableInfo } from '../../../types/index';

interface BuyInModalProps {
  table: TableInfo;
  balance: number;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
  /**
   * exit-reconnect B10: 'rebuy' is the same picker shown after busting out, where
   * cancelling means leaving the table rather than just closing a sheet. Busting is
   * a decision point, not an error — the old flow fired a system "your stack is 0"
   * message and dropped the player into a seat map they could click.
   */
  variant?: 'join' | 'rebuy';
}

// crypto-payments-rake peg: 1 chip = $0.01.
const usd = (chips: number) => `$${(chips / 100).toFixed(2)}`;

/**
 * crypto-payments-rake phase 3: buy-in amount picker. The player chooses any
 * integer chip count in [minBuyIn, maxBuyIn] before sitting down. The slider is
 * capped by the player's balance so they can never request more than they hold;
 * if the balance is below minBuyIn, sitting is blocked with a hint to deposit.
 */
const BuyInModal: React.FC<BuyInModalProps> = ({ table, balance, onConfirm, onCancel, variant = 'join' }) => {
  const isRebuy = variant === 'rebuy';
  const { minBuyIn, maxBuyIn, bigBlind } = table.config;

  // Effective ceiling is limited by what the player can afford.
  const affordableMax = Math.min(maxBuyIn, balance);
  const canAfford = balance >= minBuyIn;
  const [amount, setAmount] = useState<number>(() =>
    canAfford ? Math.max(minBuyIn, Math.min(affordableMax, maxBuyIn)) : minBuyIn
  );

  const bb = useMemo(() => (bigBlind > 0 ? Math.round(amount / bigBlind) : 0), [amount, bigBlind]);

  const clamp = (v: number) => Math.max(minBuyIn, Math.min(canAfford ? affordableMax : maxBuyIn, v));

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
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460,
          background: 'rgba(10,10,14,0.92)', backdropFilter: 'blur(12px)',
          borderTop: '1.5px solid rgba(0,229,255,0.5)',
          borderRadius: '18px 18px 0 0',
          padding: `20px 20px max(env(safe-area-inset-bottom), 20px)`,
          boxShadow: '0 -8px 32px rgba(0,229,255,0.15)',
        }}
      >
        {isRebuy && (
          <div
            data-testid="rebuy-heading"
            style={{
              color: '#ffab00', fontSize: 13, fontWeight: 800, marginBottom: 6,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              textShadow: '0 0 8px rgba(255,171,0,0.4)',
            }}
          >
            You're out of chips — top up to keep playing
          </div>
        )}
        <div style={{ color: '#fff', fontSize: 16, fontWeight: 700, marginBottom: 2 }}>
          {table.name}
        </div>
        <div style={{ color: '#b0bec5', fontSize: 11, marginBottom: 16, letterSpacing: '0.04em' }}>
          Blinds {table.config.smallBlind}/{table.config.bigBlind} · buy-in {minBuyIn.toLocaleString()}–{maxBuyIn.toLocaleString()} ({usd(minBuyIn)}–{usd(maxBuyIn)})
        </div>

        {/* Chosen amount readout */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 10, marginBottom: 4 }}>
          <span
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 30, fontWeight: 700, color: '#ffab00',
              textShadow: '0 0 10px rgba(255,171,0,0.4)',
            }}
          >
            {amount.toLocaleString()}
          </span>
          <span style={{ color: '#00e5ff', fontSize: 15, fontFamily: 'ui-monospace, monospace' }}>{usd(amount)}</span>
        </div>
        <div style={{ textAlign: 'center', color: '#78909c', fontSize: 10, marginBottom: 16, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {bb} BB stack
        </div>

        {canAfford ? (
          <>
            <input
              type="range"
              min={minBuyIn}
              max={canAfford ? affordableMax : maxBuyIn}
              step={1}
              value={amount}
              onChange={(e) => setAmount(clamp(Number(e.target.value)))}
              style={{ width: '100%', accentColor: '#00e5ff', marginBottom: 8 }}
              aria-label="Buy-in amount"
            />

            {/* Quick presets */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
              {[
                { label: 'Min', v: minBuyIn },
                { label: '½', v: clamp(Math.round((minBuyIn + maxBuyIn) / 2)) },
                { label: 'Max', v: clamp(maxBuyIn) },
              ].map((p) => (
                <button
                  key={p.label}
                  onClick={() => setAmount(p.v)}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 10,
                    background: amount === p.v ? 'rgba(0,229,255,0.15)' : 'transparent',
                    border: `1.5px solid ${amount === p.v ? 'rgba(0,229,255,0.6)' : 'rgba(176,190,197,0.3)'}`,
                    color: amount === p.v ? '#00e5ff' : '#b0bec5',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                  className="active:scale-95"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div style={{ color: '#ff6d00', fontSize: 13, textAlign: 'center', margin: '8px 0 18px', lineHeight: 1.5 }}>
            {isRebuy ? 'Not enough balance to top up.' : 'Not enough balance to sit here.'}<br />
            You hold {balance.toLocaleString()} ({usd(balance)}); minimum buy-in is {minBuyIn.toLocaleString()} ({usd(minBuyIn)}).
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, height: 48, borderRadius: 12, background: 'transparent',
              border: `1.5px solid ${isRebuy ? 'rgba(255,71,87,0.5)' : 'rgba(176,190,197,0.4)'}`,
              color: isRebuy ? '#ff4757' : '#b0bec5',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
            className="active:scale-95"
          >
            {/* On a re-buy there is no "just close": you either top up or you leave. */}
            {isRebuy ? 'Leave table' : 'Cancel'}
          </button>
          <button
            disabled={!canAfford}
            onClick={() => onConfirm(amount)}
            style={{
              flex: 2, height: 48, borderRadius: 12,
              background: canAfford ? 'rgba(76,175,80,0.15)' : 'rgba(120,144,156,0.1)',
              border: `1.5px solid ${canAfford ? 'rgba(76,175,80,0.6)' : 'rgba(120,144,156,0.3)'}`,
              color: canAfford ? '#4caf50' : '#546e7a',
              fontSize: 14, fontWeight: 700, cursor: canAfford ? 'pointer' : 'not-allowed',
              boxShadow: canAfford ? 'inset 0 0 12px rgba(76,175,80,0.15)' : 'none',
            }}
            className="active:scale-95"
          >
            {isRebuy ? 'Top up' : 'Sit down'} · {usd(amount)}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BuyInModal;
