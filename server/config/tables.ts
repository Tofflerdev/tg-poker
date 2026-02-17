import type { TableConfig } from '../../types/index.js';

export interface PredefinedTable {
  id: string;
  name: string;
  config: TableConfig;
}

/**
 * Predefined poker tables configuration
 * These tables are available for all players
 */
export const PREDEFINED_TABLES: PredefinedTable[] = [
  {
    id: 'table-beginner-1',
    name: '🌱 Beginner Table #1',
    config: {
      smallBlind: 5,
      bigBlind: 10,
      maxPlayers: 6,
      turnTime: 30,
      buyIn: 500,
      category: 'cash',
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
      buyIn: 500,
      category: 'cash',
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
      buyIn: 1000,
      category: 'cash',
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
      buyIn: 1000,
      category: 'cash',
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
      buyIn: 2500,
      category: 'cash',
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
      buyIn: 10000,
      category: 'cash',
    },
  },
];

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
