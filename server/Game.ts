import crypto from 'crypto';
import Deck from "./Deck.js";
import pkg from "pokersolver";
import { Player, GameState, GameStage, Spectator, ShowdownResult, Pot, PotResult } from "../types/index.js";
import type { PlayerActionEvent, HandCompleteEvent, PlayerActionKind } from '../types/index.js';
const { Hand } = pkg;



export default class Game {
  private tableId: string;
  private seats: (Player | null)[] = Array(6).fill(null);
  private spectators: Spectator[] = [];
  private communityCards: string[] = [];
  private deck: Deck | null = null;
  
  private pots: Pot[] = [];           // Массив потов (основной + сайд-поты)
  private lastRoundBets: number[] = Array(6).fill(0); // Ставки из последнего завершённого раунда
  private currentBet: number = 0;
  private currentPlayer: number | null = null;
  private dealerPosition: number = 0;
  private smallBlind: number = 10;
  private bigBlind: number = 20;
  private stage: GameStage = 'waiting';
  private lastRaisePosition: number | null = null;
  // Размер последнего полного рейза (инкремент, на который вырос currentBet).
  // Задаёт минимальный размер следующего рейза по правилам NLHE. Инициализируется
  // большим блайндом на старте раздачи.
  private lastRaiseSize: number = 20;
  // Вклады игроков, покинувших стол посреди раздачи. Их фишки остаются в банке
  // (игрок их форфейтит), чтобы деньги не «сгорали» при обнулении места (audit #4).
  // Всегда folded — уходящий не может выиграть. Очищается в reset().
  private deadContributions: { playerId: string; amount: number }[] = [];

  private turnTimer: NodeJS.Timeout | null = null;
  private turnExpiresAt: number | null = null;
  private turnTimeLimit = 30000; // ms per turn — set from table config (default 30s)
  private onTurnTimeout: (() => void) | null = null;
  private onStateChange: (() => void) | null = null;
  private onShowdown: ((result: ShowdownResult) => void) | null = null;
  private onPlayerAction: ((evt: PlayerActionEvent) => void) | null = null;
  private onHandComplete: ((evt: HandCompleteEvent) => void) | null = null;
  private currentHandId: string | null = null;
  private handStartChips: Record<number, number> = {};  // seat -> chips at startNextHand

  public lastShowdown: ShowdownResult | null = null;
  public nextHandIn: number | null = null;  // NEW: timestamp когда начнется следующая раздача

  constructor(
    tableId: string = '',
    options?: { smallBlind?: number; bigBlind?: number; turnTimeMs?: number }
  ) {
    this.tableId = tableId;
    if (options?.smallBlind !== undefined) this.smallBlind = options.smallBlind;
    if (options?.bigBlind !== undefined) this.bigBlind = options.bigBlind;
    if (options?.turnTimeMs !== undefined) this.turnTimeLimit = options.turnTimeMs;
  }

  // Общая сумма банка = все фишки, внесённые за раздачу. totalBet каждого игрока
  // накапливается по всем улицам (сбрасывается только в reset()), поэтому сумма
  // totalBet живых мест плюс «мёртвые» вклады ушедших даёт полный банк в любой момент
  // — включая только что покинувших стол (audit #4), без просадки до конца улицы.
  private getTotalPot(): number {
    const seatTotal = this.seats.reduce((sum, player) => sum + (player ? player.totalBet : 0), 0);
    const deadTotal = this.deadContributions.reduce((sum, d) => sum + d.amount, 0);
    return seatTotal + deadTotal;
  }

