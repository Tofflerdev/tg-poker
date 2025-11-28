import Deck from "./Deck.js";
import pkg from "pokersolver";
const { Hand } = pkg;
export default class Game {
    seats = Array(6).fill(null);
    spectators = [];
    communityCards = [];
    deck = null;
    // Добавление игрока
    addPlayer(id, seat) {
        if (seat !== undefined) {
            // Игрок хочет занять место
            if (seat < 0 || seat >= this.seats.length)
                return false;
            if (this.seats[seat])
                return false; // место занято
            // Удаляем из зрителей, если был
            this.spectators = this.spectators.filter((p) => p.id !== id);
            const player = { id, seat, hand: [] };
            this.seats[seat] = player;
            return true;
        }
        else {
            // Игрок наблюдатель
            if (!this.spectators.find((p) => p.id === id)) {
                this.spectators.push({ id, hand: [] });
            }
            return true;
        }
    }
    removePlayer(id) {
        this.seats = this.seats.map((p) => (p?.id === id ? null : p));
        this.spectators = this.spectators.filter((p) => p.id !== id);
    }
    reset() {
        this.deck = null;
        this.communityCards = [];
        this.seats.forEach((p) => {
            if (p)
                p.hand = [];
        });
    }
    start() {
        this.deck = new Deck();
        this.deck.shuffle();
        this.communityCards = [];
        this.seats.forEach((p) => {
            if (p)
                p.hand = this.deck.deal(2);
        });
    }
    flop() {
        if (!this.deck)
            return;
        this.communityCards.push(...this.deck.deal(3));
    }
    turn() {
        if (!this.deck)
            return;
        this.communityCards.push(...this.deck.deal(1));
    }
    river() {
        if (!this.deck)
            return;
        this.communityCards.push(...this.deck.deal(1));
    }
    showdown() {
        const seatedPlayers = this.seats.filter((p) => p !== null);
        const results = seatedPlayers.map((p) => {
            const full = [...p.hand, ...this.communityCards];
            const solved = Hand.solve(full);
            return {
                id: p.id,
                seat: p.seat,
                hand: p.hand,
                descr: solved.descr,
                rank: solved.rank,
            };
        });
        const winnerHands = Hand.winners(results.map((r) => Hand.solve([...r.hand, ...this.communityCards])));
        return {
            results,
            winners: winnerHands.map((w) => w.descr),
        };
    }
    getState() {
        return {
            seats: this.seats,
            spectators: this.spectators,
            communityCards: this.communityCards,
        };
    }
}
