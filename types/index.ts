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
}