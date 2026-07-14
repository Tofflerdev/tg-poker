import React, { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { io, Socket } from "socket.io-client";
import { identifyAnalytics } from "./utils/analytics";
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
import { ReconnectOverlay } from "./components/ReconnectOverlay";
import BuyInModal from "./components/BuyInModal";
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

// Phase 5 / Plan 05-05 / ADMIN-03 / D-01 / RESEARCH Pattern 8.
// Lazy-loaded admin subtree — separate Vite chunk, NEVER bundled into the
// player main entry. Loaded only when window.location.pathname starts with /admin.
const AdminApp = lazy(() => import("./pages/admin/AdminApp"));

// Compute once at module load — admin path stays constant for the lifetime of the SPA load.
const IS_ADMIN_PATH = window.location.pathname.startsWith('/admin');

// Socket connection — always connect to same origin.
// In production nginx proxies /socket.io/ to the server.
// In development Vite proxies /socket.io/ to http://localhost:3000 (see vite.config.ts),
// which lets ngrok tunnel both HTTP and websocket traffic through one URL.
// Phase 5 / Plan 05-05 / D-01: when on /admin/* path, skip the player socket
// entirely. AdminApp owns its own /admin namespace socket (useAdminSocket).
const socket: Socket<ExtendedServerEvents, ExtendedClientEvents> = IS_ADMIN_PATH
  ? (null as unknown as Socket<ExtendedServerEvents, ExtendedClientEvents>) // never accessed when IS_ADMIN_PATH is true
  : io(window.location.origin);

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
  // Phase 5 / Plan 05-05 / ADMIN-03: lazy-loaded admin subtree. Render this
  // BEFORE useTelegram or any player-namespace socket logic. AdminApp manages
  // its own auth (JWT in localStorage) and its own /admin Socket.io namespace.
  if (IS_ADMIN_PATH) {
    return (
      <Suspense fallback={<div style={{ padding: 24, color: '#b0bec5' }}>Loading admin…</div>}>
        <AdminApp />
      </Suspense>
    );
  }

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
  // crypto-payments-rake phase 3: table pending a buy-in-amount choice.
  const [pendingTable, setPendingTable] = useState<TableInfo | null>(null);
  
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
    rakeBps: 0,
    rakeCapBB: 0,
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
      if (userData.analyticsId) identifyAnalytics(userData.analyticsId);
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

    // Phase 5 / Plan 05-01 / COMPLIANCE-04 + RESEARCH Open Q3:
    // Typed server-side error envelope. Currently routes:
    //   - TOS_REQUIRED → force the existing Consent gate (view='consent')
    //   - BANNED → generic alert; reset to auth view (banned users cannot play)
    // Defense-in-depth: server is the authoritative gate; this client routing
    // just gives the user a sensible error UI when the server says no.
    socket.on("serverError", (payload) => {
      if (payload.type === 'TOS_REQUIRED') {
        setView('consent');
        hapticFeedback?.notificationOccurred('warning');
      } else if (payload.type === 'BANNED') {
        alert('Your account has been banned and cannot join tables.');
        hapticFeedback?.notificationOccurred('error');
        setCurrentTableId(null);
        setMySeat(null);
      }
    });

    // Game state updates
    socket.on("state", (newState) => {
      setGameState(newState);
      if (newState.stage !== 'showdown') {
        setShowdown(null);
      }

      // RESILIENCE-03: server stores player.id = telegramId (durable key),
      // not socket.id. Match on stringified telegramId of the authenticated user.
      const meId = currentUser ? String(currentUser.telegramId) : null;
      const meInSeats = meId
        ? newState.seats.findIndex(p => p && p.id === meId)
        : -1;
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
      socket.off("serverError");
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
    // Find first non-full table, then open the buy-in picker for it.
    socket.emit("getTables");
    socket.once("tablesList", (tablesData) => {
      const availableTable = tablesData.find(t => t.status !== 'full');
      if (availableTable) {
        setPendingTable(availableTable);
      } else {
        alert('Нет доступных столов');
      }
    });
  }, [hapticFeedback]);

  // crypto-payments-rake phase 3: confirm the chosen buy-in amount and join.
  const handleConfirmBuyIn = useCallback((amount: number) => {
    if (!pendingTable) return;
    hapticFeedback?.impactOccurred('medium');
    socket.emit("joinTable", { tableId: pendingTable.id, seat: -1, buyInAmount: amount });
    setPendingTable(null);
  }, [pendingTable, hapticFeedback]);

  const handleShowTables = useCallback(() => {
    hapticFeedback?.impactOccurred('light');
    socket.emit("getTables");
    setView('tables');
  }, [hapticFeedback]);

  const handleSelectTable = useCallback((tableId: string) => {
    hapticFeedback?.impactOccurred('medium');
    // Open the buy-in picker; the actual join happens on confirm.
    const table = tables.find((t) => t.id === tableId);
    if (table) setPendingTable(table);
  }, [hapticFeedback, tables]);

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

  // Phase 4 / Plan 04-06 / RESILIENCE-05: full-screen reconnect overlay.
  // Subscribes to socket lifecycle events. Hidden when connected. Mounted at
  // every view so it overlays whatever the user is looking at when the
  // socket drops.
  const overlay = (
    <ReconnectOverlay
      socket={socket}
      lastStage={gameState.stage}
      onDismissExpired={() => {
        setView('menu');
        setCurrentTableId(null);
        setMySeat(null);
      }}
    />
  );

  // crypto-payments-rake phase 3: buy-in amount picker, shown over the menu /
  // table list when a table is selected. Confirming emits joinTable.
  const buyInSheet = pendingTable ? (
    <BuyInModal
      table={pendingTable}
      balance={currentUser?.balance ?? 0}
      onConfirm={handleConfirmBuyIn}
      onCancel={() => setPendingTable(null)}
    />
  ) : null;

  // Auth error view
  if (view === 'auth') {
    return (
      <>
        {devToolbar}
        {overlay}
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
        {overlay}
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
        {buyInSheet}
      </>
    );
  }

  // Tables list view
  if (view === 'tables') {
    return (
      <>
        {devToolbar}
        {overlay}
        <TableList
          tables={tables}
          onSelectTable={handleSelectTable}
          onBack={handleBackFromTables}
        />
        {buyInSheet}
      </>
    );
  }

  // Profile view
  if (view === 'profile') {
    return (
      <>
        {devToolbar}
        {overlay}
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
        {overlay}
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
        {overlay}
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
        {overlay}
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
        {overlay}
        <ToS onBack={() => setView(currentUser?.tosAcceptedAt ? 'menu' : 'consent')} />
      </>
    );
  }

  if (view === 'legal-privacy') {
    return (
      <>
        {devToolbar}
        {overlay}
        <Privacy onBack={() => setView(currentUser?.tosAcceptedAt ? 'menu' : 'consent')} />
      </>
    );
  }

  if (view === 'legal-rg') {
    return (
      <>
        {devToolbar}
        {overlay}
        <ResponsibleGaming onBack={() => setView(currentUser?.tosAcceptedAt ? 'menu' : 'consent')} />
      </>
    );
  }

  // Game room view
  if (view === 'game' && currentTableId) {
    return (
      <>
        {devToolbar}
        {overlay}
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
