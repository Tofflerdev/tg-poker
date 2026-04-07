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

  // Update raise amount when it's my turn
  useEffect(() => {
    if (isMyTurn) {
      setRaiseAmount(Math.max(minRaise, raiseAmount));
      setShowBetPanel(false);
    }
  }, [isMyTurn, minRaise]);

  // Status messages (waiting / showdown)
  if (gameState.stage === 'waiting' || gameState.stage === 'showdown') {
    const activePlayers = gameState.seats.filter(p => p && !p.folded);
    const isWinByFold = gameState.stage === 'showdown' && activePlayers.length === 1;
    const amIWinner = isWinByFold && myPlayer && !myPlayer.folded;
    const eligiblePlayers = gameState.seats.filter(p => p && p.chips > 0 && !p.waitingForBB).length;

    return (
      <div className="p-3 pb-10 md:p-4 md:pb-4 text-center bg-black/40 backdrop-blur-md border-t border-white/10">
        {gameState.stage === 'showdown' && (
          <div className="mb-2 text-yellow-400 font-bold text-base md:text-lg animate-pulse">
            Hand Completed!
          </div>
        )}

        {countdown !== null && countdown > 0 && (
          <div className="mb-2 text-blue-300 font-medium text-sm">
            Next hand in {countdown}s...
          </div>
        )}

        {gameState.stage === 'waiting' && (
          <div className="mb-2 text-gray-400 text-sm">
            Waiting for players... ({eligiblePlayers}/2 min)
          </div>
        )}

        {myPlayer?.waitingForBB && (
          <div className="mb-2 text-orange-400 text-sm">
            Waiting for Big Blind...
          </div>
        )}

        {amIWinner && !myPlayer?.showCards && (
          <button
            onClick={() => socket.emit("showCards")}
            className="px-6 py-2.5 bg-blue-500 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-transform"
          >
            Show Cards
          </button>
        )}
      </div>
    );
  }

  // Not my turn or folded/all-in
  if (!myPlayer || !isMyTurn || myPlayer.folded || myPlayer.allIn) {
    return (
      <div className="p-3 pb-10 md:p-4 md:pb-4 text-center bg-black/40 backdrop-blur-md border-t border-white/10">
        <div className="text-gray-400 font-medium text-sm">
          {gameState.currentPlayer !== null
            ? `Player ${gameState.seats[gameState.currentPlayer]?.displayName || gameState.seats[gameState.currentPlayer]?.id.slice(0, 4)} is thinking...`
            : "Waiting..."}
        </div>
      </div>
    );
  }

  // === My Turn Controls ===

  // Bet preset handler
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

  // Mobile bet panel (second screenshot style)
  if (isMobile && showBetPanel) {
    return (
      <div className="bg-[#1c1c1e] border-t border-white/10 pb-12">
        {/* Presets row */}
        <div className="flex gap-1.5 px-3 pt-3 pb-2">
          {['Min', '1/2', '3/4', 'POT', 'All In'].map((label) => (
            <button
              key={label}
              onClick={() => applyPreset(label === 'All In' ? 'allin' : label === 'Min' ? 'min' : label.toLowerCase())}
              className="flex-1 py-2.5 bg-[#2c2c2e] text-white text-xs font-bold rounded-lg border border-white/10 active:bg-[#3a3a3c] transition-colors"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Amount + action row */}
        <div className="flex items-center gap-2 px-3 pb-1">
          {/* BACK button */}
          <button
            onClick={() => { setShowBetPanel(false); hapticFeedback?.impactOccurred('light'); }}
            className="py-3 px-5 bg-transparent text-red-500 border border-red-500/50 rounded-xl font-bold text-sm active:bg-red-500/10 transition-colors"
          >
            BACK
          </button>

          {/* BET button */}
          <button
            onClick={() => { emitAction("raise", raiseAmount); setShowBetPanel(false); }}
            className="py-3 px-6 bg-gradient-to-b from-yellow-400 to-yellow-600 text-black rounded-xl font-bold text-sm shadow-lg active:scale-95 transition-transform"
          >
            BET
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Minus */}
          <button
            onClick={() => adjustAmount(-1)}
            className="w-11 h-11 flex items-center justify-center bg-[#2c2c2e] rounded-lg text-white text-lg font-bold border border-white/10 active:bg-[#3a3a3c]"
          >
            −
          </button>

          {/* Amount display */}
          <div className="bg-[#2c2c2e] border border-white/10 rounded-lg px-3 py-2 min-w-[70px] text-center">
            <div className="text-[9px] text-gray-400 uppercase">Bet:</div>
            <div className="text-white font-bold text-sm">{raiseAmount}</div>
          </div>

          {/* Plus */}
          <button
            onClick={() => adjustAmount(1)}
            className="w-11 h-11 flex items-center justify-center bg-[#2c2c2e] rounded-lg text-white text-lg font-bold border border-white/10 active:bg-[#3a3a3c]"
          >
            +
          </button>
        </div>
      </div>
    );
  }

  // Mobile: main action bar (screenshot style)
  if (isMobile) {
    return (
      <div className="bg-[#1c1c1e] border-t border-white/10 px-3 pt-3 pb-12">
        <div className="flex gap-2">
          {/* Fold */}
          <button
            onClick={() => emitAction("fold")}
            className="flex-1 py-3.5 bg-transparent text-red-500 border border-red-500/50 rounded-xl font-bold text-sm active:bg-red-500/10 transition-colors"
          >
            Fold
          </button>

          {/* Call / Check */}
          <button
            onClick={() => emitAction(toCall === 0 ? "check" : "call")}
            className="flex-1 py-3.5 bg-[#2c2c2e] text-white rounded-xl font-bold text-sm active:bg-[#3a3a3c] transition-colors"
          >
            {toCall === 0 ? "Check" : `Call ${toCall}`}
          </button>

          {/* Bet / Raise */}
          <button
            onClick={() => { setShowBetPanel(true); hapticFeedback?.impactOccurred('light'); }}
            className="flex-1 py-3.5 bg-[#2c2c2e] text-white rounded-xl font-bold text-sm active:bg-[#3a3a3c] transition-colors"
          >
            {currentBet > 0 ? "Raise" : "Bet"}
          </button>

          {/* All-In */}
          <button
            onClick={() => emitAction("allIn")}
            className="flex-1 py-3.5 bg-[#2c2c2e] text-yellow-400 rounded-xl font-bold text-sm active:bg-[#3a3a3c] transition-colors"
          >
            All In
          </button>
        </div>
      </div>
    );
  }

  // Desktop: existing layout with slider
  return (
    <div className="p-4 bg-[#1c1c1e] border-t border-white/10 pb-8">
      {/* Raise controls */}
      <div className="mb-4 flex items-center gap-3 bg-[#2c2c2e] p-2 rounded-xl">
        {/* Presets */}
        <div className="flex gap-1">
          {['Min', '1/2', '3/4', 'POT'].map((label) => (
            <button
              key={label}
              onClick={() => applyPreset(label === 'Min' ? 'min' : label.toLowerCase())}
              className="px-2 py-1 bg-[#3a3a3c] text-white text-[10px] font-bold rounded active:bg-[#48484a]"
            >
              {label}
            </button>
          ))}
        </div>

        <button
          className="w-10 h-10 flex items-center justify-center bg-[#3a3a3c] rounded-lg text-white font-bold active:bg-[#48484a]"
          onClick={() => adjustAmount(-1)}
        >
          -
        </button>
        <div className="flex-1 text-center">
          <span className="text-xs text-gray-400 block">Raise Amount</span>
          <span className="text-xl font-bold text-white">{raiseAmount}</span>
        </div>
        <button
          className="w-10 h-10 flex items-center justify-center bg-[#3a3a3c] rounded-lg text-white font-bold active:bg-[#48484a]"
          onClick={() => adjustAmount(1)}
        >
          +
        </button>
      </div>

      {/* Action Buttons Grid */}
      <div className="grid grid-cols-4 gap-3">
        <button
          onClick={() => emitAction("fold")}
          className="col-span-1 py-3 bg-red-500/20 text-red-500 border border-red-500/50 rounded-xl font-bold active:bg-red-500/30 transition-colors flex flex-col items-center justify-center"
        >
          <span className="text-sm">Fold</span>
        </button>

        <button
          onClick={() => emitAction(toCall === 0 ? "check" : "call")}
          className="col-span-1 py-3 bg-blue-500/20 text-blue-400 border border-blue-500/50 rounded-xl font-bold active:bg-blue-500/30 transition-colors flex flex-col items-center justify-center"
        >
          <span className="text-sm">{toCall === 0 ? "Check" : "Call"}</span>
          {toCall > 0 && <span className="text-xs opacity-80">{toCall}</span>}
        </button>

        <button
          onClick={() => emitAction("raise", raiseAmount)}
          className="col-span-1 py-3 bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 rounded-xl font-bold active:bg-yellow-500/30 transition-colors flex flex-col items-center justify-center"
        >
          <span className="text-sm">Raise</span>
          <span className="text-xs opacity-80">{raiseAmount}</span>
        </button>

        <button
          onClick={() => emitAction("allIn")}
          className="col-span-1 py-3 bg-red-600 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-transform flex flex-col items-center justify-center"
        >
          <span className="text-sm">All-In</span>
        </button>
      </div>
    </div>
  );
};

export default GameControls;
