import express from "express";
import http from "http";
import { Server } from "socket.io";
import Game from "./Game.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const PORT = 3000;
const game = new Game();

app.get("/", (_req, res) => {
  res.send("Poker server is running");
});

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

 const updateState = function () {
    let state = game.getState()
    let s = structuredClone(state)
    let players: string[] = [];
    s.seats.filter((p) => p !== null).map((p) => {
      if (p.id !== null ) {
        players.push(p.id)
      }
    })
    s.spectators.map((p) => {
      if (p.id !== null ) {
        players.push(p.id)
      }
    })

    players.forEach((id) => {
      let playerSeats: any[] = []
      s.seats.map((pl) => {
        let p = structuredClone(pl)
        if (p !== null && p.id !== id && p.hand.length > 0) {
          p.hand = ["back","back"]
        }
        playerSeats.push(p)
      })
      let playerState = {
        seats: playerSeats,
        spectators: s.spectators,
        communityCards: s.communityCards,
      }
      console.log(`Sending state to id# ${id}...`)
      console.log(playerState)
      io.to(id).emit("state", playerState )
    })
    
  }

  // Новый клиент по умолчанию становится наблюдателем
  game.addPlayer(socket.id);

  // Клиент сам может запросить состояние
  socket.on("getState", () => {
    updateState();
  });

  // Игрок хочет занять место
  socket.on("join", (seat: number) => {
    const success = game.addPlayer(socket.id, seat);
    if (!success) {
      socket.emit("errorMessage", "Место занято или неверный номер");
      return;
    }
    updateState();
  });

  socket.on("reset", () => {
    game.reset();
    updateState();
  });

  socket.on("start", () => {
    game.start();
    updateState();
  });

  socket.on("flop", () => {
    game.flop();
    updateState();
  });

  socket.on("turn", () => {
    game.turn();
    updateState();
  });

  socket.on("river", () => {
    game.river();
    updateState();
  });

  socket.on("showdown", () => {
    const result = game.showdown();
    io.emit("state", game.getState())
    io.emit("showdown", result);
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
    game.removePlayer(socket.id);
    updateState();
  });
});

server.listen(PORT, () => {
  console.log(`Poker server running on http://localhost:${PORT}`);
});
