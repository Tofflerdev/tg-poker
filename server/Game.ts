import Deck from "./Deck.js";
import pkg from "pokersolver";
const { Hand } = pkg;

export interface Player {
  id: string;
  seat: number;
  hand: string[];
  chips: number;           // стек игрока
  bet: number;             // текущая ставка в раунде
  folded: boolean;         // сбросил карты
  allIn: boolean;          // пошел ва-банк
}

export interface GameState {
  seats: (Player | null)[];
  spectators: { id: string }[];
  communityCards: string[];
  pot: number;
  currentBet: number;
  currentPlayer: number | null;
  dealerPosition: number;
  smallBlind: number;
  bigBlind: number;
  stage: 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
}

export default class Game {
  private seats: (Player | null)[] = Array(6).fill(null);
  private spectators: { id: string }[] = [];
  private communityCards: string[] = [];
  private deck: Deck | null = null;
  
  private pot: number = 0;
  private currentBet: number = 0;
  private currentPlayer: number | null = null;
  private dealerPosition: number = 0;
  private smallBlind: number = 10;
  private bigBlind: number = 20;
  private stage: GameState['stage'] = 'waiting';
  private lastRaisePosition: number | null = null;

  // Добавление игрока
  addPlayer(id: string, seat: number, chips: number = 1000): boolean {
    if (seat < 0 || seat >= this.seats.length) return false;
    if (this.seats[seat]) return false;
    if (this.stage !== 'waiting') return false; // нельзя добавлять во время игры

    this.spectators = this.spectators.filter((p) => p.id !== id);

    const player: Player = {
      id,
      seat,
      hand: [],
      chips,
      bet: 0,
      folded: false,
      allIn: false,
    };
    this.seats[seat] = player;
    return true;
  }

  addSpectator(id: string): boolean {
    if (!this.spectators.find((p) => p.id === id)) {
      this.spectators.push({ id });
    }
    return true;
  }

  removePlayer(id: string) {
    this.seats = this.seats.map((p) => (p?.id === id ? null : p));
    this.spectators = this.spectators.filter((p) => p.id !== id);
  }

  reset() {
    this.deck = null;
    this.communityCards = [];
    this.pot = 0;
    this.currentBet = 0;
    this.currentPlayer = null;
    this.stage = 'waiting';
    this.lastRaisePosition = null;
    
    this.seats.forEach((p) => {
      if (p) {
        p.hand = [];
        p.bet = 0;
        p.folded = false;
        p.allIn = false;
      }
    });
  }

  start() {
    const activePlayers = this.getActivePlayers();
    if (activePlayers.length < 2) {
      throw new Error("Нужно минимум 2 игрока");
    }

    this.reset();
    this.deck = new Deck();
    this.deck.shuffle();
    this.stage = 'preflop';

    // Раздача карт
    this.seats.forEach((p) => {
      if (p && p.chips > 0) {
        p.hand = this.deck!.deal(2);
      }
    });

    // Установка блайндов
    this.postBlinds();
    
    // Первый игрок после большого блайнда
    this.currentPlayer = this.getNextPlayer(this.getBigBlindPosition());
  }

  private postBlinds() {
    const sbPos = this.getSmallBlindPosition();
    const bbPos = this.getBigBlindPosition();

    const sbPlayer = this.seats[sbPos];
    const bbPlayer = this.seats[bbPos];

    if (sbPlayer) {
      const sbAmount = Math.min(this.smallBlind, sbPlayer.chips);
      sbPlayer.bet = sbAmount;
      sbPlayer.chips -= sbAmount;
      this.pot += sbAmount;
      if (sbPlayer.chips === 0) sbPlayer.allIn = true;
    }

    if (bbPlayer) {
      const bbAmount = Math.min(this.bigBlind, bbPlayer.chips);
      bbPlayer.bet = bbAmount;
      bbPlayer.chips -= bbAmount;
      this.pot += bbAmount;
      this.currentBet = bbAmount;
      if (bbPlayer.chips === 0) bbPlayer.allIn = true;
    }

    this.lastRaisePosition = bbPos;
  }

  // Действия игрока
  fold(playerId: string): boolean {
    const player = this.getCurrentPlayerIfValid(playerId);
    if (!player) return false;

    player.folded = true;
    this.nextPlayer();
    return true;
  }

  check(playerId: string): boolean {
    const player = this.getCurrentPlayerIfValid(playerId);
    if (!player) return false;
    if (player.bet < this.currentBet) return false; // нельзя чекать, нужно коллировать

    this.nextPlayer();
    return true;
  }

  call(playerId: string): boolean {
    const player = this.getCurrentPlayerIfValid(playerId);
    if (!player) return false;

    const toCall = this.currentBet - player.bet;
    const actualBet = Math.min(toCall, player.chips);
    
    player.bet += actualBet;
    player.chips -= actualBet;
    this.pot += actualBet;

    if (player.chips === 0) player.allIn = true;

    this.nextPlayer();
    return true;
  }

  raise(playerId: string, amount: number): boolean {
    const player = this.getCurrentPlayerIfValid(playerId);
    if (!player) return false;

    const toCall = this.currentBet - player.bet;
    const totalBet = toCall + amount;

    if (totalBet > player.chips) return false; // недостаточно фишек
    if (amount < this.bigBlind) return false; // минимальный рейз = BB

    player.chips -= totalBet;
    player.bet += totalBet;
    this.pot += totalBet;
    this.currentBet = player.bet;

    if (player.chips === 0) player.allIn = true;

    this.lastRaisePosition = player.seat;
    this.nextPlayer();
    return true;
  }

