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
  folded: boolean;
  allIn: boolean;
}

export interface Spectator {
  id: string;
}

export type GameStage = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface GameState {
  seats: (Player | null)[];
  spectators: Spectator[];
  communityCards: string[];
  pot: number;
  currentBet: number;
  currentPlayer: number | null; // Индекс места (seat index)
  dealerPosition: number;
  smallBlind: number;
  bigBlind: number;
  stage: GameStage;
}

export interface ShowdownResult {
  results: {
    id: string;
    seat: number;
    hand: string[];
    descr: string;  // "Full House 8s full of Jacks"
    rank: number;   // Числовой ранг комбинации
  }[];
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