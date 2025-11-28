import React, { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import GameControls from "./components/GameControls";
import Table from "./components/Table";

interface Player {
  id: string;
  seat?: number;
  hand: string[];
}

interface GameState {
  seats: (Player | null)[];
  spectators: Player[];
  communityCards: string[];
}

interface ShowdownResult {
  results: any[];
  winners: any[];
}

const socket: Socket = io("http://localhost:3000");

const App: React.FC = () => {
  const [state, setState] = useState<GameState>({
    seats: Array(6).fill(null),
    spectators: [],
    communityCards: [],
  });
  const [showdown, setShowdown] = useState<ShowdownResult | null>(null);
  const [mySeat, setMySeat] = useState<number | null>(null);

  useEffect(() => {
    socket.on("state", (gameState: GameState) => {
      setState(gameState);
      setShowdown(null);
    });

    socket.on("showdown", (result: ShowdownResult) => setShowdown(result));

    socket.on("errorMessage", (msg: string) => alert(msg));

    // 🚀 сразу при подключении запросим актуальное состояние
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
      <GameControls socket={socket} />

      <Table
        seats={state.seats}
        spectators={state.spectators}
        mySeat={mySeat}
        communityCards={state.communityCards}
        onSit={handleSit}
      />

      <h2>Showdown</h2>
      <pre>{showdown ? JSON.stringify(showdown, null, 2) : "—"}</pre>
    </div>
  );
};

export default App;
