/*
  Общие типы для Клиента и Сервера.
  Источником правды является этот файл.
*/

export interface Player {
  id: string;             // telegramId (stringified) — durable identity key (RESILIENCE-03)
  socketId?: string;      // mutable transport handle — updated on reconnect (D-05)
  telegramId?: number;    // numeric form kept for display / DB use
  displayName?: string;   // shown at table
  avatarUrl?: string;     // DEPRECATED — legacy Telegram photo_url; not rendered (D-15). Kept during transition.
  avatarId?: string;      // Plan 02-02: one of AVATARS slugs; SeatsDisplay resolves via manifest
  seat: number;
  hand: string[]; // ["As", "Kd"] или ["back", "back"] для скрытых
  chips: number;  // Стек игрока
  bet: number;    // Текущая ставка в раунде
  totalBet: number; // Общая сумма ставок за всю раздачу (для расчета сайд-потов)
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  showCards: boolean;
  waitingForBB: boolean;  // NEW: игрок присоединился во время игры, ждет большого блайнда
  sittingOut: boolean;    // NEW: игрок добровольно отсиделся
}

// Представляет один пот (основной или сайд-пот)
export interface Pot {
  amount: number;              // Сумма фишек в этом поте
  eligiblePlayers: string[];   // ID игроков, которые могут выиграть этот пот
  name: string;                // "Main Pot", "Side Pot 1", и т.д.
}

// Результат распределения одного пота
export interface PotResult {
  potName: string;
  amount: number;
  winners: {
    id: string;
    descr: string;
  }[];
}

export interface Spectator {
  id: string;
}

export type GameStage = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface GameState {
  seats: (Player | null)[];
  spectators: Spectator[];
  communityCards: string[];
  pots: Pot[];           // Массив потов (основной + сайд-поты)
  totalPot: number;      // Общая сумма всех потов (для удобства отображения)
  currentBet: number;
  currentPlayer: number | null; // Индекс места (seat index)
  dealerPosition: number;
  smallBlind: number;
  bigBlind: number;
  stage: GameStage;
  turnExpiresAt: number | null; // Timestamp окончания хода
  nextHandIn: number | null;  // NEW: timestamp когда начнется следующая раздача
  lastRoundBets: number[];    // Ставки из последнего завершённого раунда торговли (для анимации фишек)
}

export interface ShowdownResult {
  results: {
    id: string;
    seat: number;
    hand: string[];
    descr: string;  // "Full House 8s full of Jacks"
    rank: number;   // Числовой ранг комбинации
  }[];
  potResults: PotResult[];  // Результаты по каждому поту
  winners: {
    id: string;
    descr: string;
  }[];
}

// События сокетов (Client -> Server)
export interface ClientEvents {
  join: (seat: number) => void;
  getState: () => void;
  // Actions
  fold: () => void;
  check: () => void;
  call: () => void;
  raise: (amount: number) => void;
  allIn: () => void;
  showCards: () => void;
  // Auto-start continuous game
  sitOut: () => void;     // NEW: добровольный сит-аут
  sitIn: () => void;      // NEW: вернуться за стол (будет ждать ББ)
  // Dev only
  flop: () => void;
  turn: () => void;
  river: () => void;
  showdown: () => void;
}

// События сокетов (Server -> Client)
export interface ServerEvents {
  state: (state: GameState) => void;
  showdown: (result: ShowdownResult) => void;
  errorMessage: (msg: string) => void;
  authSuccess: (user: TelegramUser) => void;
  authError: (msg: string) => void;
}

// ==========================================
// Telegram Mini App Types
// ==========================================

export interface TelegramUser {
  id: string;           // internal ID (was socket.id, now DB id)
  telegramId: number;
  username?: string;     // Telegram @username
  displayName: string;   // NEW: editable display name
  firstName: string;
  lastName?: string;
  photoUrl?: string;
  avatarUrl?: string;    // DEPRECATED — legacy Telegram photo_url; not rendered (D-15). Kept during transition.
  avatarId?: string;     // Plan 02-02: slug in AVATARS; rendered via avatarUrl(id) manifest resolver
  tosAcceptedAt?: string; // Plan 02-08: ISO timestamp of TOS acceptance (substrate added here for build hygiene)
  balance: number;
  lastDailyRefill?: string; // NEW: ISO timestamp
  canClaimDaily?: boolean;  // NEW: computed field
}

export interface UserProfile {
  telegramId: number;
  username?: string;
  displayName: string;
  avatarUrl?: string;
  totalWinnings: number;
  handsPlayed: number;
  handsWon: number;
  biggestPot: number;
  joinedAt: string; // ISO string
}

export interface WebAppInitData {
  query_id?: string;
  user?: WebAppUser;
  receiver?: WebAppUser;
  chat?: WebAppChat;
  chat_type?: string;
  chat_instance?: string;
  start_param?: string;
  can_send_after?: number;
  auth_date: number;
  hash: string;
}

export interface WebAppUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  added_to_attachment_menu?: boolean;
  allows_write_to_pm?: boolean;
  photo_url?: string;
}

export interface WebAppChat {
  id: number;
  type: 'group' | 'supergroup' | 'channel';
  title: string;
  username?: string;
  photo_url?: string;
}

// ==========================================
// Auth Types
// ==========================================

export interface AuthPayload {
  initData: string;
  devId?: number;
}


// ==========================================
// Multi-Table Types
// ==========================================

export type TableStatus = 'waiting' | 'playing' | 'full';
export type TableCategory = 'cash' | 'tournament' | 'sitngo';

export interface TableConfig {
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  turnTime: number; // seconds
  buyIn: number;
  category: TableCategory;
}