  // Добавление игрока (разрешаем в любое время)
  // telegramId (stringified) is the durable identity key stored in player.id (RESILIENCE-03)
  addPlayer(telegramId: string, seat: number, chips: number = 1000, telegramIdNumeric?: number, displayName?: string, avatarUrl?: string, socketId?: string, avatarId?: string, isBot?: boolean): boolean {
    if (seat < 0 || seat >= this.seats.length) return false;
    if (this.seats[seat]) return false;

    this.spectators = this.spectators.filter((p) => p.id !== telegramId);

    // Определяем, нужно ли ждать большой блайнд
    // Если стол в waiting ИЛИ нет eligible игроков (стол фактически пуст) - не ждем
    // Иначе ждем ББ
    const eligiblePlayers = this.seats.filter((p): p is Player =>
      p !== null && p.chips > 0 && !p.waitingForBB && !p.sittingOut
    );
    const waitingForBB = this.stage !== 'waiting' && eligiblePlayers.length > 0;

    const player: Player = {
      id: telegramId,      // player.id holds telegramId (durable key)
      socketId,            // mutable transport handle (D-05)
      seat,
      telegramId: telegramIdNumeric,
      displayName,
      avatarUrl,           // DEPRECATED (D-15) — still forwarded during transition
      avatarId,            // Plan 02-02: SeatsDisplay resolves via manifest
      hand: [],
      chips,
      bet: 0,
      totalBet: 0,  // Общая сумма ставок за раздачу
      folded: false,
      allIn: false,
      acted: false,
      showCards: false,
      waitingForBB,  // NEW: ждем ББ если игра уже идет
      sittingOut: false,  // NEW: изначально не отсидиваемся
      isBot: isBot ?? false,  // playtest bot flag (BotDriver acts on this seat)
    };
    this.seats[seat] = player;
    return true;
  }

  // Update the mutable socketId transport handle for a seated player
  updatePlayerSocketId(telegramId: string, newSocketId: string | undefined): void {
    const player = this.seats.find(p => p?.id === telegramId);
    if (player) {
      player.socketId = newSocketId;
    }
  }

  // Получить список игроков, которые могут участвовать в СЛЕДУЮЩЕЙ раздаче
  getEligiblePlayers(): Player[] {
    return this.seats.filter((p): p is Player =>
      p !== null &&
      p.chips > 0 &&
      !p.waitingForBB &&
      !p.sittingOut
    );
  }

  // Проверка, может ли игрок играть в текущей раздаче
  private canPlayerPlayInCurrentHand(player: Player): boolean {
    return player.chips > 0 && !player.waitingForBB && !player.sittingOut;
  }

  addSpectator(id: string): boolean {
    if (!this.spectators.find((p) => p.id === id)) {
      this.spectators.push({ id });
    }
    return true;
  }

  // Удаление игрока с обработкой выхода во время раздачи
  removePlayer(id: string): boolean {
    const player = this.seats.find(p => p?.id === id);
    if (!player) {
      // Игрок может быть spectator
      this.spectators = this.spectators.filter((p) => p.id !== id);
      return true;
    }

    const handActive = this.stage !== 'waiting' && this.stage !== 'showdown';

    // Если игрок в текущей раздаче (есть карты и не сфолдил)
    const isInHand = handActive && player.hand.length > 0 && !player.folded;

    if (isInHand) {
      // Авто-фолд при выходе во время раздачи
      // Если это текущий игрок, сбрасываем и переходим дальше
      const currentPlayerObj = this.currentPlayer !== null ? this.seats[this.currentPlayer] : null;
      if (currentPlayerObj?.id === id) {
        player.folded = true;
        player.acted = true;
        this.nextPlayer();
      } else {
        // Просто помечаем как сфолдившего
        player.folded = true;
      }
    }

    // Сохраняем уже внесённые в этот банк фишки уходящего игрока (audit #4). Иначе
    // при обнулении места его totalBet исчезает из calculatePots и деньги «сгорают»
    // — ни возврата уходящему, ни выигрыша оставшимся. Важно захватить ПОСЛЕ nextPlayer()
    // выше: если тот дошёл до nextStage/showdown, calculatePots уже учёл место (ещё не
    // обнулённое). calculatePots всегда пересчитывается целиком, поэтому двойного учёта нет.
    if (handActive && player.totalBet > 0) {
      this.deadContributions.push({ playerId: player.id, amount: player.totalBet });
    }

    this.seats = this.seats.map((p) => (p?.id === id ? null : p));
    this.spectators = this.spectators.filter((p) => p.id !== id);
    return true;
  }

  // Добровольный сит-аут
  sitOut(playerId: string): boolean {
    const player = this.seats.find(p => p?.id === playerId);
    if (!player) return false;
    player.sittingOut = true;
    return true;
  }

  // Вернуться за стол (будет ждать ББ)
  sitIn(playerId: string): boolean {
    const player = this.seats.find(p => p?.id === playerId);
    if (!player) return false;
    player.sittingOut = false;
    player.waitingForBB = this.stage !== 'waiting';
    return true;
  }

