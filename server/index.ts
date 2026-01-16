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

const updateState = function () {
  const state = game.getState();
  const s = structuredClone(state); // Полная копия состояния

  // Получаем список ID всех подключенных (игроки + зрители)
  const players: string[] = [];
  s.seats.forEach(p => { if (p) players.push(p.id) });
  s.spectators.forEach(p => { players.push(p.id) });

  // Рассылаем каждому персональное состояние
  players.forEach((id) => {
    const playerState = game.getStateForPlayer(id);
    io.to(id).emit("state", playerState);
  });
};

game.setOnTurnTimeout(() => {
  updateState();
});

game.setOnStateChange(() => {
  updateState();
});

const handleShowdown = (result: any) => {
  io.emit("showdown", result);

  // Проверяем игроков с нулевым стеком
  const state = game.getState();
  state.seats.forEach((player) => {
    if (player && player.chips === 0) {
      game.removePlayer(player.id);
      game.addSpectator(player.id); // Возвращаем в зрители, чтобы обновлялся стейт
      io.to(player.id).emit("errorMessage", "Ваш стек равен 0. Вы покидаете стол.");
    }
  });
  
  updateState();
};

game.setOnShowdown((result) => {
  handleShowdown(result);
});

app.get("/", (_req, res) => {
  res.send("Poker server is running");
});

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  // Новый клиент по умолчанию становится наблюдателем
  game.addSpectator(socket.id);

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

    // Вспомогательная функция для обработки хода
  const handleAction = (actionFn: () => boolean, errorMessage: string) => {
    const success = actionFn();
    if (!success) {
      socket.emit("errorMessage", errorMessage);
      return;
    }

    // Если после хода наступил Showdown — отправляем результаты всем
    if (game.getState().stage === 'showdown' && game.lastShowdown) {
      handleShowdown(game.lastShowdown);
    } else {
      updateState();
    }
  };

  socket.on("fold", () => {
    handleAction(() => game.fold(socket.id), "Невозможно выполнить Fold");
  });

  socket.on("check", () => {
    handleAction(() => game.check(socket.id), "Невозможно выполнить Check");
  });

  socket.on("call", () => {
    handleAction(() => game.call(socket.id), "Невозможно выполнить Call");
  });

  socket.on("raise", (amount: number) => {
    handleAction(() => game.raise(socket.id, amount), "Невозможно выполнить Raise");
  });

  socket.on("allIn", () => {
    handleAction(() => game.allIn(socket.id), "Невозможно выполнить All-In");
  });

  socket.on("showCards", () => {
    const success = game.showCards(socket.id);
    if (success) updateState();
  });

  socket.on("reset", () => {
    game.reset();
    updateState();
  });

  socket.on("start", () => {
    try {
      game.start();
      updateState();
    } catch (e: any) {
      socket.emit("errorMessage", e.message);
    }
  });

  socket.on("showdown", () => {
    const result = game.showdown();
    updateState();
    handleShowdown(result);
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
