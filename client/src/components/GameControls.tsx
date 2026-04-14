import React, { useState, useEffect } from "react";
import { Socket } from "socket.io-client";
import { GameState, ExtendedClientEvents, ExtendedServerEvents } from "../../../types/index";
import { useTelegram } from "../hooks/useTelegram";
import { useIsMobile } from "../hooks/useIsMobile";

interface Props {
  socket: Socket<ExtendedServerEvents, ExtendedClientEvents>;
  gameState: GameState;
  mySeat: number | null;
}

const useCountdown = (targetTime: number | null): number | null => {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!targetTime) {
      setRemaining(null);
      return;
    }

    const updateRemaining = () => {
      const now = Date.now();
      const diff = Math.ceil((targetTime - now) / 1000);
      setRemaining(diff > 0 ? diff : 0);
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);

    return () => clearInterval(interval);
  }, [targetTime]);

  return remaining;
};

/* ── Neon tokens — consumed from client/src/styles/neon.css via CSS custom properties.
   Do not introduce hex literals here. See .planning/phases/01-foundations-design-system/01-CONTEXT.md D-01/D-02. ── */
type NeonTier = {
  color: string;      // var(--color-*)
  glow: string;       // var(--glow-*)
  borderMix: string;  // color-mix(...) — semi-transparent border color (matches historical `${color}60`)
  tintStrong: string; // color-mix(...) — for active bg top stop (historical `${color}18`)
  tintWeak: string;   // color-mix(...) — for active bg bottom stop (historical `${color}08`)
};

const neon = (color: string, glow: string): NeonTier => ({
  color,
  glow,
  borderMix: `color-mix(in srgb, ${color} 38%, transparent)`,
  tintStrong: `color-mix(in srgb, ${color} 10%, transparent)`,
  tintWeak: `color-mix(in srgb, ${color} 3%, transparent)`,
});

const N = {
  fold:   neon('var(--color-action-fold)',  'var(--glow-fold)'),
  call:   neon('var(--color-action-call)',  'var(--glow-call)'),
  check:  neon('var(--color-action-call)',  'var(--glow-call)'),
  raise:  neon('var(--color-action-raise)', 'var(--glow-raise)'),
  allin:  neon('var(--color-action-allin)', 'var(--glow-allin)'),
  preset: neon('var(--color-neutral)',      'var(--glow-neutral)'),
} as const;

/* ── Shared button base (neon strip style) ── */
const neonBtn = (
  n: NeonTier,
  active = false,
): React.CSSProperties => ({
  background: active
    ? `linear-gradient(180deg, ${n.tintStrong} 0%, ${n.tintWeak} 100%)`
    : 'transparent',
  border: `1.5px solid ${n.borderMix}`,
  borderRadius: 14,
  color: n.color,
  fontWeight: 700,
  letterSpacing: '0.03em',
  textTransform: 'uppercase' as const,
  position: 'relative' as const,
  overflow: 'hidden' as const,
  transition: 'box-shadow .15s, background .15s, transform .1s',
  WebkitTapHighlightColor: 'transparent',
  boxShadow: active ? `0 0 18px ${n.glow}, inset 0 0 12px ${n.glow}` : 'none',
});

/* ── Glow bar at bottom of button ── */
const GlowBar: React.FC<{ color: string; glow?: string }> = ({ color, glow }) => (
  <span
    style={{
      position: 'absolute',
      bottom: 0,
      left: '15%',
      right: '15%',
      height: 2,
      borderRadius: 2,
      background: color,
      boxShadow: `0 0 8px ${color}, 0 0 20px ${glow ?? color}`,
    }}
  />
);

