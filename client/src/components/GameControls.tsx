import React, { useState, useEffect } from "react";
import { Socket } from "socket.io-client";
import { GameState, ExtendedClientEvents, ExtendedServerEvents } from "../../../types/index";
import { useTelegram } from "../hooks/useTelegram";

interface Props {
  socket: Socket<ExtendedServerEvents, ExtendedClientEvents>;
  gameState: GameState;
  mySeat: number | null;
}

// Hook for countdown timer
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
  const { hapticFeedback } = useTelegram();

  // Countdown for next hand
  const countdown = useCountdown(gameState.nextHandIn);

  // Helper function for actions with haptic feedback
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
  const minRaise = currentBet > 0 ? currentBet * 2 : 20; // Simplified min raise logic

  // Update raise amount when it's my turn
  useEffect(() => {
    if (isMyTurn) {
      setRaiseAmount(Math.max(minRaise, raiseAmount));
    }
  }, [isMyTurn, minRaise]);

  // Status messages
  if (gameState.stage === 'waiting' || gameState.stage === 'showdown') {
    const activePlayers = gameState.seats.filter(p => p && !p.folded);
    const isWinByFold = gameState.stage === 'showdown' && activePlayers.length === 1;
    const amIWinner = isWinByFold && myPlayer && !myPlayer.folded;
    const eligiblePlayers = gameState.seats.filter(p => p && p.chips > 0 && !p.waitingForBB).length;

    return (
      <div className="p-4 text-center bg-black/40 backdrop-blur-md border-t border-white/10">
        {gameState.stage === 'showdown' && (
          <div className="mb-2 text-yellow-400 font-bold text-lg animate-pulse">
            Hand Completed!
          </div>
        )}

        {countdown !== null && countdown > 0 && (
          <div className="mb-2 text-blue-300 font-medium">
            Next hand in {countdown}s...
          </div>
        )}

        {gameState.stage === 'waiting' && (
          <div className="mb-2 text-gray-400">
            Waiting for players... ({eligiblePlayers}/2 min)
          </div>
        )}

        {myPlayer?.waitingForBB && (
          <div className="mb-2 text-orange-400">
            Waiting for Big Blind...
          </div>
        )}
        
        {amIWinner && !myPlayer?.showCards && (
          <button
            onClick={() => socket.emit("showCards")}
            className="px-6 py-3 bg-blue-500 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-transform"
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
      <div className="p-4 text-center bg-black/40 backdrop-blur-md border-t border-white/10">
        <div className="text-gray-400 font-medium">
          {gameState.currentPlayer !== null 
            ? `Player ${gameState.seats[gameState.currentPlayer]?.id.slice(0, 4)} is thinking...` 
            : "Waiting..."}
        </div>
      </div>
    );
  }

  // My Turn Controls
  return (
    <div className="p-4 bg-[#1c1c1e] border-t border-white/10 pb-8">
      {/* Raise Slider/Input Area */}
      <div className="mb-4 flex items-center gap-3 bg-[#2c2c2e] p-2 rounded-xl">
        <button 
          className="w-10 h-10 flex items-center justify-center bg-[#3a3a3c] rounded-lg text-white font-bold active:bg-[#48484a]"
          onClick={() => setRaiseAmount(Math.max(minRaise, raiseAmount - 20))}
        >
          -
        </button>
        <div className="flex-1 text-center">
          <span className="text-xs text-gray-400 block">Raise Amount</span>
          <span className="text-xl font-bold text-white">{raiseAmount}</span>
        </div>
        <button 
          className="w-10 h-10 flex items-center justify-center bg-[#3a3a3c] rounded-lg text-white font-bold active:bg-[#48484a]"
          onClick={() => setRaiseAmount(raiseAmount + 20)}
        >
          +
        </button>
      </div>

      {/* Action Buttons Grid */}
      <div className="grid grid-cols-4 gap-3">
        {/* Fold */}
        <button
          onClick={() => emitAction("fold")}
          className="col-span-1 py-3 bg-red-500/20 text-red-500 border border-red-500/50 rounded-xl font-bold active:bg-red-500/30 transition-colors flex flex-col items-center justify-center"
        >
          <span className="text-sm">Fold</span>
        </button>

        {/* Check / Call */}
        <button
          onClick={() => emitAction(toCall === 0 ? "check" : "call")}
          className="col-span-1 py-3 bg-blue-500/20 text-blue-400 border border-blue-500/50 rounded-xl font-bold active:bg-blue-500/30 transition-colors flex flex-col items-center justify-center"
        >
          <span className="text-sm">{toCall === 0 ? "Check" : "Call"}</span>
          {toCall > 0 && <span className="text-xs opacity-80">{toCall}</span>}
        </button>

        {/* Raise */}
        <button
          onClick={() => emitAction("raise", raiseAmount)}
          className="col-span-1 py-3 bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 rounded-xl font-bold active:bg-yellow-500/30 transition-colors flex flex-col items-center justify-center"
        >
          <span className="text-sm">Raise</span>
          <span className="text-xs opacity-80">{raiseAmount}</span>
        </button>

        {/* All-In */}
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