  reset() {
    this.stopTurnTimer();
    this.deck = null;
    this.communityCards = [];
    this.pots = [];
    this.lastRoundBets = Array(6).fill(0);
    this.currentBet = 0;
    this.currentPlayer = null;
    this.stage = 'waiting';
    this.lastRaisePosition = null;
    this.lastRaiseSize = this.bigBlind;
    this.deadContributions = [];
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
        // НЕ сбрасываем waitingForBB и sittingOut - они сохраняются между раздачами
      }
    });
  }

  // Legacy start() - оставляем для обратной совместимости
  start() {
    this.startNextHand();
  }

  // Новый метод: автоматический старт следующей раздачи
  startNextHand(): boolean {
    // Передвигаем дилера перед стартом новой раздачи
    this.dealerPosition = this.getNextSeatForDealer(this.dealerPosition);

    // Активируем игроков, у которых наступил ББ
    this.activateWaitingPlayers();

    const eligiblePlayers = this.getEligiblePlayers();

    if (eligiblePlayers.length < 2) {
      this.stage = 'waiting';
      return false;
    }

    this.currentHandId = crypto.randomUUID();
    this.handStartChips = {};
    for (const p of this.seats) if (p) this.handStartChips[p.seat] = p.chips;

    this.reset();
    this.deck = new Deck();
    this.deck.shuffle();
    this.stage = 'preflop';

    // Раздача карт только eligible игрокам
    this.seats.forEach((p) => {
      if (p && this.canPlayerPlayInCurrentHand(p)) {
        p.hand = this.deck!.deal(2);
      }
    });

    // Установка блайндов
    this.postBlinds();
    
    // Первый игрок после большого блайнда
    this.currentPlayer = this.getNextPlayer(this.getBigBlindPosition());
    this.startTurnTimer();
    
    return true;
  }

  // Активировать игроков, которые ждали ББ
  private activateWaitingPlayers(): void {
    const bbPosition = this.getNextSeatForDealer(this.getNextSeatForDealer(this.dealerPosition));
    
    this.seats.forEach((p) => {
      if (p && p.waitingForBB) {
        // Если ББ достиг позиции игрока - активируем
        if (p.seat === bbPosition) {
          p.waitingForBB = false;
        }
      }
    });
  }

  // Получить следующее место для дилера (пропускаем пустые и отсидивающиеся)
  private getNextSeatForDealer(fromSeat: number): number {
    let seat = (fromSeat + 1) % this.seats.length;
    let attempts = 0;
    
    while (attempts < this.seats.length) {
      const player = this.seats[seat];
      if (player && player.chips > 0 && !player.sittingOut) {
        return seat;
      }
      seat = (seat + 1) % this.seats.length;
      attempts++;
    }
    
    return fromSeat;
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
    this.onPlayerAction?.({
      tableId: this.tableId,
      telegramId: String(player.telegramId ?? player.id),
      seat: player.seat,
      action: 'fold' as PlayerActionKind,
      amount: 0,
      allIn: player.allIn,
      totalBetThisStreet: player.bet,
      potAfter: this.getTotalPot(),
    });
    this.nextPlayer();
    return true;
  }

  check(playerId: string): boolean {
    const player = this.getCurrentPlayerIfValid(playerId);
    if (!player) return false;
    if (player.bet < this.currentBet) return false; // нельзя чекать, нужно коллировать

    player.acted = true;
    this.onPlayerAction?.({
      tableId: this.tableId,
      telegramId: String(player.telegramId ?? player.id),
      seat: player.seat,
      action: 'check' as PlayerActionKind,
      amount: 0,
      allIn: player.allIn,
      totalBetThisStreet: player.bet,
      potAfter: this.getTotalPot(),
    });
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
    this.onPlayerAction?.({
      tableId: this.tableId,
      telegramId: String(player.telegramId ?? player.id),
      seat: player.seat,
      action: 'call' as PlayerActionKind,
      amount: actualBet,
      allIn: player.allIn,
      totalBetThisStreet: player.bet,
      potAfter: this.getTotalPot(),
    });
    this.nextPlayer();
    return true;
  }

  raise(playerId: string, amount: number): boolean {
    const player = this.getCurrentPlayerIfValid(playerId);
    if (!player) return false;

    // Защита от некорректного ввода: amount должен быть целым положительным числом.
    // Без этого NaN/строка/дробь проходят проверки ниже (NaN сравнения всегда false)
    // и необратимо ломают стек, банк и currentBet.
    if (!Number.isSafeInteger(amount) || amount <= 0) return false;

    const toCall = this.currentBet - player.bet;
    const totalBet = toCall + amount;

    if (totalBet > player.chips) return false;
    // Мин-рейз по правилам NLHE: инкремент рейза не меньше размера последнего
    // рейза (для первого рейза lastRaiseSize инициализируется большим блайндом).
    // Раньше требовался только >= bigBlind, что позволяло нелегальные мини-ре-рейзы (audit #9).
    if (amount < this.lastRaiseSize) return false;

    const prevBet = player.bet;
    player.chips -= totalBet;
    player.bet += totalBet;
    player.totalBet += totalBet;
    this.currentBet = player.bet;
    this.lastRaiseSize = amount; // размер этого рейза задаёт минимум для следующего

    if (player.chips === 0) player.allIn = true;

    // ОБНОВЛЕННАЯ ЛОГИКА:
    // Райзер походил, но все остальные теперь должны ответить заново
    this.seats.forEach(p => {
        if (p) p.acted = false;
    });
    player.acted = true;

    this.onPlayerAction?.({
      tableId: this.tableId,
      telegramId: String(player.telegramId ?? player.id),
      seat: player.seat,
      action: 'raise' as PlayerActionKind,
      amount: player.bet - prevBet,
      allIn: player.allIn,
      totalBetThisStreet: player.bet,
      potAfter: this.getTotalPot(),
    });
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
      const raiseIncrement = player.bet - this.currentBet;
      const isFullRaise = raiseIncrement >= this.lastRaiseSize;
      this.currentBet = player.bet;

      if (isFullRaise) {
        // Полноценный рейз: обновляем минимум и переоткрываем торги остальным.
        this.lastRaiseSize = raiseIncrement;
        this.seats.forEach(p => {
          if (p && p !== player && !p.folded && !p.allIn) p.acted = false;
        });
      }
      // Андер-рейз олл-ином (меньше полного рейза) НЕ переоткрывает торги для уже
      // походивших игроков (audit #9). Те, чья ставка меньше новой currentBet, всё
      // равно получат ход через isBettingRoundComplete и смогут уравнять/сбросить.
    }

    this.onPlayerAction?.({
      tableId: this.tableId,
      telegramId: String(player.telegramId ?? player.id),
      seat: player.seat,
      action: 'allin' as PlayerActionKind,
      amount: allInAmount,
      allIn: player.allIn,
      totalBetThisStreet: player.bet,
      potAfter: this.getTotalPot(),
    });
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
    // Собираем все вклады игроков (включая сфолдивших) плюс «мёртвые» вклады
    // игроков, покинувших раздачу (audit #4) — они всегда folded, не могут выиграть,
    // но их фишки остаются в банке для оставшихся игроков.
    const seatContributions = this.seats
      .filter((p): p is Player => p !== null && p.totalBet > 0)
      .map(p => ({
        playerId: p.id,
        amount: p.totalBet,
        folded: p.folded
      }));
    const deadContribs = this.deadContributions.map(d => ({
      playerId: d.playerId,
      amount: d.amount,
      folded: true,
    }));
    const contributions = [...seatContributions, ...deadContribs]
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
        // Настоящий сайд-пот возникает ТОЛЬКО когда набор претендентов меняется
        // (кто-то all-in за меньшую сумму). Если состав победителей совпадает с
        // предыдущим уровнем — это тот же пот (напр. сфолдивший блайнд внёс меньше,
        // или некол­лированная ставка), просто доливаем, а не плодим фантомный side pot.
        const prev = pots[pots.length - 1];
        if (prev && Game.samePlayerSet(prev.eligiblePlayers, eligibleWinners)) {
          prev.amount += potAmount;
        } else {
          pots.push({
            amount: potAmount,
            eligiblePlayers: eligibleWinners,
            name: pots.length === 0 ? "Main Pot" : `Side Pot ${pots.length}`
          });
        }
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

  // Сравнение двух наборов id игроков без учёта порядка
  private static samePlayerSet(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const setB = new Set(b);
    return a.every(id => setB.has(id));
  }

  // Порядок места относительно дилера: место сразу слева от баттона = 0.
  // Используется для детерминированной раздачи нечётного остатка сплит-пота.
  private seatOrderFromDealer(seat: number): number {
    const n = this.seats.length;
    return (seat - this.dealerPosition - 1 + n) % n;
  }

  private nextStage() {
    // Рассчитываем поты в конце раунда торговли
    this.pots = this.calculatePots();

    // Сохраняем ставки текущего раунда перед сбросом (для анимации фишек на клиенте)
    this.lastRoundBets = this.seats.map(p => p ? p.bet : 0);

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

      // Snapshot the pot structure BEFORE clearing — oracle/analysis needs it.
      const potsSnapshot: Pot[] = this.pots.map(p => ({ amount: p.amount, eligiblePlayers: [...p.eligiblePlayers], name: p.name }));
      this.pots = [];
      this.currentPlayer = null;

      // Переключаем стадию, auto-start сработает через Table.scheduleNextHand()
      this.stage = 'showdown';
      if (this.currentHandId) {
        const handCompleteEvt: HandCompleteEvent = {
          handId: this.currentHandId,
          tableId: this.tableId,
          completedAt: new Date(),
          board: [...this.communityCards],
          perPlayer: this.seats.filter((p): p is NonNullable<typeof p> => p !== null).map(p => ({
            telegramId: String(p.telegramId ?? p.id),
            seat: p.seat,
            holeCards: [...p.hand],
            finalChips: p.chips,
            netDelta: p.chips - (this.handStartChips[p.seat] ?? p.chips),
            won: p.id === winner.id,
            showedDown: false,
            contributed: p.totalBet,
          })),
          pots: potsSnapshot,
        };
        this.onHandComplete?.(handCompleteEvt);
        this.currentHandId = null;
      }
      if (this.onShowdown) {
        this.onShowdown(this.lastShowdown!);
      }
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
        const result = this.showdown();
        if (this.onShowdown) {
          this.onShowdown(result);
        }
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
      
      // Распределяем пот. Нечётный остаток (odd chip) не теряется: по правилам
      // покера лишние фишки достаются игрокам ближе всего слева от баттона.
      const base = Math.floor(pot.amount / winners.length);
      const remainder = pot.amount - base * winners.length;
      const ordered = [...winners].sort(
        (a, b) => this.seatOrderFromDealer(a.player.seat) - this.seatOrderFromDealer(b.player.seat)
      );
      ordered.forEach((w, i) => {
        w.player.chips += base + (i < remainder ? 1 : 0);
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

    // Snapshot the pot structure BEFORE clearing — oracle/analysis needs it.
    const potsSnapshot: Pot[] = this.pots.map(p => ({ amount: p.amount, eligiblePlayers: [...p.eligiblePlayers], name: p.name }));
    this.pots = [];
    this.stage = 'showdown';
    this.currentPlayer = null;
    this.stopTurnTimer();

    // Дилер передвинется при старте следующей раздачи в startNextHand()

    if (this.currentHandId) {
      const winnerIds = new Set(this.lastShowdown.winners.map(w => w.id));
      const handCompleteEvt: HandCompleteEvent = {
        handId: this.currentHandId,
        tableId: this.tableId,
        completedAt: new Date(),
        board: [...this.communityCards],
        perPlayer: this.seats.filter((p): p is NonNullable<typeof p> => p !== null).map(p => ({
          telegramId: String(p.telegramId ?? p.id),
          seat: p.seat,
          holeCards: [...p.hand],
          finalChips: p.chips,
          netDelta: p.chips - (this.handStartChips[p.seat] ?? p.chips),
          won: winnerIds.has(p.id),
          showedDown: p.showCards || (!p.folded),
          contributed: p.totalBet,
        })),
        pots: potsSnapshot,
      };
      this.onHandComplete?.(handCompleteEvt);
      this.currentHandId = null;
    }

    return this.lastShowdown;
  }

  // Вспомогательные методы
  private getCurrentPlayerIfValid(playerId: string): Player | null {
    if (this.currentPlayer === null) return null;
    const player = this.seats[this.currentPlayer];
    if (!player || player.id !== playerId || player.folded || player.allIn || player.waitingForBB) {
      return null;
    }
    return player;
  }

  private getActivePlayers(): Player[] {
    return this.seats.filter((p): p is Player =>
      p !== null && !p.folded && !p.waitingForBB
    );
  }

  private getNextPlayer(fromSeat: number): number {
    let seat = this.getNextSeat(fromSeat);
    let attempts = 0;
    
    while (attempts < this.seats.length) {
      const player = this.seats[seat];
      if (player && !player.folded && !player.allIn && player.chips > 0 && !player.waitingForBB) {
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

  // Следующее место с игроком, который РЕАЛЬНО играет эту раздачу (не пустое,
  // не sit-out, не waitingForBB, есть фишки). Используется для позиций блайндов,
  // чтобы блайнд не назначался отсиживающемуся/ждущему ББ игроку (audit #7).
  private getNextEligibleSeat(fromSeat: number): number {
    let seat = (fromSeat + 1) % this.seats.length;
    let attempts = 0;
    while (attempts < this.seats.length) {
      const player = this.seats[seat];
      if (player && this.canPlayerPlayInCurrentHand(player)) {
        return seat;
      }
      seat = (seat + 1) % this.seats.length;
      attempts++;
    }
    return fromSeat;
  }

  private getSmallBlindPosition(): number {
    // Хедз-ап (ровно 2 участника): баттон ставит малый блайнд и ходит первым
    // на префлопе (audit #8). В остальных случаях SB — первый eligible слева от баттона.
    if (this.getEligiblePlayers().length === 2) {
      const dealer = this.seats[this.dealerPosition];
      if (dealer && this.canPlayerPlayInCurrentHand(dealer)) {
        return this.dealerPosition;
      }
    }
    return this.getNextEligibleSeat(this.dealerPosition);
  }

  private getBigBlindPosition(): number {
    return this.getNextEligibleSeat(this.getSmallBlindPosition());
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
      nextHandIn: this.nextHandIn,
      lastRoundBets: this.lastRoundBets,
    };
  }

  private startTurnTimer() {
    this.stopTurnTimer();
    if (this.currentPlayer === null) return;

    this.turnExpiresAt = Date.now() + this.turnTimeLimit;

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
    }, this.turnTimeLimit);
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

        if (p.id === playerId) return this.toPublicPlayer(p);

        // Вскрываем карты, если:
        // 1. Это шоудаун (и не победа фолдом)
        // 2. Это ситуация All-In runout
        const shouldReveal = (this.stage === 'showdown' && !isWinByFold) || isAllInRunout;

        if (!p.folded) {
          if (shouldReveal) {
            return this.toPublicPlayer(p);
          }
          // Если победа фолдом, показываем только если игрок захотел
          if (this.stage === 'showdown' && isWinByFold && p.showCards) {
            return this.toPublicPlayer(p);
          }
        }

        // Скрываем карты соперника
        return this.toPublicPlayer({ ...p, hand: p.hand.map(() => "back") });
      }),
    };
  }

  // Публичное представление игрока для бродкаста: убираем транспортный socketId и
  // числовой telegramId — клиенту они не нужны (он матчит своё место по строковому
  // player.id), а их рассылка утекала бы всем за столом (audit #6).
  private toPublicPlayer(p: Player): Omit<Player, 'socketId' | 'telegramId'> {
    const { socketId: _socketId, telegramId: _telegramId, ...pub } = p;
    return pub;
  }

  // Обновляет блайнды. Значения читаются только в postBlinds() на старте раздачи,
  // поэтому вызов между раздачами (или из админки) корректно применится к следующей
  // раздаче и не влияет на текущую. Игнорирует некорректный ввод.
  setBlinds(small: number, big: number): boolean {
    if (!Number.isSafeInteger(small) || !Number.isSafeInteger(big)) return false;
    if (small <= 0 || big <= 0) return false;
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

  public setOnPlayerAction(cb: (evt: PlayerActionEvent) => void): void {
    this.onPlayerAction = cb;
  }

  public setOnHandComplete(cb: (evt: HandCompleteEvent) => void): void {
    this.onHandComplete = cb;
  }
}
