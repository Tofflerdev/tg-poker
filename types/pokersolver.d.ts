declare module "pokersolver" {
  export type Card = string;

  export class Hand {
    name: string;
    descr: string;
    rank: number;
    cards: Card[];

    static solve(cards: Card[], game?: string): Hand;
    static winners(hands: Hand[]): Hand[];
  }

  export class CardGroup {
    static fromString(cards: string): CardGroup;
    toString(): string;
    length: number;
    value: string[];
  }
}