export interface TableInfo {
  id: string;
  name: string;
  config: TableConfig;
  status: TableStatus;
  playerCount: number;
  maxPlayers: number;
}

export interface Table {
  id: string;
  name: string;
  config: TableConfig;
  game: GameState;
  playerIds: string[]; // socketIds
  status: TableStatus;
  createdAt: Date;
}

// Extended ServerEvents for multi-table
export interface ExtendedServerEvents extends ServerEvents {
  tablesList: (tables: TableInfo[]) => void;
  tableJoined: (payload: { tableId: string; seat: number; state: GameState }) => void;
  tableLeft: () => void;
  tableError: (msg: string) => void;
  // Chat events
  chatMessage: (message: ChatMessage) => void;
  systemMessage: (text: string) => void;
  // NEW
  dailyBonusClaimed: (data: { balance: number; nextClaimAt: string }) => void;
  dailyBonusError: (msg: string) => void;
  profileData: (profile: UserProfile) => void;
  profileUpdated: (profile: UserProfile) => void;
  profileError: (msg: string) => void;
  balanceUpdate: (balance: number) => void;
  // Plan 02-02: avatar + TOS substrate (picker UI lands in Plan 06; TOS gate in Plan 08)
  avatarUpdated: (payload: { avatarId: string }) => void;
  tosAccepted: (payload: { tosAcceptedAt: string; tosVersion: string }) => void;
  // Phase 3 / Plan 03-01: per-action floating bubble broadcast (D-01).
  actionBubble: (evt: ActionBubbleEvent) => void;
  // Plan 03-04 (PROFILE-03, PROFILE-04): hand-history reader response.
  handHistoryData: (rows: HandHistoryDTO[]) => void;
  handHistoryError: (msg: string) => void;
}

// ==========================================
// Chat Types
// ==========================================

export interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  timestamp: number;
  type: 'player' | 'system';
}

// Extended ClientEvents with chat
export interface ExtendedClientEvents extends ClientEvents {
  auth: (payload: AuthPayload) => void;
  getTables: () => void;
  joinTable: (payload: { tableId: string; seat: number }) => void;
  leaveTable: () => void;
  // Chat
  sendChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  // NEW
  claimDailyBonus: () => void;
  getProfile: () => void;
  updateProfile: (data: { displayName?: string; avatarUrl?: string }) => void;
  // Plan 02-02: avatar + TOS substrate (picker UI lands in Plan 06; TOS gate in Plan 08)
  updateAvatar: (payload: { avatarId: string }) => void;
  acceptTos: (payload: { version: string }) => void;
  // Plan 03-04 (PROFILE-03): request the requesting user's last 50 hands.
  // Server uses socket.data.telegramId — NO payload accepted.
  getHandHistory: () => void;
}

// --- Socket.io socket.data extension (RESILIENCE-03) ---

export interface SocketData {
  telegramId?: string;   // populated on successful auth; string form of TelegramUser.telegramId
}

// --- Phase 1 Game callback contracts (GAME-04, D-10/D-11) ---

export type PlayerActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export interface PlayerActionEvent {
  tableId: string;
  telegramId: string;           // stringified; see Pitfall 5
  seat: number;
  action: PlayerActionKind;
  amount: number;               // chips committed by this action (delta)
  totalBetThisStreet: number;   // player.bet after the action
  potAfter: number;             // game.getTotalPot() after the action
}

export interface HandCompletePerPlayer {
  telegramId: string;
  seat: number;
  holeCards: string[];          // server filters before broadcasting — do not broadcast raw
  finalChips: number;
  netDelta: number;             // finalChips - handStartChips[seat]
  won: boolean;
  showedDown: boolean;
}

// Phase 3 / Plan 03-01: Server-broadcast event for floating action bubbles (D-01).
// Payload is structurally identical to PlayerActionEvent — no additional fields.
// SECURITY (T-3-SCHEMA): MUST NOT include opponent hole cards or any
// per-player secret state. Bubbles render publicly visible action info only.
export interface ActionBubbleEvent extends PlayerActionEvent {}

export interface HandCompleteEvent {
  handId: string;
  tableId: string;
  completedAt: Date;
  board: string[];              // game.communityCards snapshot
  perPlayer: HandCompletePerPlayer[];
}

// --- Phase 3 / Plan 03-04 (PROFILE-03, PROFILE-04): hand-history reader DTO ---

/**
 * Single opponent row inside a HandHistoryDTO.
 * `holeCards` is `[]` when `showedDown === false` (privacy filter D-18 / PROFILE-04
 * / T-3-PRIVACY) and the opponent verbatim cards otherwise.
 */
export interface HandHistoryOpponentDTO {
  telegramId: string;
  seat: number;
  holeCards: string[];
  finalChips: number;
  netDelta: number;
  won: boolean;
  showedDown: boolean;
}

/**
 * One hand from the requesting user's perspective.
 * - `holeCards` here are the requesting user's own cards — always returned verbatim.
 * - `tableName` is resolved server-side from PREDEFINED_TABLES (RESEARCH.md Open Q1 Option A).
 * - `opponents` includes every other seat that participated in the same handId,
 *   with each opponent's `holeCards` stripped per D-18.
 */
export interface HandHistoryDTO {
  handId: string;
  tableId: string;
  tableName: string;
  playedAt: string;          // ISO 8601 string (Date is non-portable across socket.io serialization)
  board: string[];
  // Requesting user's own row:
  seat: number;
  holeCards: string[];
  netDelta: number;
  finalChips: number;
  showedDown: boolean;
  won: boolean;
  // Other seats that participated in this hand:
  opponents: HandHistoryOpponentDTO[];
}
