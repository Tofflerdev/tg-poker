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

/* ── Neon color tokens ── */
const NEON = {
  fold:    { color: '#ff4757', glow: 'rgba(255,71,87,0.35)' },
  check:   { color: '#00e5ff', glow: 'rgba(0,229,255,0.30)' },
  call:    { color: '#00e5ff', glow: 'rgba(0,229,255,0.30)' },
  raise:   { color: '#ffab00', glow: 'rgba(255,171,0,0.35)' },
  allin:   { color: '#ff6d00', glow: 'rgba(255,109,0,0.40)' },
  preset:  { color: '#b0bec5', glow: 'rgba(176,190,197,0.15)' },
} as const;

/* ── Shared button base (neon strip style) ── */
const neonBtn = (
  n: typeof NEON[keyof typeof NEON],
  active = false,
): React.CSSProperties => ({
  background: active
    ? `linear-gradient(180deg, ${n.color}18 0%, ${n.color}08 100%)`
    : 'transparent',
  border: `1.5px solid ${n.color}60`,
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
const GlowBar: React.FC<{ color: string }> = ({ color }) => (
  <span
    style={{
      position: 'absolute',
      bottom: 0,
      left: '15%',
      right: '15%',
      height: 2,
      borderRadius: 2,
      background: color,
      boxShadow: `0 0 8px ${color}, 0 0 20px ${color}50`,
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
  const minRaise = currentBet > 0 ? currentBet * 2 : gameState.bigBlind * 2;
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
            style={{ color: NEON.raise.color, textShadow: `0 0 12px ${NEON.raise.glow}` }}
          >
            Hand Complete
          </div>
        )}

        {countdown !== null && countdown > 0 && (
          <div className="mb-2 text-sm" style={{ color: NEON.check.color, opacity: 0.8 }}>
            Next hand in {countdown}s
          </div>
        )}

        {gameState.stage === 'waiting' && (
          <div className="mb-2 text-sm" style={{ color: '#78909c' }}>
            Waiting for players... ({eligiblePlayers}/2 min)
          </div>
        )}

        {myPlayer?.waitingForBB && (
          <div className="mb-2 text-sm" style={{ color: NEON.raise.color }}>
            Waiting for Big Blind...
          </div>
        )}

        {amIWinner && !myPlayer?.showCards && (
          <button
            onClick={() => socket.emit("showCards")}
            style={{
              ...neonBtn(NEON.check, true),
              padding: '12px 32px',
              fontSize: 14,
            }}
          >
            <GlowBar color={NEON.check.color} />
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
                ...neonBtn(key === 'allin' ? NEON.allin : NEON.preset),
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
              ...neonBtn(NEON.fold),
              padding: '14px 18px',
              fontSize: 13,
            }}
          >
            <GlowBar color={NEON.fold.color} />
            Back
          </button>

          {/* Confirm raise */}
          <button
            onClick={() => { emitAction("raise", raiseAmount); setShowBetPanel(false); }}
            className="active:scale-95 transition-transform"
            style={{
              ...neonBtn(NEON.raise, true),
              padding: '14px 22px',
              fontSize: 13,
            }}
          >
            <GlowBar color={NEON.raise.color} />
            {currentBet > 0 ? 'Raise' : 'Bet'}
          </button>

          <div className="flex-1" />

          {/* Minus */}
          <button
            onClick={() => adjustAmount(-1)}
            className="active:scale-95 transition-transform"
            style={{
              ...neonBtn(NEON.preset),
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
              border: `1px solid ${NEON.raise.color}40`,
              background: `${NEON.raise.color}08`,
            }}
          >
            <div style={{ fontSize: 9, color: '#78909c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Bet
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: NEON.raise.color, fontVariantNumeric: 'tabular-nums' }}>
              {raiseAmount}
            </div>
          </div>

          {/* Plus */}
          <button
            onClick={() => adjustAmount(1)}
            className="active:scale-95 transition-transform"
            style={{
              ...neonBtn(NEON.preset),
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
              ...neonBtn(NEON.fold),
              height: 56,
              fontSize: 14,
            }}
          >
            <GlowBar color={NEON.fold.color} />
            Fold
          </button>

          {/* Check / Call */}
          <button
            onClick={() => emitAction(toCall === 0 ? "check" : "call")}
            className="flex-[1.3] active:scale-95 transition-transform"
            style={{
              ...neonBtn(NEON.check, true),
              height: 56,
              fontSize: 14,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
            }}
          >
            <GlowBar color={NEON.check.color} />
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
              ...neonBtn(NEON.raise),
              height: 56,
              fontSize: 14,
            }}
          >
            <GlowBar color={NEON.raise.color} />
            {currentBet > 0 ? 'Raise' : 'Bet'}
          </button>
        </div>

        {/* All-In strip */}
        <div className="px-4 pb-1.5">
          <button
            onClick={() => emitAction("allIn")}
            className="w-full active:scale-[0.98] transition-transform"
            style={{
              ...neonBtn(NEON.allin),
              height: 38,
              fontSize: 12,
              letterSpacing: '0.12em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <GlowBar color={NEON.allin.color} />
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
          border: `1px solid ${NEON.raise.color}20`,
          background: `${NEON.raise.color}06`,
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
                ...neonBtn(NEON.preset),
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
            ...neonBtn(NEON.preset),
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
          <span style={{ fontSize: 22, fontWeight: 800, color: NEON.raise.color, fontVariantNumeric: 'tabular-nums' }}>
            {raiseAmount}
          </span>
        </div>

        <button
          className="active:scale-95 transition-transform"
          onClick={() => adjustAmount(1)}
          style={{
            ...neonBtn(NEON.preset),
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
            ...neonBtn(NEON.fold),
            padding: '14px 0',
            fontSize: 14,
          }}
        >
          <GlowBar color={NEON.fold.color} />
          Fold
        </button>

        <button
          onClick={() => emitAction(toCall === 0 ? "check" : "call")}
          className="active:scale-95 transition-transform"
          style={{
            ...neonBtn(NEON.check, true),
            padding: '14px 0',
            fontSize: 14,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
          }}
        >
          <GlowBar color={NEON.check.color} />
          <span>{toCall === 0 ? 'Check' : 'Call'}</span>
          {toCall > 0 && <span style={{ fontSize: 11, opacity: 0.7 }}>{toCall}</span>}
        </button>

        <button
          onClick={() => emitAction("raise", raiseAmount)}
          className="active:scale-95 transition-transform"
          style={{
            ...neonBtn(NEON.raise, true),
            padding: '14px 0',
            fontSize: 14,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
          }}
        >
          <GlowBar color={NEON.raise.color} />
          <span>Raise</span>
          <span style={{ fontSize: 11, opacity: 0.7 }}>{raiseAmount}</span>
        </button>

        <button
          onClick={() => emitAction("allIn")}
          className="active:scale-95 transition-transform"
          style={{
            ...neonBtn(NEON.allin, true),
            padding: '14px 0',
            fontSize: 14,
          }}
        >
          <GlowBar color={NEON.allin.color} />
          All-In
        </button>
      </div>
    </div>
  );
};

export default GameControls;
