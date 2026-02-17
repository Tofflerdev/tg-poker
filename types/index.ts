/*
  Общие типы для Клиента и Сервера.
  Источником правды является этот файл.
*/

export interface Player {
  id: string;
  seat: number;
  hand: string[]; // ["As", "Kd"] или ["back", "back"] для скрытых
  chips: number;  // Стек игрока
  bet: number;    // Текущая ставка в раунде
  totalBet: number; // Общая сумма ставок за всю раздачу (для расчета сайд-потов)
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  showCards: boolean;
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
  start: () => void;
  reset: () => void;
  // Actions
  fold: () => void;
  check: () => void;
  call: () => void;
  raise: (amount: number) => void;
  allIn: () => void;
  showCards: () => void;
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
  id: string;
  telegramId: number;
  username?: string;
  firstName: string;
  lastName?: string;
  photoUrl?: string;
  balance: number;
}

export interface UserProfile {
  telegramId: number;
  username: string;
  totalWinnings: number;
  handsPlayed: number;
  handsWon: number;
  joinedAt: Date;
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
}