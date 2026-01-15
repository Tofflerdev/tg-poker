import React, { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import GameControls from "./components/GameControls";
import Table from "./components/Table";
// 👇 IMPORT ИЗ ОБЩИХ ТИПОВ (без .js для Vite/Webpack)
import { GameState, ShowdownResult, ClientEvents, ServerEvents } from "../../types/index";

// Типизация сокета
const socket: Socket<ServerEvents, ClientEvents> = io("http://localhost:3000");

const App: React.FC = () => {
  const [state, setState] = useState<GameState>({
    seats: Array(6).fill(null),
    spectators: [],
    communityCards: [],
    pots: [],
    totalPot: 0,
    currentBet: 0,
    currentPlayer: null,
    dealerPosition: 0,
    smallBlind: 0,
    bigBlind: 0,
    stage: 'waiting',
    turnExpiresAt: null
  });
  
  const [showdown, setShowdown] = useState<ShowdownResult | null>(null);
  const [mySeat, setMySeat] = useState<number | null>(null);

  useEffect(() => {
    socket.on("state", (gameState) => {
      setState(gameState);
      if (gameState.stage !== 'showdown') {
        setShowdown(null);
      }

      // Если меня нет в списке игроков, сбрасываем mySeat
      const meInSeats = gameState.seats.findIndex(p => p && p.id === socket.id);
      if (meInSeats === -1) {
        setMySeat(null);
      } else {
        setMySeat(meInSeats);
      }
    });

    socket.on("showdown", (result) => setShowdown(result));
    socket.on("errorMessage", (msg) => alert(msg));

    socket.emit("getState");

    return () => {
      socket.off("state");
      socket.off("showdown");
      socket.off("errorMessage");
    };
  }, []);

  const handleSit = (seat: number) => {
    socket.emit("join", seat);
    setMySeat(seat);
  };

  return (
    <div
      style={{
        padding: 20,
        fontFamily: "sans-serif",
        color: "#f1f1f1",
        background: "#2e2e2e",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ textAlign: "center" }}>♠️ Poker MVP React</h1>
      
      {/* Отображаем стадию */}
      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <div>Stage: {state.stage}</div>
      </div>

      <GameControls
        socket={socket}
        gameState={state}
        mySeat={mySeat}
      />

      <Table
        seats={state.seats}
        spectators={state.spectators}
        mySeat={mySeat}
        communityCards={state.communityCards}
        currentPlayer={state.currentPlayer}
        turnExpiresAt={state.turnExpiresAt}
        pots={state.pots}
        totalPot={state.totalPot}
        onSit={handleSit}
      />

      <h2>Showdown</h2>
      <pre>{showdown ? JSON.stringify(showdown, null, 2) : "—"}</pre>

            {/* --- Debug Reset Button --- */}
      <button
        onClick={() => {
          if (confirm("Вы уверены? Это сбросит текущую раздачу.")) {
            socket.emit("reset");
          }
        }}
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          background: "transparent",
          border: "1px solid #d9534f",
          color: "#d9534f",
          padding: "5px 10px",
          borderRadius: 4,
          cursor: "pointer",
          fontSize: 12,
        }}
      >
        ⚠️ Reset
      </button>
    </div>
  );
};

export default App;