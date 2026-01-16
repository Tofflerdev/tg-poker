import Deck from "./Deck.js";
import pkg from "pokersolver";
import { Player, GameState, GameStage, Spectator, ShowdownResult, Pot, PotResult } from "../types/index.js";
const { Hand } = pkg;



export default class Game {
  private seats: (Player | null)[] = Array(6).fill(null);
  private spectators: Spectator[] = [];
  private communityCards: string[] = [];
  private deck: Deck | null = null;
  
  private pots: Pot[] = [];           // Массив потов (основной + сайд-поты)
  private currentBet: number = 0;
  private currentPlayer: number | null = null;
  private dealerPosition: number = 0;
  private smallBlind: number = 10;
  private bigBlind: number = 20;
  private stage: GameStage = 'waiting';
  private lastRaisePosition: number | null = null;

  private turnTimer: NodeJS.Timeout | null = null;
  private turnExpiresAt: number | null = null;
  private readonly TURN_TIME_LIMIT = 30000; // 30 seconds
  private onTurnTimeout: (() => void) | null = null;
  private onStateChange: (() => void) | null = null;
  private onShowdown: ((result: ShowdownResult) => void) | null = null;

  public lastShowdown: ShowdownResult | null = null;

  // Вспомогательный метод для получения общей суммы всех потов
  private getTotalPot(): number {
    return this.pots.reduce((sum, pot) => sum + pot.amount, 0);
  }

