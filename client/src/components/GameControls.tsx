import React, { useState, useEffect } from "react";
import { Socket } from "socket.io-client";
import { GameState, ExtendedClientEvents, ExtendedServerEvents } from "../../../types/index";
import { useTelegram } from "../hooks/useTelegram";
import { useIsMobile } from "../hooks/useIsMobile";
import { Button } from "./ui";

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

/* ── Neon token CSS custom properties used for non-button visuals
   (text colors, status strings, raise-amount display border).
   Button component owns variant→token resolution for all actual buttons. ── */
const TOKEN = {
  call:  { color: 'var(--color-action-call)',  glow: 'var(--glow-call)' },
  raise: { color: 'var(--color-action-raise)', glow: 'var(--glow-raise)' },
} as const;

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
    const eligiblePlayers = gameState.seats.filter(p => p && p.chips > 0).length;

    return (
      <div
        className="text-center backdrop-blur-md border-t border-white/5"
        style={{ ...safeBottom, background: 'rgba(10,10,14,0.85)', padding: '14px 16px' }}
      >
        {gameState.stage === 'showdown' && (
          <div
            className="mb-2 font-bold text-base tracking-wide"
            style={{ color: TOKEN.raise.color, textShadow: `0 0 12px ${TOKEN.raise.glow}` }}
          >
            Hand Complete
          </div>
        )}

        {countdown !== null && countdown > 0 && (
          <div className="mb-2 text-sm" style={{ color: TOKEN.call.color, opacity: 0.8 }}>
            Next hand in {countdown}s
          </div>
        )}

        {gameState.stage === 'waiting' && (
          <div className="mb-2 text-sm" style={{ color: '#78909c' }}>
            Waiting for players... ({eligiblePlayers}/2 min)
          </div>
        )}

        {myPlayer?.owesBlind && (
          <div className="mb-2 text-sm" style={{ color: TOKEN.raise.color }}>
            Posting a blind next hand
          </div>
        )}

        {amIWinner && !myPlayer?.showCards && (
          <Button
            variant="call"
            emphasis
            onClick={() => socket.emit("showCards")}
            style={{ padding: '12px 32px', fontSize: 14 }}
          >
            Show Cards
          </Button>
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
            <Button
              key={key}
              variant={key === 'allin' ? 'allin' : 'neutral'}
              onClick={() => applyPreset(key)}
              className="flex-1"
              style={{ padding: '10px 0', fontSize: 12, minHeight: 0 }}
            >
              {label}
            </Button>
          ))}
        </div>

        {/* Amount row */}
        <div className="flex items-center gap-3 px-4 pt-1 pb-2">
          {/* Back */}
          <Button
            variant="fold"
            onClick={() => { setShowBetPanel(false); hapticFeedback?.impactOccurred('light'); }}
            style={{ padding: '14px 18px', fontSize: 13, minHeight: 0 }}
          >
            Back
          </Button>

          {/* Confirm raise */}
          <Button
            variant="raise"
            emphasis
            onClick={() => { emitAction("raise", raiseAmount); setShowBetPanel(false); }}
            style={{ padding: '14px 22px', fontSize: 13, minHeight: 0 }}
          >
            {currentBet > 0 ? 'Raise' : 'Bet'}
          </Button>

          <div className="flex-1" />

          {/* Minus */}
          <Button
            variant="neutral"
            onClick={() => adjustAmount(-1)}
            style={{
              width: 44,
              height: 44,
              minHeight: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              padding: 0,
            }}
          >
            −
          </Button>

          {/* Amount */}
          <div
            className="text-center"
            style={{
              minWidth: 68,
              padding: '6px 10px',
              borderRadius: 10,
              border: `1px solid color-mix(in srgb, ${TOKEN.raise.color} 25%, transparent)`,
              background: `color-mix(in srgb, ${TOKEN.raise.color} 3%, transparent)`,
            }}
          >
            <div style={{ fontSize: 9, color: '#78909c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Bet
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: TOKEN.raise.color, fontVariantNumeric: 'tabular-nums' }}>
              {raiseAmount}
            </div>
          </div>

          {/* Plus */}
          <Button
            variant="neutral"
            onClick={() => adjustAmount(1)}
            style={{
              width: 44,
              height: 44,
              minHeight: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              padding: 0,
            }}
          >
            +
          </Button>
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
          <Button
            variant="fold"
            onClick={() => emitAction("fold")}
            className="flex-1"
            style={{ height: 56, minHeight: 0, fontSize: 14 }}
          >
            Fold
          </Button>

          {/* Check / Call */}
          <Button
            variant="call"
            emphasis
            onClick={() => emitAction(toCall === 0 ? "check" : "call")}
            className="flex-[1.3]"
            style={{
              height: 56,
              minHeight: 0,
              fontSize: 14,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
            }}
          >
            <span>{toCall === 0 ? 'Check' : 'Call'}</span>
            {toCall > 0 && (
              <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 600 }}>{toCall}</span>
            )}
          </Button>

          {/* Raise */}
          <Button
            variant="raise"
            onClick={() => { setShowBetPanel(true); hapticFeedback?.impactOccurred('light'); }}
            className="flex-1"
            style={{ height: 56, minHeight: 0, fontSize: 14 }}
          >
            {currentBet > 0 ? 'Raise' : 'Bet'}
          </Button>
        </div>

        {/* All-In strip */}
        <div className="px-4 pb-1.5">
          <Button
            variant="allin"
            fullWidth
            onClick={() => emitAction("allIn")}
            style={{
              height: 38,
              minHeight: 0,
              fontSize: 12,
              letterSpacing: '0.12em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <span>All-In</span>
            <span style={{ opacity: 0.5, fontSize: 11, fontWeight: 600 }}>{myChips}</span>
          </Button>
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
          border: `1px solid color-mix(in srgb, ${TOKEN.raise.color} 12%, transparent)`,
          background: `color-mix(in srgb, ${TOKEN.raise.color} 2%, transparent)`,
        }}
      >
        {/* Presets */}
        <div className="flex gap-1.5">
          {['Min', '1/2', '3/4', 'POT'].map((label) => (
            <Button
              key={label}
              variant="neutral"
              onClick={() => applyPreset(label === 'Min' ? 'min' : label.toLowerCase())}
              style={{
                padding: '6px 10px',
                fontSize: 11,
                borderRadius: 8,
                minHeight: 0,
              }}
            >
              {label}
            </Button>
          ))}
        </div>

        <Button
          variant="neutral"
          onClick={() => adjustAmount(-1)}
          style={{
            width: 40,
            height: 40,
            minHeight: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            padding: 0,
          }}
        >
          −
        </Button>

        <div className="flex-1 text-center">
          <span style={{ display: 'block', fontSize: 10, color: '#78909c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Raise Amount
          </span>
          <span style={{ fontSize: 22, fontWeight: 800, color: TOKEN.raise.color, fontVariantNumeric: 'tabular-nums' }}>
            {raiseAmount}
          </span>
        </div>

        <Button
          variant="neutral"
          onClick={() => adjustAmount(1)}
          style={{
            width: 40,
            height: 40,
            minHeight: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            padding: 0,
          }}
        >
          +
        </Button>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-4 gap-3">
        <Button
          variant="fold"
          onClick={() => emitAction("fold")}
          style={{ padding: '14px 0', fontSize: 14, minHeight: 0 }}
        >
          Fold
        </Button>

        <Button
          variant="call"
          emphasis
          onClick={() => emitAction(toCall === 0 ? "check" : "call")}
          style={{
            padding: '14px 0',
            fontSize: 14,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
          }}
        >
          <span>{toCall === 0 ? 'Check' : 'Call'}</span>
          {toCall > 0 && <span style={{ fontSize: 11, opacity: 0.7 }}>{toCall}</span>}
        </Button>

        <Button
          variant="raise"
          emphasis
          onClick={() => emitAction("raise", raiseAmount)}
          style={{
            padding: '14px 0',
            fontSize: 14,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
          }}
        >
          <span>Raise</span>
          <span style={{ fontSize: 11, opacity: 0.7 }}>{raiseAmount}</span>
        </Button>

        <Button
          variant="allin"
          emphasis
          onClick={() => emitAction("allIn")}
          style={{ padding: '14px 0', fontSize: 14, minHeight: 0 }}
        >
          All-In
        </Button>
      </div>
    </div>
  );
};

export default GameControls;
