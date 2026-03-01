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
  const [raiseAmount, setRaiseAmount] = useState(20); // Дефолтный рейз
  const { hapticFeedback } = useTelegram();

  // Countdown for next hand
  const countdown = useCountdown(gameState.nextHandIn);

  // Helper function for actions with haptic feedback
  const emitAction = (action: string, ...args: any[]) => {
    // Provide haptic feedback based on action type
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

  // Находим себя
  const myPlayer = mySeat !== null ? gameState.seats[mySeat] : null;
  const isMyTurn = mySeat !== null && gameState.currentPlayer === mySeat;
  
  // Логика кнопок
  const currentBet = gameState.currentBet;
  const myBet = myPlayer?.bet || 0;
  const toCall = currentBet - myBet;

  // Статус ожидания для waiting/showdown
  if (gameState.stage === 'waiting' || gameState.stage === 'showdown') {
    const activePlayers = gameState.seats.filter(p => p && !p.folded);
    const isWinByFold = gameState.stage === 'showdown' && activePlayers.length === 1;
    const amIWinner = isWinByFold && myPlayer && !myPlayer.folded;
    const eligiblePlayers = gameState.seats.filter(p => p && p.chips > 0 && !p.waitingForBB).length;

    return (
      <div style={{ marginBottom: 20, textAlign: "center" }}>
        {/* Showdown completed message */}
        {gameState.stage === 'showdown' && (
          <div style={{marginBottom: 10, color: '#f0ad4e', fontWeight: 'bold'}}>
            Раздача завершена!
          </div>
        )}

        {/* Countdown for next hand */}
        {countdown !== null && countdown > 0 && (
          <div style={{marginBottom: 10, color: '#5bc0de', fontSize: 14}}>
            Следующая раздача через {countdown} сек...
          </div>
        )}

        {/* Waiting for players */}
        {gameState.stage === 'waiting' && (
          <div style={{marginBottom: 10, color: '#888', fontSize: 14}}>
            Ожидание игроков... ({eligiblePlayers}/2 минимум)
          </div>
        )}

        {/* Waiting for BB message */}
        {myPlayer?.waitingForBB && (
          <div style={{marginBottom: 10, color: '#f0ad4e', fontSize: 14}}>
            Ожидание большого блайнда...
          </div>
        )}
        
        {/* Show cards button for winner */}
        {amIWinner && !myPlayer?.showCards && (
          <button
            onClick={() => socket.emit("showCards")}
            style={{ ...btnStyle, background: "#5bc0de", marginRight: 10 }}
          >
            Показать карты
          </button>
        )}

      </div>
    );
  }

  // Если не мой ход или я в All-In/Fold
  if (!myPlayer || !isMyTurn || myPlayer.folded || myPlayer.allIn) {
    return (
      <div style={{ marginBottom: 20, height: 50, textAlign: "center", color: "#888" }}>
        {gameState.currentPlayer !== null 
          ? `Ходит игрок ${gameState.seats[gameState.currentPlayer]?.id.slice(0, 4)}...` 
          : "Ожидание..."}
      </div>
    );
  }

  return (
    <div style={{ 
      marginBottom: 20, 
      padding: 15, 
      background: "#333", 
      borderRadius: 10,
      display: "flex", 
      justifyContent: "center", 
      gap: 10,
      boxShadow: "0 4px 6px rgba(0,0,0,0.3)"
    }}>
      {/* FOLD */}
      <button
        onClick={() => emitAction("fold")}
        style={{ ...btnStyle, background: "#d9534f" }}
      >
        Fold
      </button>

      {/* CHECK / CALL */}
      {toCall === 0 ? (
        <button
          onClick={() => emitAction("check")}
          style={{ ...btnStyle, background: "#5bc0de" }}
        >
          Check
        </button>
      ) : (
        <button
          onClick={() => emitAction("call")}
          style={{ ...btnStyle, background: "#5bc0de" }}
        >
          Call ({toCall})
        </button>
      )}

      {/* RAISE */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, background: "#444", padding: 5, borderRadius: 5 }}>
        <input
          type="number"
          value={raiseAmount}
          onChange={(e) => setRaiseAmount(Number(e.target.value))}
          style={{ width: 60, padding: 5, borderRadius: 3, border: "none" }}
        />
        <button
          onClick={() => emitAction("raise", raiseAmount)}
          style={{ ...btnStyle, background: "#f0ad4e", color: "black" }}
        >
          Raise
        </button>
      </div>

      {/* ALL IN */}
      <button
        onClick={() => emitAction("allIn")}
        style={{ ...btnStyle, background: "#c0392b" }}
      >
        All-In
      </button>
    </div>
  );
};

const btnStyle = {
  padding: "10px 20px",
  fontSize: "16px",
  cursor: "pointer",
  color: "white",
  border: "none",
  borderRadius: "5px",
  fontWeight: "bold" as const
};

export default GameControls;