  allIn(playerId: string): boolean {
    const player = this.getCurrentPlayerIfValid(playerId);
    if (!player) return false;

    const allInAmount = player.chips;
    player.bet += allInAmount;
    player.chips = 0;
    this.pot += allInAmount;
    player.allIn = true;

    if (player.bet > this.currentBet) {
      this.currentBet = player.bet;
      this.lastRaisePosition = player.seat;
    }

    this.nextPlayer();
    return true;
  }

  // Переход к следующему игроку или следующей стадии
  private nextPlayer() {
    const next = this.getNextPlayer(this.currentPlayer!);
    
    // Проверка: все ли уравняли ставки
    if (this.isBettingRoundComplete()) {
      this.nextStage();
    } else {
      this.currentPlayer = next;
    }
  }

  private isBettingRoundComplete(): boolean {
    const activePlayers = this.getActivePlayers();
    
    // Все игроки (кроме all-in) сделали ход и уравняли ставку
    const playersWhoCanAct = activePlayers.filter(p => !p.allIn);
    
    if (playersWhoCanAct.length === 0) return true;
    
    const allBetsEqual = playersWhoCanAct.every(p => p.bet === this.currentBet);
    const allActed = this.currentPlayer === this.lastRaisePosition || playersWhoCanAct.length === 1;
    
    return allBetsEqual && allActed;
  }

  private nextStage() {
    // Сброс ставок игроков
    this.seats.forEach(p => {
      if (p) p.bet = 0;
    });
    this.currentBet = 0;

    const activePlayers = this.getActivePlayers();
    
    if (activePlayers.length === 1) {
      // Все сбросили, победитель забирает банк
      this.awards([activePlayers[0]]);
      return;
    }

    switch (this.stage) {
      case 'preflop':
        this.flop();
        this.stage = 'flop';
        break;
      case 'flop':
        this.turn();
        this.stage = 'turn';
        break;
      case 'turn':
        this.river();
        this.stage = 'river';
        break;
      case 'river':
        this.stage = 'showdown';
        this.showdown();
        return;
    }

    this.currentPlayer = this.getNextPlayer(this.dealerPosition);
    this.lastRaisePosition = this.currentPlayer;
  }

  flop() {
    if (!this.deck) return;
    this.communityCards.push(...this.deck.deal(3));
  }

  turn() {
    if (!this.deck) return;
    this.communityCards.push(...this.deck.deal(1));
  }

  river() {
    if (!this.deck) return;
    this.communityCards.push(...this.deck.deal(1));
  }

  showdown() {
    const activePlayers = this.getActivePlayers();

    const results = activePlayers.map((p) => {
      const full = [...p.hand, ...this.communityCards];
      const solved = Hand.solve(full);
      return {
        player: p,
        hand: solved,
        descr: solved.descr,
        rank: solved.rank,
      };
    });

    const winnerHands = Hand.winners(results.map(r => r.hand));
    const winners = results.filter(r => winnerHands.includes(r.hand));

    this.awards(winners.map(w => w.player));

    return {
      results: results.map(r => ({
        id: r.player.id,
        seat: r.player.seat,
        hand: r.player.hand,
        descr: r.descr,
        rank: r.rank,
      })),
      winners: winners.map(w => ({
        id: w.player.id,
        descr: w.descr,
      })),
    };
  }

  private awards(winners: Player[]) {
    const share = Math.floor(this.pot / winners.length);
    winners.forEach(w => {
      w.chips += share;
    });
    this.pot = 0;
    this.stage = 'waiting';
    this.currentPlayer = null;
    
    // Передвижение дилера
    this.dealerPosition = this.getNextSeat(this.dealerPosition);
  }

  // Вспомогательные методы
  private getCurrentPlayerIfValid(playerId: string): Player | null {
    if (this.currentPlayer === null) return null;
    const player = this.seats[this.currentPlayer];
    if (!player || player.id !== playerId || player.folded || player.allIn) {
      return null;
    }
    return player;
  }

  private getActivePlayers(): Player[] {
    return this.seats.filter((p): p is Player => 
      p !== null && !p.folded
    );
  }

  private getNextPlayer(fromSeat: number): number {
    let seat = this.getNextSeat(fromSeat);
    let attempts = 0;
    
    while (attempts < this.seats.length) {
      const player = this.seats[seat];
      if (player && !player.folded && !player.allIn && player.chips > 0) {
        return seat;
      }
      seat = this.getNextSeat(seat);
      attempts++;
    }
    
    return fromSeat;
  }

  private getNextSeat(fromSeat: number): number {
    let seat = (fromSeat + 1) % this.seats.length;
    let attempts = 0;
    
    while (attempts < this.seats.length) {
      if (this.seats[seat] !== null) {
        return seat;
      }
      seat = (seat + 1) % this.seats.length;
      attempts++;
    }
    
    return fromSeat;
  }

  private getSmallBlindPosition(): number {
    return this.getNextSeat(this.dealerPosition);
  }

  private getBigBlindPosition(): number {
    return this.getNextSeat(this.getSmallBlindPosition());
  }

  getState(): GameState {
    return {
      seats: this.seats,
      spectators: this.spectators,
      communityCards: this.communityCards,
      pot: this.pot,
      currentBet: this.currentBet,
      currentPlayer: this.currentPlayer,
      dealerPosition: this.dealerPosition,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      stage: this.stage,
    };
  }

  // Получить состояние для конкретного игрока (скрыть карты других)
  getStateForPlayer(playerId: string): any {
    const state = this.getState();
    return {
      ...state,
      seats: state.seats.map(p => {
        if (!p) return null;
        if (p.id === playerId || this.stage === 'showdown') {
          return p; // показываем карты
        }
        return { ...p, hand: [] }; // скрываем карты
      }),
    };
  }

  setBlinds(small: number, big: number) {
    if (this.stage !== 'waiting') return false;
    this.smallBlind = small;
    this.bigBlind = big;
    return true;
  }
}