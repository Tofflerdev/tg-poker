// server/Deck.ts
// Колода карт и безопасное перемешивание (Fisher-Yates + crypto.randomInt)

import { randomInt } from "crypto";

export default class Deck {
  private cards: string[] = [];

  constructor() {
    const suits = ["s", "h", "d", "c"]; // пики, червы, бубны, трефы
    const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"]; // T = Ten
    this.cards = [];
    for (const suit of suits) {
      for (const rank of ranks) {
        this.cards.push(`${rank}${suit}`); // пример: "As", "Td"
      }
    }
    this.shuffle();
  }

  // Криптографически более надёжное тасование
  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = randomInt(0, i + 1);
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  // Раздать n карт — удаляются из колоды
  deal(n: number): string[] {
    return this.cards.splice(0, n);
  }
}