const GameControls: React.FC<Props> = ({ socket, gameState, mySeat }) => {
  const [raiseAmount, setRaiseAmount] = useState(20);
  const [showBetPanel, setShowBetPanel] = useState(false);
  const { hapticFeedback } = useTelegram();
  const isMobile = useIsMobile();

  const countdown = useCountdown(gameState.nextHandIn);

  const emitAction = (action: string, ...args: any[]) => {
    if (hapticFeedback) {
      switch (action) {
        case 'fold':
          hapticFeedback.notificationOccurred('error');
          break;
        case 'check':
          hapticFeedback.impactOccurred('light');
          break;
        case 'call':
          hapticFeedback.impactOccurred('medium');
          break;
        case 'raise':
        case 'allIn':
          hapticFeedback.impactOccurred('heavy');
          break;
        default:
          hapticFeedback.impactOccurred('light');
      }
    }

    (socket.emit as any)(action, ...args);
  };

  const myPlayer = mySeat !== null ? gameState.seats[mySeat] : null;
  const isMyTurn = mySeat !== null && gameState.currentPlayer === mySeat;

  const currentBet = gameState.currentBet;
  const myBet = myPlayer?.bet || 0;
  const toCall = currentBet - myBet;
  const myChips = myPlayer?.chips || 0;
  const minRaise = gameState.bigBlind;
  const potSize = gameState.totalPot;

  useEffect(() => {
    if (isMyTurn) {
      setRaiseAmount(Math.max(minRaise, raiseAmount));
      setShowBetPanel(false);
    }
  }, [isMyTurn, minRaise]);

  /* ── Safe-area bottom padding (Android nav bar + iOS home indicator) ── */
  const safeBottom: React.CSSProperties = {
    paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
  };

  /* ═══════════════════════════════════════════
     Status states (waiting / showdown)
     ═══════════════════════════════════════════ */
  if (gameState.stage === 'waiting' || gameState.stage === 'showdown') {
    const activePlayers = gameState.seats.filter(p => p && !p.folded);
    const isWinByFold = gameState.stage === 'showdown' && activePlayers.length === 1;
    const amIWinner = isWinByFold && myPlayer && !myPlayer.folded;
    const eligiblePlayers = gameState.seats.filter(p => p && p.chips > 0 && !p.waitingForBB).length;

    return (
      <div
        className="text-center backdrop-blur-md border-t border-white/5"
        style={{ ...safeBottom, background: 'rgba(10,10,14,0.85)', padding: '14px 16px' }}
      >
        {gameState.stage === 'showdown' && (
          <div
            className="mb-2 font-bold text-base tracking-wide"
            style={{ color: N.raise.color, textShadow: `0 0 12px ${N.raise.glow}` }}
          >
            Hand Complete
          </div>
        )}

        {countdown !== null && countdown > 0 && (
          <div className="mb-2 text-sm" style={{ color: N.check.color, opacity: 0.8 }}>
            Next hand in {countdown}s
          </div>
        )}

        {gameState.stage === 'waiting' && (
          <div className="mb-2 text-sm" style={{ color: '#78909c' }}>
            Waiting for players... ({eligiblePlayers}/2 min)
          </div>
        )}

        {myPlayer?.waitingForBB && (
          <div className="mb-2 text-sm" style={{ color: N.raise.color }}>
            Waiting for Big Blind...
          </div>
        )}

        {amIWinner && !myPlayer?.showCards && (
          <button
            onClick={() => socket.emit("showCards")}
            style={{
              ...neonBtn(N.check, true),
              padding: '12px 32px',
              fontSize: 14,
            }}
          >
            <GlowBar color={N.check.color} glow={N.check.glow} />
            Show Cards
          </button>
        )}
      </div>
    );
  }

  /* ═══════════════════════════════════════════
     Not my turn / folded / all-in
     ═══════════════════════════════════════════ */
  if (!myPlayer || !isMyTurn || myPlayer.folded || myPlayer.allIn) {
    return (
      <div
        className="text-center backdrop-blur-md border-t border-white/5"
        style={{ ...safeBottom, background: 'rgba(10,10,14,0.85)', padding: '14px 16px' }}
      >
        <div className="text-sm" style={{ color: '#546e7a' }}>
          {gameState.currentPlayer !== null
            ? `${gameState.seats[gameState.currentPlayer]?.displayName || gameState.seats[gameState.currentPlayer]?.id.slice(0, 4)} is thinking...`
            : "Waiting..."}
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════
     Bet presets & amount helpers
     ═══════════════════════════════════════════ */
  const applyPreset = (preset: string) => {
    hapticFeedback?.impactOccurred('light');
    switch (preset) {
      case 'min':
        setRaiseAmount(minRaise);
        break;
      case '1/2':
        setRaiseAmount(Math.max(minRaise, Math.floor(potSize * 0.5)));
        break;
      case '3/4':
        setRaiseAmount(Math.max(minRaise, Math.floor(potSize * 0.75)));
        break;
      case 'pot':
        setRaiseAmount(Math.max(minRaise, potSize));
        break;
      case 'allin':
        setRaiseAmount(myChips);
        break;
    }
  };

  const adjustAmount = (delta: number) => {
    hapticFeedback?.impactOccurred('light');
    const step = gameState.bigBlind || 20;
    setRaiseAmount(Math.max(minRaise, raiseAmount + delta * step));
  };

  /* ═══════════════════════════════════════════
     MOBILE — Bet Panel (slide-up)
     ═══════════════════════════════════════════ */
  if (isMobile && showBetPanel) {
    return (
      <div
        className="border-t border-white/5"
        style={{ ...safeBottom, background: 'rgba(10,10,14,0.95)' }}
      >
        {/* Presets */}
        <div className="flex gap-2 px-4 pt-3 pb-2">
          {[
            { label: 'Min', key: 'min' },
            { label: '½', key: '1/2' },
            { label: '¾', key: '3/4' },
            { label: 'Pot', key: 'pot' },
            { label: 'All In', key: 'allin' },
          ].map(({ label, key }) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              className="flex-1 active:scale-95 transition-transform"
              style={{
                ...neonBtn(key === 'allin' ? N.allin : N.preset),
                padding: '10px 0',
                fontSize: 12,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Amount row */}
        <div className="flex items-center gap-3 px-4 pt-1 pb-2">
          {/* Back */}
          <button
            onClick={() => { setShowBetPanel(false); hapticFeedback?.impactOccurred('light'); }}
            className="active:scale-95 transition-transform"
            style={{
              ...neonBtn(N.fold),
              padding: '14px 18px',
              fontSize: 13,
            }}
          >
            <GlowBar color={N.fold.color} glow={N.fold.glow} />
            Back
          </button>

          {/* Confirm raise */}
          <button
            onClick={() => { emitAction("raise", raiseAmount); setShowBetPanel(false); }}
            className="active:scale-95 transition-transform"
            style={{
              ...neonBtn(N.raise, true),
              padding: '14px 22px',
              fontSize: 13,
            }}
          >
            <GlowBar color={N.raise.color} glow={N.raise.glow} />
            {currentBet > 0 ? 'Raise' : 'Bet'}
          </button>

          <div className="flex-1" />

          {/* Minus */}
          <button
            onClick={() => adjustAmount(-1)}
            className="active:scale-95 transition-transform"
            style={{
              ...neonBtn(N.preset),
              width: 44,
              height: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              padding: 0,
            }}
          >
            −
          </button>

          {/* Amount */}
          <div
            className="text-center"
            style={{
              minWidth: 68,
              padding: '6px 10px',
              borderRadius: 10,
              border: `1px solid color-mix(in srgb, ${N.raise.color} 25%, transparent)`,
              background: `color-mix(in srgb, ${N.raise.color} 3%, transparent)`,
            }}
          >
            <div style={{ fontSize: 9, color: '#78909c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Bet
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: N.raise.color, fontVariantNumeric: 'tabular-nums' }}>
              {raiseAmount}
            </div>
          </div>

          {/* Plus */}
          <button
            onClick={() => adjustAmount(1)}
            className="active:scale-95 transition-transform"
            style={{
              ...neonBtn(N.preset),
              width: 44,
              height: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              padding: 0,
            }}
          >
            +
          </button>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════
     MOBILE — Main action bar
     ═══════════════════════════════════════════ */
  if (isMobile) {
    return (
      <div
        className="border-t border-white/5"
        style={{ ...safeBottom, background: 'rgba(10,10,14,0.92)' }}
      >
        {/* Three main buttons */}
        <div className="flex gap-2.5 px-4 pt-3 pb-1.5">
          {/* Fold */}
          <button
            onClick={() => emitAction("fold")}
            className="flex-1 active:scale-95 transition-transform"
            style={{
              ...neonBtn(N.fold),
              height: 56,
              fontSize: 14,
            }}
          >
            <GlowBar color={N.fold.color} glow={N.fold.glow} />
            Fold
          </button>

          {/* Check / Call */}
          <button
            onClick={() => emitAction(toCall === 0 ? "check" : "call")}
            className="flex-[1.3] active:scale-95 transition-transform"
            style={{
              ...neonBtn(N.check, true),
              height: 56,
              fontSize: 14,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
            }}
          >
            <GlowBar color={N.check.color} glow={N.check.glow} />
            <span>{toCall === 0 ? 'Check' : 'Call'}</span>
            {toCall > 0 && (
              <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 600 }}>{toCall}</span>
            )}
          </button>

          {/* Raise */}
          <button
            onClick={() => { setShowBetPanel(true); hapticFeedback?.impactOccurred('light'); }}
            className="flex-1 active:scale-95 transition-transform"
            style={{
              ...neonBtn(N.raise),
              height: 56,
              fontSize: 14,
            }}
          >
            <GlowBar color={N.raise.color} glow={N.raise.glow} />
            {currentBet > 0 ? 'Raise' : 'Bet'}
          </button>
        </div>

        {/* All-In strip */}
        <div className="px-4 pb-1.5">
          <button
            onClick={() => emitAction("allIn")}
            className="w-full active:scale-[0.98] transition-transform"
            style={{
              ...neonBtn(N.allin),
              height: 38,
              fontSize: 12,
              letterSpacing: '0.12em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <GlowBar color={N.allin.color} glow={N.allin.glow} />
            <span>All-In</span>
            <span style={{ opacity: 0.5, fontSize: 11, fontWeight: 600 }}>{myChips}</span>
          </button>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════
     DESKTOP — Full layout
     ═══════════════════════════════════════════ */
  return (
    <div
      className="border-t border-white/5"
      style={{ background: 'rgba(10,10,14,0.90)', padding: '14px 20px 20px' }}
    >
      {/* Raise controls */}
      <div
        className="mb-3 flex items-center gap-3"
        style={{
          padding: '10px 14px',
          borderRadius: 14,
          border: `1px solid color-mix(in srgb, ${N.raise.color} 12%, transparent)`,
          background: `color-mix(in srgb, ${N.raise.color} 2%, transparent)`,
        }}
      >
        {/* Presets */}
        <div className="flex gap-1.5">
          {['Min', '1/2', '3/4', 'POT'].map((label) => (
            <button
              key={label}
              onClick={() => applyPreset(label === 'Min' ? 'min' : label.toLowerCase())}
              className="active:scale-95 transition-transform"
              style={{
                ...neonBtn(N.preset),
                padding: '6px 10px',
                fontSize: 11,
                borderRadius: 8,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          className="active:scale-95 transition-transform"
          onClick={() => adjustAmount(-1)}
          style={{
            ...neonBtn(N.preset),
            width: 40,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            padding: 0,
          }}
        >
          −
        </button>

        <div className="flex-1 text-center">
          <span style={{ display: 'block', fontSize: 10, color: '#78909c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Raise Amount
          </span>
          <span style={{ fontSize: 22, fontWeight: 800, color: N.raise.color, fontVariantNumeric: 'tabular-nums' }}>
            {raiseAmount}
          </span>
        </div>

        <button
          className="active:scale-95 transition-transform"
          onClick={() => adjustAmount(1)}
          style={{
            ...neonBtn(N.preset),
            width: 40,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            padding: 0,
          }}
        >
          +
        </button>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-4 gap-3">
        <button
          onClick={() => emitAction("fold")}
          className="active:scale-95 transition-transform"
          style={{
            ...neonBtn(N.fold),
            padding: '14px 0',
            fontSize: 14,
          }}
        >
          <GlowBar color={N.fold.color} glow={N.fold.glow} />
          Fold
        </button>

        <button
          onClick={() => emitAction(toCall === 0 ? "check" : "call")}
          className="active:scale-95 transition-transform"
          style={{
            ...neonBtn(N.check, true),
            padding: '14px 0',
            fontSize: 14,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
          }}
        >
          <GlowBar color={N.check.color} glow={N.check.glow} />
          <span>{toCall === 0 ? 'Check' : 'Call'}</span>
          {toCall > 0 && <span style={{ fontSize: 11, opacity: 0.7 }}>{toCall}</span>}
        </button>

        <button
          onClick={() => emitAction("raise", raiseAmount)}
          className="active:scale-95 transition-transform"
          style={{
            ...neonBtn(N.raise, true),
            padding: '14px 0',
            fontSize: 14,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
          }}
        >
          <GlowBar color={N.raise.color} glow={N.raise.glow} />
          <span>Raise</span>
          <span style={{ fontSize: 11, opacity: 0.7 }}>{raiseAmount}</span>
        </button>

        <button
          onClick={() => emitAction("allIn")}
          className="active:scale-95 transition-transform"
          style={{
            ...neonBtn(N.allin, true),
            padding: '14px 0',
            fontSize: 14,
          }}
        >
          <GlowBar color={N.allin.color} glow={N.allin.glow} />
          All-In
        </button>
      </div>
    </div>
  );
};

export default GameControls;
