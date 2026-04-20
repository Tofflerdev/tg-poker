import React, { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { io, Socket } from "socket.io-client";
import { useTelegram } from "./hooks/useTelegram";
import { MainMenu } from "./pages/MainMenu";
import { TableList } from "./pages/TableList";
import { GameRoom } from "./pages/GameRoom";
import { ProfileSettings } from "./pages/ProfileSettings";
import { Deposit } from "./pages/Deposit";
import { Consent } from "./pages/Consent";
import { ToS } from "./pages/legal/ToS";
import { Privacy } from "./pages/legal/Privacy";
import { ResponsibleGaming } from "./pages/legal/ResponsibleGaming";
import "./styles/telegram.css";
import "./styles/neon.css";
import type {
  GameState,
  ShowdownResult,
  ServerEvents,
  ExtendedServerEvents,
  ExtendedClientEvents,
  TelegramUser,
  TableInfo
} from "../../types/index";

// Lazy-load DevToolbar only in dev mode (tree-shaken in production)
const DevToolbar = import.meta.env.DEV
  ? lazy(() => import("./components/DevToolbar"))
  : () => null;

// Socket connection — always connect to same origin.
// In production nginx proxies /socket.io/ to the server.
// In development Vite proxies /socket.io/ to http://localhost:3000 (see vite.config.ts),
// which lets ngrok tunnel both HTTP and websocket traffic through one URL.
const socket: Socket<ExtendedServerEvents, ExtendedClientEvents> = io(window.location.origin);

// AppView union — Plan 02-04 added 'deposit' (D-17, DEPOSIT-02).
// Plan 02-08 extends with:
//   'consent'       — first-launch consent gate (D-27, COMPLIANCE-02)
//   'legal-tos'     — static ToS page (D-26, COMPLIANCE-01)
//   'legal-privacy' — static Privacy Policy page
//   'legal-rg'      — static Responsible Gaming page (D-30, COMPLIANCE-05)
// MainMenu's onNavigate prop already accepts these target strings permissively
// (Plan 02-04 pre-declared them in the AppNavigateTarget union so 02-08's
// addition here required no reshaping of the MainMenu API).
type AppView =
  | 'loading'
  | 'auth'
  | 'menu'
  | 'tables'
  | 'game'
  | 'profile'
  | 'deposit'
  | 'consent'
  | 'legal-tos'
  | 'legal-privacy'
  | 'legal-rg';

/**
 * Get a stable dev player ID from URL params or sessionStorage.
 * Supports ?player=1 through ?player=6 for multi-tab testing.
 * Falls back to a random ID stored in sessionStorage for persistence across refreshes.
 */
function getDevPlayerId(): number {
  const urlParams = new URLSearchParams(window.location.search);
  const playerParam = urlParams.get('player');
  
  if (playerParam) {
    const playerNum = parseInt(playerParam, 10);
    if (playerNum >= 1 && playerNum <= 6) {
      // Deterministic ID: 100001 through 100006
      const devId = 100000 + playerNum;
      sessionStorage.setItem('devPlayerId', devId.toString());
      return devId;
    }
  }
  
  // Check sessionStorage for a previously assigned ID
  const stored = sessionStorage.getItem('devPlayerId');
  if (stored) {
    return parseInt(stored, 10);
  }
  
  // Generate a random ID and store it
  const randomId = Math.floor(Math.random() * 900000) + 100000;
  sessionStorage.setItem('devPlayerId', randomId.toString());
  return randomId;
}

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
    turnExpiresAt: null,
    nextHandIn: null,
    lastRoundBets: []
  });
  
  const [showdown, setShowdown] = useState<ShowdownResult | null>(null);
  const [mySeat, setMySeat] = useState<number | null>(null);

  // Initialize Telegram UI
  useEffect(() => {
    if (isReady) {
      ready();
      expand();
      // Plan 02-03: Telegram chrome follows the Neon Strip dark surface (#0a0a0e).
      // Hex literal is required — Telegram WebApp API takes a literal string, not
      // a CSS var. Value matches --color-surface-base in client/src/styles/neon.css.
      setHeaderColor('#0a0a0e');
      setBackgroundColor('#0a0a0e');

      // Lock orientation to portrait (Telegram Bot API 8.0+)
      const webApp = window.Telegram?.WebApp;
      if (webApp && typeof (webApp as any).lockOrientation === 'function') {
        (webApp as any).lockOrientation();
      }
    }
  }, [isReady, ready, expand, setHeaderColor, setBackgroundColor]);

  // Authentication with server
  useEffect(() => {
    if (!isReady) return;

    // Try to authenticate with Telegram initData
    if (initData) {
      socket.emit("auth", { initData });
    } else if (import.meta.env.DEV) {
      // Dev mode: use stable player ID from URL params or sessionStorage
      const devId = getDevPlayerId();
      console.log(`🔧 Dev mode: Authenticating as Player ${devId}` +
        (devId >= 100001 && devId <= 100006 ? ` (?player=${devId - 100000})` : ' (random)'));
      
      // Create a mock initData string that passes the basic check in auth.ts
      const mockInitData = `query_id=AAHdF6kUAAAAAN0XqRT&user=%7B%22id%22%3A${devId}%2C%22first_name%22%3A%22Dev%22%2C%22last_name%22%3A%22Player%20${devId}%22%2C%22username%22%3A%22dev_player_${devId}%22%2C%22language_code%22%3A%22en%22%7D&auth_date=${Math.floor(Date.now() / 1000)}&hash=mock_hash_for_dev`;
      
      socket.emit("auth", { initData: mockInitData, devId });
    } else {
      // Not in Telegram and not in dev mode — show auth error
      setAuthError('Authentication failed');
      setView('auth');
    }

    // Listen for auth responses
    socket.on("authSuccess", (userData) => {
      setCurrentUser(userData);
      setView('menu');
      hapticFeedback?.notificationOccurred('success');
    });

    socket.on("authError", (msg) => {
      console.error('[Auth] Error:', msg);
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
      // Server uses socket.id for player identification in game state
      const playerId = socket.id;
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

    // Balance updates
    socket.on("balanceUpdate", (newBalance) => {
      setCurrentUser(prev => prev ? { ...prev, balance: newBalance } : null);
    });
    
    socket.on("dailyBonusClaimed", (data) => {
        setCurrentUser(prev => prev ? { 
            ...prev, 
            balance: data.balance,
            lastDailyRefill: new Date().toISOString(), // Approximate
            canClaimDaily: false
        } : null);
    });

    socket.on("profileUpdated", (profile) => {
        setCurrentUser(prev => prev ? {
            ...prev,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl
        } : null);
    });

    // Plan 02-02: propagate the user's own avatar change to MainMenu/Profile
    // views immediately on server ack. MainMenu / ProfileSettings are redesigned
    // in Plans 04 + 06 and will read currentUser.avatarId via avatarUrl(id).
    socket.on("avatarUpdated", (payload) => {
      setCurrentUser(prev => prev ? { ...prev, avatarId: payload.avatarId } : prev);
    });

    // Plan 02-08: propagate ToS acceptance ack so the defense-in-depth guard
    // stops force-rendering <Consent /> and the grandfather banner disappears.
    socket.on("tosAccepted", (payload) => {
      setCurrentUser(prev => prev ? { ...prev, tosAcceptedAt: payload.tosAcceptedAt } : prev);
    });

    return () => {
      socket.off("tablesList");
      socket.off("tableJoined");
      socket.off("tableLeft");
      socket.off("tableError");
      socket.off("state");
      socket.off("showdown");
      socket.off("errorMessage");
      socket.off("balanceUpdate");
      socket.off("dailyBonusClaimed");
      socket.off("profileUpdated");
      socket.off("avatarUpdated");
      socket.off("tosAccepted");
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

  const handleOpenProfile = useCallback(() => {
    setView('profile');
  }, []);

  const handleClaimBonus = useCallback(() => {
    socket.emit("claimDailyBonus");
  }, []);

  const handleBackFromProfile = useCallback(() => {
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

  // Dev toolbar wrapper — renders DevToolbar on top of any view in dev mode
  const devToolbar = import.meta.env.DEV ? (
    <Suspense fallback={null}>
      <DevToolbar currentUser={currentUser} />
    </Suspense>
  ) : null;

  // Auth error view
  if (view === 'auth') {
    return (
      <>
        {devToolbar}
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
      </>
    );
  }

  // Main Menu view
  if (view === 'menu') {
    return (
      <>
        {devToolbar}
        <MainMenu
          user={currentUser}
          socket={socket}
          showGrandfatherBanner={!!currentUser && !currentUser.tosAcceptedAt}
          onTosAccepted={() => { /* tosAccepted socket listener updates currentUser */ }}
          onNavigate={(target) => {
            // Plan 02-04/02-08: dispatch to AppView variants. Unknown values drop.
            if (
              target === 'menu' ||
              target === 'tables' ||
              target === 'game' ||
              target === 'profile' ||
              target === 'deposit' ||
              target === 'consent' ||
              target === 'legal-tos' ||
              target === 'legal-privacy' ||
              target === 'legal-rg'
            ) {
              hapticFeedback?.impactOccurred(target === 'profile' ? 'light' : 'medium');
              if (target === 'tables') socket.emit('getTables');
              setView(target);
            }
          }}
          onClaimBonus={handleClaimBonus}
        />
      </>
    );
  }

  // Tables list view
  if (view === 'tables') {
    return (
      <>
        {devToolbar}
        <TableList
          tables={tables}
          onSelectTable={handleSelectTable}
          onBack={handleBackFromTables}
        />
      </>
    );
  }

  // Profile view
  if (view === 'profile') {
    return (
      <>
        {devToolbar}
        <ProfileSettings
          socket={socket}
          onBack={handleBackFromProfile}
          currentUser={currentUser}
        />
      </>
    );
  }

  // Deposit view (Plan 02-04, D-17 / DEPOSIT-02) — "Coming soon" stub.
  if (view === 'deposit') {
    return (
      <>
        {devToolbar}
        <Deposit onBack={() => setView('menu')} />
      </>
    );
  }

  // Plan 02-08: defense-in-depth consent guard. Users with no tosAcceptedAt
  // are force-rendered <Consent /> regardless of target view. Legal pages
  // remain reachable from the Consent screen via inline links (view='legal-*').
  if (
    currentUser &&
    !currentUser.tosAcceptedAt &&
    view !== 'consent' &&
    view !== 'legal-tos' &&
    view !== 'legal-privacy' &&
    view !== 'legal-rg'
  ) {
    return (
      <>
        {devToolbar}
        <Consent
          socket={socket}
          onAccept={() => setView('menu')}
          onViewLegal={(which) => setView(which === 'tos' ? 'legal-tos' : which === 'privacy' ? 'legal-privacy' : 'legal-rg')}
        />
      </>
    );
  }

  if (view === 'consent') {
    return (
      <>
        {devToolbar}
        <Consent
          socket={socket}
          onAccept={() => setView('menu')}
          onViewLegal={(which) => setView(which === 'tos' ? 'legal-tos' : which === 'privacy' ? 'legal-privacy' : 'legal-rg')}
        />
      </>
    );
  }

  if (view === 'legal-tos') {
    return (
      <>
        {devToolbar}
        <ToS onBack={() => setView(currentUser?.tosAcceptedAt ? 'menu' : 'consent')} />
      </>
    );
  }

  if (view === 'legal-privacy') {
    return (
      <>
        {devToolbar}
        <Privacy onBack={() => setView(currentUser?.tosAcceptedAt ? 'menu' : 'consent')} />
      </>
    );
  }

  if (view === 'legal-rg') {
    return (
      <>
        {devToolbar}
        <ResponsibleGaming onBack={() => setView(currentUser?.tosAcceptedAt ? 'menu' : 'consent')} />
      </>
    );
  }

  // Game room view
  if (view === 'game' && currentTableId) {
    return (
      <>
        {devToolbar}
        <GameRoom
          socket={socket}
          tableId={currentTableId}
          gameState={gameState}
          currentUser={currentUser}
          mySeat={mySeat}
          showdown={showdown}
          onLeaveTable={handleLeaveTable}
        />
      </>
    );
  }

  // Fallback
  return null;
};

export default App;
