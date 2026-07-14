import type { TableConfig } from '../../types/index.js';

export interface PredefinedTable {
  id: string;
  name: string;
  config: TableConfig;
}

/**
 * Predefined poker tables configuration
 * These tables are available for all players.
 *
 * crypto-payments-rake phase 3: buy-in is a 40–100BB range (minBuyIn/maxBuyIn),
 * peg 1 chip = $0.01. A funnel table ($0.01/$0.02) is the onboarding rung.
 * Rake: 5% (rakeBps 500); cap in BB per plan §C.
 */
export const PREDEFINED_TABLES: PredefinedTable[] = [
  {
    id: 'table-funnel-1',
    name: '🐣 Funnel Table',
    config: {
      smallBlind: 1,
      bigBlind: 2,
      maxPlayers: 6,
      turnTime: 30,
      minBuyIn: 80,   // 40BB = $0.80
      maxBuyIn: 200,  // 100BB = $2.00
      category: 'cash',
      rakeBps: 500,
      rakeCapBB: 3,
    },
  },
  {
    id: 'table-beginner-1',
    name: '🌱 Beginner Table #1',
    config: {
      smallBlind: 5,
      bigBlind: 10,
      maxPlayers: 6,
      turnTime: 30,
      minBuyIn: 400,   // 40BB = $4.00
      maxBuyIn: 1000,  // 100BB = $10.00
      category: 'cash',
      rakeBps: 500,
      rakeCapBB: 4,
    },
  },
  {
    id: 'table-beginner-2',
    name: '🌱 Beginner Table #2',
    config: {
      smallBlind: 5,
      bigBlind: 10,
      maxPlayers: 6,
      turnTime: 30,
      minBuyIn: 400,
      maxBuyIn: 1000,
      category: 'cash',
      rakeBps: 500,
      rakeCapBB: 4,
    },
  },
  {
    id: 'table-standard-1',
    name: '⭐ Standard Table #1',
    config: {
      smallBlind: 10,
      bigBlind: 20,
      maxPlayers: 6,
      turnTime: 30,
      minBuyIn: 800,   // 40BB = $8.00
      maxBuyIn: 2000,  // 100BB = $20.00
      category: 'cash',
      rakeBps: 500,
      rakeCapBB: 4,
    },
  },
  {
    id: 'table-standard-2',
    name: '⭐ Standard Table #2',
    config: {
      smallBlind: 10,
      bigBlind: 20,
      maxPlayers: 6,
      turnTime: 30,
      minBuyIn: 800,
      maxBuyIn: 2000,
      category: 'cash',
      rakeBps: 500,
      rakeCapBB: 4,
    },
  },
  {
    id: 'table-pro-1',
    name: '🔥 Pro Table #1',
    config: {
      smallBlind: 25,
      bigBlind: 50,
      maxPlayers: 6,
      turnTime: 20,
      minBuyIn: 2000,  // 40BB = $20.00
      maxBuyIn: 5000,  // 100BB = $50.00
      category: 'cash',
      rakeBps: 500,
      rakeCapBB: 3,
    },
  },
  {
    id: 'table-highstakes-1',
    name: '💎 High Stakes',
    config: {
      smallBlind: 100,
      bigBlind: 200,
      maxPlayers: 6,
      turnTime: 15,
      minBuyIn: 8000,   // 40BB = $80.00
      maxBuyIn: 20000,  // 100BB = $200.00
      category: 'cash',
      rakeBps: 500,
      rakeCapBB: 2.5,
    },
  },
];

/**
 * crypto-payments-rake phase 3: resolve a requested buy-in to a valid chip
 * amount for a table. Clamps into [minBuyIn, maxBuyIn]; a missing/non-integer
 * request defaults to the table maximum. Single source of truth for both the
 * socket handler (balance check + deduction) and TableManager (seating).
 */
export function clampBuyIn(
  requested: number | undefined,
  cfg: { minBuyIn: number; maxBuyIn: number }
): number {
  const r = Number.isInteger(requested) ? (requested as number) : cfg.maxBuyIn;
  return Math.max(cfg.minBuyIn, Math.min(cfg.maxBuyIn, r));
}

/**
 * Get table configuration by ID
 */
export function getTableConfig(id: string): PredefinedTable | undefined {
  return PREDEFINED_TABLES.find((t) => t.id === id);
}

/**
 * Get tables by category
 */
export function getTablesByCategory(category: string): PredefinedTable[] {
  return PREDEFINED_TABLES.filter((t) => t.config.category === category);
}
