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
    const state = game.getState();
    const s = structuredClone(state); // Полная копия состояния

    // Получаем список ID всех подключенных (игроки + зрители)
    const players: string[] = [];
    s.seats.forEach(p => { if (p) players.push(p.id) });
    s.spectators.forEach(p => { players.push(p.id) });

    // Рассылаем каждому персональное состояние
    players.forEach((id) => {
      // Скрываем карты чужих игроков
      const maskedSeats = s.seats.map(p => {
        if (!p) return null;

        // Если это не я и у игрока есть карты
        if (p.id !== id && p.hand.length > 0) {
          // МЫ СКРЫВАЕМ КАРТЫ, ЕСЛИ:
          // 1. Сейчас НЕ шоудаун
          // 2. ИЛИ игрок сбросил карты (folded) — даже если сейчас шоудаун
          if (s.stage !== 'showdown' || p.folded) {
            return { ...p, hand: ["back", "back"] };
          }
        }
        
        return p;
      });

      // Формируем объект ответа, сохраняя ВСЕ поля (stage, pot, etc)
      const playerState = {
        ...s, // <--- ВАЖНО: копируем все поля (stage, currentPlayer, pot...)
        seats: maskedSeats,
      };

      io.to(id).emit("state", playerState);
      
      // Для отладки (в консоль сервера)
      // console.log(`Sent state to ${id}, stage: ${playerState.stage}, current: ${playerState.currentPlayer}`);
    });
  };

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
      io.emit("showdown", game.lastShowdown);

      // Проверяем игроков с нулевым стеком
      const state = game.getState();
      state.seats.forEach((player) => {
        if (player && player.chips === 0) {
          game.removePlayer(player.id);
          game.addSpectator(player.id); // Возвращаем в зрители, чтобы обновлялся стейт
          io.to(player.id).emit("errorMessage", "Ваш стек равен 0. Вы покидаете стол.");
        }
      });
    }
    
    updateState();
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
    io.emit("state", game.getState())
    io.emit("showdown", result);

    // Проверяем игроков с нулевым стеком
    const state = game.getState();
    state.seats.forEach((player) => {
      if (player && player.chips === 0) {
        game.removePlayer(player.id);
        game.addSpectator(player.id);
        io.to(player.id).emit("errorMessage", "Ваш стек равен 0. Вы покидаете стол.");
      }
    });
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
