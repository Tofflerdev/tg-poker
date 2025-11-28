import React from "react";
import { Socket } from "socket.io-client";

interface Props {
  socket: Socket;
}

const GameControls: React.FC<Props> = ({ socket }) => {
  return (
    <div style={{ marginBottom: "20px" }}>
      <button onClick={() => socket.emit("start")}>Start Game</button>
      <button onClick={() => socket.emit("flop")}>Flop</button>
      <button onClick={() => socket.emit("turn")}>Turn</button>
      <button onClick={() => socket.emit("river")}>River</button>
      <button onClick={() => socket.emit("showdown")}>Showdown</button>
      <button onClick={() => socket.emit("reset")}>Reset Game</button>
    </div>
  );
};

export default GameControls;