  // Добавление игрока
  addPlayer(id: string, seat: number, chips: number = 1000): boolean {
    if (seat < 0 || seat >= this.seats.length) return false;
    if (this.seats[seat]) return false;
    if (this.stage !== 'waiting' && this.stage !== 'showdown') return false; // нельзя добавлять во время игры

    this.spectators = this.spectators.filter((p) => p.id !== id);

    const player: Player = {
      id,
      seat,
      hand: [],
      chips,
      bet: 0,
      totalBet: 0,  // Общая сумма ставок за раздачу
      folded: false,
      allIn: false,
      acted: false,
      showCards: false,
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
    this.stopTurnTimer();
    this.deck = null;
    this.communityCards = [];
    this.pots = [];
    this.currentBet = 0;
    this.currentPlayer = null;
    this.stage = 'waiting';
    this.lastRaisePosition = null;
    this.lastShowdown = null;
    
    this.seats.forEach((p) => {
      if (p) {
        p.hand = [];
        p.bet = 0;
        p.totalBet = 0;
        p.folded = false;
        p.allIn = false;
        p.acted = false;
        p.showCards = false;
      }
    });
  }

  start() {
    const playersCanPlay = this.seats.filter(p => p !== null && p.chips > 0);
    
    if (playersCanPlay.length < 2) {
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
    this.startTurnTimer();
  }

  private postBlinds() {
    const sbPos = this.getSmallBlindPosition();
    const bbPos = this.getBigBlindPosition();

    const sbPlayer = this.seats[sbPos];
    const bbPlayer = this.seats[bbPos];

    if (sbPlayer) {
      const sbAmount = Math.min(this.smallBlind, sbPlayer.chips);
      sbPlayer.bet = sbAmount;
      sbPlayer.totalBet += sbAmount;
      sbPlayer.chips -= sbAmount;
      if (sbPlayer.chips === 0) sbPlayer.allIn = true;
    }

    if (bbPlayer) {
      const bbAmount = Math.min(this.bigBlind, bbPlayer.chips);
      bbPlayer.bet = bbAmount;
      bbPlayer.totalBet += bbAmount;
      bbPlayer.chips -= bbAmount;
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
    player.acted = true;
    this.nextPlayer();
    return true;
  }

  check(playerId: string): boolean {
    const player = this.getCurrentPlayerIfValid(playerId);
    if (!player) return false;
    if (player.bet < this.currentBet) return false; // нельзя чекать, нужно коллировать

    player.acted = true;
    this.nextPlayer();
    return true;
  }

  call(playerId: string): boolean {
    const player = this.getCurrentPlayerIfValid(playerId);
    if (!player) return false;

    const toCall = this.currentBet - player.bet;
    const actualBet = Math.min(toCall, player.chips);
    
    player.bet += actualBet;
    player.totalBet += actualBet;
    player.chips -= actualBet;

    if (player.chips === 0) player.allIn = true;

    player.acted = true;
    this.nextPlayer();
    return true;
  }

  raise(playerId: string, amount: number): boolean {
    const player = this.getCurrentPlayerIfValid(playerId);
    if (!player) return false;

    const toCall = this.currentBet - player.bet;
    const totalBet = toCall + amount;

    if (totalBet > player.chips) return false;
    if (amount < this.bigBlind) return false;

    player.chips -= totalBet;
    player.bet += totalBet;
    player.totalBet += totalBet;
    this.currentBet = player.bet;

    if (player.chips === 0) player.allIn = true;

    // ОБНОВЛЕННАЯ ЛОГИКА:
    // Райзер походил, но все остальные теперь должны ответить заново
    this.seats.forEach(p => {
        if (p) p.acted = false; 
    });
    player.acted = true; 

    this.nextPlayer();
    return true;
  }

  showCards(playerId: string): boolean {
    const player = this.seats.find(p => p?.id === playerId);
    if (!player) return false;
    
    // Можно показывать карты только на шоудауне
    if (this.stage !== 'showdown') return false;

    player.showCards = true;
    return true;
  }

  allIn(playerId: string): boolean {
    const player = this.getCurrentPlayerIfValid(playerId);
    if (!player) return false;

    const allInAmount = player.chips;
    player.bet += allInAmount;
    player.totalBet += allInAmount;
    player.chips = 0;
    player.allIn = true;
    player.acted = true;

    if (player.bet > this.currentBet) {
      this.currentBet = player.bet;
      // Если это рейз, сбрасываем acted у других
      this.seats.forEach(p => {
          if (p && p !== player) p.acted = false;
      });
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
      this.startTurnTimer();
    }
  }

  private isBettingRoundComplete(): boolean {
    const activePlayers = this.getActivePlayers();
    const playersWhoCanAct = activePlayers.filter(p => !p.allIn);
    
    if (playersWhoCanAct.length === 0) return true;
    
    // Проверяем:
    // 1. Все ставки равны текущей
    // 2. У всех стоит флаг acted = true
    return playersWhoCanAct.every(p => p.bet === this.currentBet && p.acted);
  }

  // Алгоритм расчета потов (основной + сайд-поты)
  private calculatePots(): Pot[] {
    // Собираем все вклады игроков (включая сфолдивших)
    const contributions = this.seats
      .filter((p): p is Player => p !== null && p.totalBet > 0)
      .map(p => ({
        playerId: p.id,
        amount: p.totalBet,
        folded: p.folded
      }))
      .sort((a, b) => a.amount - b.amount);

    if (contributions.length === 0) return [];

    const pots: Pot[] = [];
    let previousLevel = 0;

    // Получаем уникальные уровни вкладов
    const uniqueLevels = [...new Set(contributions.map(c => c.amount))];
    
    for (const level of uniqueLevels) {
      const levelDiff = level - previousLevel;
      
      // Игроки, которые внесли как минимум эту сумму
      const eligibleContributors = contributions.filter(c => c.amount >= level);
      
      // Только не сфолдившие игроки могут ВЫИГРАТЬ (но сфолдившие все равно вносят вклад)
      const eligibleWinners = eligibleContributors
        .filter(c => !c.folded)
        .map(c => c.playerId);
      
      const potAmount = levelDiff * eligibleContributors.length;
      
      if (potAmount > 0 && eligibleWinners.length > 0) {
        pots.push({
          amount: potAmount,
          eligiblePlayers: eligibleWinners,
          name: pots.length === 0 ? "Main Pot" : `Side Pot ${pots.length}`
        });
      } else if (potAmount > 0 && eligibleWinners.length === 0) {
        // Все eligible игроки сфолдили - добавляем к предыдущему поту
        if (pots.length > 0) {
          pots[pots.length - 1].amount += potAmount;
        }
      }
      
      previousLevel = level;
    }

    return pots;
  }

  private nextStage() {
    // Рассчитываем поты в конце раунда торговли
    this.pots = this.calculatePots();

    // Сброс ставок текущего раунда И флагов acted
    this.seats.forEach(p => {
      if (p) {
        p.bet = 0;
        p.acted = false; // <--- Новый раунд, никто еще не ходил
      }
    });
    this.currentBet = 0;

    const activePlayers = this.getActivePlayers();
    
    // Если остался только один игрок - он победитель
    if (activePlayers.length === 1) {
      const winner = activePlayers[0];
      
      // Выдаем все поты победителю
      const totalWon = this.getTotalPot();
      winner.chips += totalWon;

      // Создаем искусственный результат "showdown", чтобы фронтенд понял, что игра окончена
      this.lastShowdown = {
        results: [], // Пустой список результатов, т.к. карты не сравнивались
        potResults: this.pots.map(pot => ({
          potName: pot.name,
          amount: pot.amount,
          winners: [{ id: winner.id, descr: "Win by Fold" }]
        })),
        winners: [{
          id: winner.id,
          descr: "Win by Fold" // Описание победы
        }],
      };

      this.pots = [];
      this.currentPlayer = null;
      
      // Передвижение дилера
      this.dealerPosition = this.getNextSeat(this.dealerPosition);

      // Переключаем стадию, чтобы появилась кнопка "Next Hand"
      this.stage = 'showdown';
      return;
    }

    // Проверяем, есть ли игроки, которые могут действовать
    const playersWhoCanAct = activePlayers.filter(p => !p.allIn);
    const allPlayersAllIn = playersWhoCanAct.length <= 1;

    // Если все игроки в all-in (или остался только один, кто может действовать),
    // автоматически доигрываем до showdown
    if (allPlayersAllIn) {
      this.runOutBoard();
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

    // Начинает игрок слева от дилера
    this.currentPlayer = this.getNextPlayer(this.dealerPosition);
    this.startTurnTimer();
  }

  // Автоматически доигрывает борд до конца (когда все игроки all-in)
  private async runOutBoard() {
    this.currentPlayer = null;
    this.stopTurnTimer();
    
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const notify = () => {
        if (this.onStateChange) this.onStateChange();
    };

    // Выкладываем оставшиеся карты с задержкой
    if (this.stage === 'preflop') {
        await delay(1000);
        this.flop();
        this.stage = 'flop';
        notify();
    }

    if (this.stage === 'flop') {
        await delay(1000);
        this.turn();
        this.stage = 'turn';
        notify();
    }

    if (this.stage === 'turn') {
        await delay(1000);
        this.river();
        this.stage = 'river';
        notify();
    }

    await delay(1000);

    // Переходим к showdown
    this.stage = 'showdown';
    const result = this.showdown();
    notify();

    if (this.onShowdown) {
        this.onShowdown(result);
    }
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

  showdown(): ShowdownResult {
    // Финальный расчет потов
    this.pots = this.calculatePots();
    
    const activePlayers = this.getActivePlayers();

    // Решаем руки для всех активных игроков
    const playerHands = activePlayers.map((p) => {
      const full = [...p.hand, ...this.communityCards];
      const solved = Hand.solve(full);
      return {
        player: p,
        hand: solved,
        descr: solved.descr,
        rank: solved.rank,
      };
    });

    // Обрабатываем каждый пот отдельно
    const potResults: PotResult[] = [];
    
    for (const pot of this.pots) {
      // Фильтруем только eligible игроков для этого пота
      const eligibleHands = playerHands.filter(ph => 
        pot.eligiblePlayers.includes(ph.player.id)
      );
      
      if (eligibleHands.length === 0) continue;
      
      // Находим победителей для этого пота
      const winnerHands = Hand.winners(eligibleHands.map(h => h.hand));
      const winners = eligibleHands.filter(h => winnerHands.includes(h.hand));
      
      // Распределяем пот
      const share = Math.floor(pot.amount / winners.length);
      winners.forEach(w => {
        w.player.chips += share;
      });
      
      potResults.push({
        potName: pot.name,
        amount: pot.amount,
        winners: winners.map(w => ({
          id: w.player.id,
          descr: w.descr
        }))
      });
    }

    // Формируем результат showdown
    this.lastShowdown = {
      results: playerHands.map(ph => ({
        id: ph.player.id,
        seat: ph.player.seat,
        hand: ph.player.hand, 
        descr: ph.descr,
        rank: ph.rank,
      })),
      potResults: potResults,
      winners: potResults.flatMap(pr => pr.winners),
    };

    this.pots = [];
    this.stage = 'showdown';
    this.currentPlayer = null;
    this.stopTurnTimer();
    
    // Передвижение дилера
    this.dealerPosition = this.getNextSeat(this.dealerPosition);

    return this.lastShowdown;
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
      pots: this.pots,
      totalPot: this.getTotalPot(),
      currentBet: this.currentBet,
      currentPlayer: this.currentPlayer,
      dealerPosition: this.dealerPosition,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      stage: this.stage,
      turnExpiresAt: this.turnExpiresAt,
    };
  }

  private startTurnTimer() {
    this.stopTurnTimer();
    if (this.currentPlayer === null) return;

    this.turnExpiresAt = Date.now() + this.TURN_TIME_LIMIT;
    
    const currentPlayerId = this.seats[this.currentPlayer]?.id;
    if (!currentPlayerId) return;

    this.turnTimer = setTimeout(() => {
      console.log(`Time out for player ${currentPlayerId}`);
      // Если игрок все еще текущий (на всякий случай проверка)
      if (this.seats[this.currentPlayer!]?.id === currentPlayerId) {
        this.fold(currentPlayerId);
        if (this.onTurnTimeout) {
          this.onTurnTimeout();
        }
      }
    }, this.TURN_TIME_LIMIT);
  }

  private stopTurnTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    this.turnExpiresAt = null;
  }

  // Получить состояние для конкретного игрока (скрыть карты других)
  getStateForPlayer(playerId: string): any {
    const state = this.getState();
    const isWinByFold = this.lastShowdown && this.lastShowdown.results.length === 0;

    // Определяем, нужно ли вскрывать карты досрочно (ситуация All-In)
    const activePlayers = state.seats.filter((p): p is Player => p !== null && !p.folded);
    const nonAllInPlayers = activePlayers.filter(p => !p.allIn);
    const isAllInRunout = this.stage !== 'waiting' &&
                          this.currentPlayer === null &&
                          activePlayers.length > 1 &&
                          nonAllInPlayers.length <= 1;

    return {
      ...state,
      seats: state.seats.map(p => {
        if (!p) return null;
        
        if (p.id === playerId) return p;

        // Вскрываем карты, если:
        // 1. Это шоудаун (и не победа фолдом)
        // 2. Это ситуация All-In runout
        const shouldReveal = (this.stage === 'showdown' && !isWinByFold) || isAllInRunout;

        if (!p.folded) {
          if (shouldReveal) {
            return p;
          }
          // Если победа фолдом, показываем только если игрок захотел
          if (this.stage === 'showdown' && isWinByFold && p.showCards) {
            return p;
          }
        }

        return { ...p, hand: p.hand.map(() => "back") }; // скрываем карты
      }),
    };
  }

  setBlinds(small: number, big: number) {
    if (this.stage !== 'waiting') return false;
    this.smallBlind = small;
    this.bigBlind = big;
    return true;
  }

  public setOnTurnTimeout(callback: () => void) {
    this.onTurnTimeout = callback;
  }

  public setOnStateChange(callback: () => void) {
    this.onStateChange = callback;
  }

  public setOnShowdown(callback: (result: ShowdownResult) => void) {
    this.onShowdown = callback;
  }
}
