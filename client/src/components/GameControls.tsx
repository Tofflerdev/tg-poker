import React, { useState } from "react";
import { Socket } from "socket.io-client";
import { GameState, ClientEvents, ServerEvents } from "../../../types/index";

interface Props {
  socket: Socket<ServerEvents, ClientEvents>;
  gameState: GameState;
  mySeat: number | null;
}

const GameControls: React.FC<Props> = ({ socket, gameState, mySeat }) => {
  const [raiseAmount, setRaiseAmount] = useState(20); // Дефолтный рейз

  // Находим себя
  const myPlayer = mySeat !== null ? gameState.seats[mySeat] : null;
  const isMyTurn = mySeat !== null && gameState.currentPlayer === mySeat;
  
  // Логика кнопок
  const currentBet = gameState.currentBet;
  const myBet = myPlayer?.bet || 0;
  const toCall = currentBet - myBet;
  
  // Кнопки управления игрой (видны всегда, но лучше скрывать во время раздачи)
  if (gameState.stage === 'waiting' || gameState.stage === 'showdown') {
    const activePlayers = gameState.seats.filter(p => p && !p.folded);
    const isWinByFold = gameState.stage === 'showdown' && activePlayers.length === 1;
    const amIWinner = isWinByFold && myPlayer && !myPlayer.folded;

    return (
      <div style={{ marginBottom: 20, textAlign: "center" }}>
        {gameState.stage === 'showdown' && (
           <div style={{marginBottom: 10, color: '#f0ad4e', fontWeight: 'bold'}}>
             Раздача завершена!
           </div>
        )}
        
        {amIWinner && !myPlayer?.showCards && (
          <button
            onClick={() => socket.emit("showCards")}
            style={{ ...btnStyle, background: "#5bc0de", marginRight: 10 }}
          >
            Показать карты
          </button>
        )}

        <button
          onClick={() => socket.emit("start")}
          style={{ padding: "10px 20px", fontSize: 16, cursor: "pointer", background: "#4CAF50", color: "white", border: "none", borderRadius: 5 }}
        >
          {gameState.stage === 'showdown' ? "Следующая раздача" : "Начать игру"}
        </button>
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
        onClick={() => socket.emit("fold")}
        style={{ ...btnStyle, background: "#d9534f" }}
      >
        Fold
      </button>

      {/* CHECK / CALL */}
      {toCall === 0 ? (
        <button 
          onClick={() => socket.emit("check")}
          style={{ ...btnStyle, background: "#5bc0de" }}
        >
          Check
        </button>
      ) : (
        <button 
          onClick={() => socket.emit("call")}
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
          onClick={() => socket.emit("raise", raiseAmount)}
          style={{ ...btnStyle, background: "#f0ad4e", color: "black" }}
        >
          Raise
        </button>
      </div>

      {/* ALL IN */}
      <button
        onClick={() => socket.emit("allIn")}
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