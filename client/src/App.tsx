import React, { useEffect, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useTelegram } from "./hooks/useTelegram";
import { MainMenu } from "./pages/MainMenu";
import { TableList } from "./pages/TableList";
import { GameRoom } from "./pages/GameRoom";
import "./styles/telegram.css";
import type { 
  GameState, 
  ShowdownResult, 
  ServerEvents, 
  ExtendedServerEvents,
  ExtendedClientEvents,
  TelegramUser,
  TableInfo
} from "../../types/index";

// Socket connection
const socket: Socket<ExtendedServerEvents, ExtendedClientEvents> = io("http://localhost:3000");

type AppView = 'loading' | 'auth' | 'menu' | 'tables' | 'game';

const App: React.FC = () => {
  const {
    user,
    initData,
    isReady,
    ready,
    expand,
    setHeaderColor,
    setBackgroundColor,
    hapticFeedback,
  } = useTelegram();

  const [view, setView] = useState<AppView>('loading');
  const [authError, setAuthError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<TelegramUser | null>(null);
  
  // Tables state
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [currentTableId, setCurrentTableId] = useState<string | null>(null);
  
  // Game state
  const [gameState, setGameState] = useState<GameState>({
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

  // Initialize Telegram UI
  useEffect(() => {
    if (isReady) {
      ready();
      expand();
      setHeaderColor('#2481cc');
      setBackgroundColor('#f1f1f1');
    }
  }, [isReady, ready, expand, setHeaderColor, setBackgroundColor]);

  // Authentication with server
  useEffect(() => {
    if (!isReady) return;

    // Try to authenticate with Telegram initData
    if (initData) {
      socket.emit("auth", { initData });
    } else {
      // For development: create mock user if no Telegram
      setTimeout(() => {
        const mockUser: TelegramUser = {
          id: socket.id,
          telegramId: parseInt(socket.id.slice(0, 8), 16) || 123456789,
          firstName: 'Player',
          username: 'player_' + socket.id.slice(0, 4),
          balance: 1000,
        };
        setCurrentUser(mockUser);
        setView('menu');
      }, 500);
    }

    // Listen for auth responses
    socket.on("authSuccess", (userData) => {
      setCurrentUser(userData);
      setView('menu');
      hapticFeedback?.notificationOccurred('success');
    });

    socket.on("authError", (msg) => {
      setAuthError(msg);
      setView('auth');
      hapticFeedback?.notificationOccurred('error');
    });

    return () => {
      socket.off("authSuccess");
      socket.off("authError");
    };
  }, [isReady, initData, hapticFeedback]);

  // Socket event handlers
  useEffect(() => {
    // Tables list
    socket.on("tablesList", (tablesData) => {
      setTables(tablesData);
    });

    // Table joined
    socket.on("tableJoined", (payload) => {
      setCurrentTableId(payload.tableId);
      setGameState(payload.state);
      setView('game');
      hapticFeedback?.notificationOccurred('success');
    });

    // Table left
    socket.on("tableLeft", () => {
      setCurrentTableId(null);
      setMySeat(null);
      setView('menu');
    });

    // Table error
    socket.on("tableError", (msg) => {
      alert(msg);
      hapticFeedback?.notificationOccurred('error');
    });

    // Game state updates
    socket.on("state", (newState) => {
      setGameState(newState);
      if (newState.stage !== 'showdown') {
        setShowdown(null);
      }

      // Update mySeat based on current state
      const playerId = currentUser?.id || socket.id;
      const meInSeats = newState.seats.findIndex(p => p && p.id === playerId);
      setMySeat(meInSeats !== -1 ? meInSeats : null);
    });

    // Showdown results
    socket.on("showdown", (result) => {
      setShowdown(result);
    });

    // Error messages
    socket.on("errorMessage", (msg) => {
      alert(msg);
      hapticFeedback?.notificationOccurred('error');
    });

    return () => {
      socket.off("tablesList");
      socket.off("tableJoined");
      socket.off("tableLeft");
      socket.off("tableError");
      socket.off("state");
      socket.off("showdown");
      socket.off("errorMessage");
    };
  }, [currentUser, hapticFeedback]);

  // Fetch tables when menu is shown
  useEffect(() => {
    if (view === 'menu') {
      socket.emit("getTables");
    }
  }, [view]);

  // Actions
  const handleFindTable = useCallback(() => {
    hapticFeedback?.impactOccurred('medium');
    // Find first non-full table and join
    socket.emit("getTables");
    socket.once("tablesList", (tablesData) => {
      const availableTable = tablesData.find(t => t.status !== 'full');
      if (availableTable) {
        // Auto-select seat (-1 means server will find first available)
        socket.emit("joinTable", { tableId: availableTable.id, seat: -1 });
      } else {
        alert('Нет доступных столов');
      }
    });
  }, [hapticFeedback]);

  const handleShowTables = useCallback(() => {
    hapticFeedback?.impactOccurred('light');
    socket.emit("getTables");
    setView('tables');
  }, [hapticFeedback]);

  const handleSelectTable = useCallback((tableId: string) => {
    hapticFeedback?.impactOccurred('medium');
    // Auto-select seat (-1 means server will find first available)
    socket.emit("joinTable", { tableId, seat: -1 });
  }, [hapticFeedback]);

  const handleLeaveTable = useCallback(() => {
    socket.emit("leaveTable");
  }, []);

  const handleBackFromTables = useCallback(() => {
    setView('menu');
  }, []);

  // Loading view
  if (view === 'loading') {
    return (
      <div className="tg-flex tg-flex-col tg-items-center tg-justify-center" style={{ minHeight: '100vh' }}>
        <div className="tg-spinner tg-mb-md"></div>
        <div className="tg-text-hint">Загрузка...</div>
      </div>
    );
  }

  // Auth error view
  if (view === 'auth') {
    return (
      <div className="tg-p-lg tg-flex tg-flex-col tg-items-center tg-justify-center" style={{ minHeight: '100vh' }}>
        <div className="tg-card tg-text-center" style={{ maxWidth: '320px', width: '100%' }}>
          <div className="tg-card__title tg-mb-sm">Ошибка авторизации</div>
          <div className="tg-card__subtitle tg-mb-md">{authError || 'Не удалось авторизоваться через Telegram'}</div>
          <button 
            className="tg-button"
            onClick={() => window.location.reload()}
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  // Main Menu view
  if (view === 'menu') {
    return (
      <MainMenu
        user={currentUser}
        tables={tables}
        onSelectTable={handleSelectTable}
        onShowTables={handleShowTables}
      />
    );
  }

  // Tables list view
  if (view === 'tables') {
    return (
      <TableList
        tables={tables}
        onSelectTable={handleSelectTable}
        onBack={handleBackFromTables}
      />
    );
  }

  // Game room view
  if (view === 'game' && currentTableId) {
    return (
      <GameRoom
        socket={socket}
        tableId={currentTableId}
        gameState={gameState}
        currentUser={currentUser}
        mySeat={mySeat}
        showdown={showdown}
        onLeaveTable={handleLeaveTable}
      />
    );
  }

  // Fallback
  return null;
};

export default App;
