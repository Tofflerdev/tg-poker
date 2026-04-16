import { Table } from './models/Table.js';
import { userStorage } from './models/User.js';
import type { TableConfig, TableInfo, TableStatus } from '../types/index.js';

/**
 * TableManager manages all poker tables in the system
 * Handles table creation, player assignment, and lookups.
 * All player maps are keyed by telegramId (string) — RESILIENCE-03.
 */
export class TableManager {
  private tables: Map<string, Table> = new Map();
  private playerToTable: Map<string /* telegramId */, string /* tableId */> = new Map();
  private socketByTelegram: Map<string /* telegramId */, string /* socketId */> = new Map(); // D-06

  constructor() {
    // Initialize with predefined tables
    this.initializePredefinedTables();
  }

  /**
   * Initialize predefined tables from config
   */
  private initializePredefinedTables(): void {
    // Import predefined tables configuration
    import('./config/tables.js').then(({ PREDEFINED_TABLES }) => {
      PREDEFINED_TABLES.forEach((config) => {
        this.createTable(config.id, config.name, config.config);
      });
      console.log(`[TableManager] Initialized ${PREDEFINED_TABLES.length} predefined tables`);
    }).catch((err) => {
      console.error('[TableManager] Failed to load predefined tables:', err);
      // Create default tables if config fails
      this.createDefaultTables();
    });
  }

  /**
   * Create default tables if no config available
   */
  private createDefaultTables(): void {
    const defaultTables: { id: string; name: string; config: TableConfig }[] = [
      {
        id: 'table-1',
        name: 'Beginner Table',
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
        id: 'table-2',
        name: 'Standard Table',
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
        id: 'table-3',
        name: 'Pro Table',
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
        id: 'table-4',
        name: 'High Stakes',
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

    defaultTables.forEach((t) => {
      this.createTable(t.id, t.name, t.config);
    });
    console.log(`[TableManager] Created ${defaultTables.length} default tables`);
  }

  /**
   * Create a new table
   */
  createTable(id: string, name: string, config: TableConfig): Table {
    if (this.tables.has(id)) {
      throw new Error(`Table with id ${id} already exists`);
    }

    const table = new Table(id, name, config);
    this.tables.set(id, table);
    return table;
  }

  /**
   * Get a table by ID
   */
  getTable(id: string): Table | undefined {
    return this.tables.get(id);
  }

  /**
   * Get all Table instances
   */
  getAllTables(): Table[] {
    return Array.from(this.tables.values());
  }

  /**
   * Get all tables info (for listing)
   */
  getAllTablesInfo(): TableInfo[] {
    return Array.from(this.tables.values()).map((table) => ({
      id: table.id,
      name: table.name,
      config: table.config,
      status: table.status,
      playerCount: table.playerCount,
      maxPlayers: table.config.maxPlayers,
    }));
  }

  /**
   * Get tables filtered by category
   */
  getTablesByCategory(category: string): TableInfo[] {
    return this.getAllTablesInfo().filter((t) => t.config.category === category);
  }

  /**
   * Get table where player is currently seated (keyed by telegramId)
   */
  getPlayerTable(telegramId: string): Table | undefined {
    const tableId = this.playerToTable.get(telegramId);
    if (tableId) {
      return this.tables.get(tableId);
    }
    return undefined;
  }

  /**
   * Get table ID where player is currently seated (keyed by telegramId)
   */
  getPlayerTableId(telegramId: string): string | undefined {
    return this.playerToTable.get(telegramId);
  }

  /**
   * Add player to a table.
   * If seat is -1, automatically finds the first available seat.
   * @param telegramId  durable player key (stringified Telegram ID)
   * @param tableId     target table
   * @param seat        seat number, or -1 for auto-assign
   */
  joinTable(telegramId: string, tableId: string, seat: number): { success: boolean; error?: string; seat?: number } {
    // Check if player is already at another table
    const currentTableId = this.playerToTable.get(telegramId);
    if (currentTableId && currentTableId !== tableId) {
      return { success: false, error: 'You are already at another table. Leave it first.' };
    }

    const table = this.tables.get(tableId);
    if (!table) {
      return { success: false, error: 'Table not found' };
    }

    // Auto-select seat if seat is -1
    if (seat === -1) {
      const availableSeat = table.findFirstAvailableSeat();
      if (availableSeat === -1) {
        return { success: false, error: 'No available seats' };
      }
      seat = availableSeat;
    } else if (!table.isSeatAvailable(seat)) {
      return { success: false, error: 'Seat is occupied' };
    }

    const user = userStorage.getUser(telegramId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const success = table.addPlayer(
      telegramId,
      seat,
      table.config.buyIn,
      user.telegramId,
      user.displayName,
      user.avatarUrl,
      user.avatarId
    );

    if (success) {
      this.playerToTable.set(telegramId, tableId);
      return { success: true, seat };
    }

    return { success: false, error: 'Failed to join table' };
  }

  /**
   * Add spectator to a table
   */
  spectateTable(telegramId: string, tableId: string): { success: boolean; error?: string } {
    const table = this.tables.get(tableId);
    if (!table) {
      return { success: false, error: 'Table not found' };
    }

    table.addSpectator(telegramId);
    this.playerToTable.set(telegramId, tableId);
    return { success: true };
  }

  /**
   * Remove player from their current table (keyed by telegramId)
   */
  leaveTable(telegramId: string): void {
    const tableId = this.playerToTable.get(telegramId);
    if (tableId) {
      const table = this.tables.get(tableId);
      if (table) {
        table.removePlayer(telegramId);
      }
      this.playerToTable.delete(telegramId);
    }
  }

  /**
   * Handle player disconnect (Phase 1: removes player from table).
   * Phase 4 will replace this with a grace-window sit-out instead.
   */
  handleDisconnect(telegramId: string): void {
    this.leaveTable(telegramId);
  }

  // ==========================================
  // Socket-by-telegramId map (D-06 / D-07)
  // ==========================================

  /**
   * Register (or replace) the live socket for a telegramId.
   * If a different socket was already registered, `onEvict` is called with the
   * prior socketId BEFORE the map entry is updated (D-07 scaffold).
   */
  setSocketForTelegram(
    telegramId: string,
    socketId: string,
    onEvict: (priorSocketId: string) => void
  ): void {
    const prior = this.socketByTelegram.get(telegramId);
    if (prior !== undefined && prior !== socketId) {
      onEvict(prior);
    }
    this.socketByTelegram.set(telegramId, socketId);
  }

  /**
   * Returns the current live socketId for a telegramId, or undefined.
   */
  getSocketIdForTelegram(telegramId: string): string | undefined {
    return this.socketByTelegram.get(telegramId);
  }

  /**
   * Clear the socket mapping for a telegramId (called on clean disconnect).
   */
  clearSocketForTelegram(telegramId: string): void {
    this.socketByTelegram.delete(telegramId);
  }

  // ==========================================
  // Metrics / status helpers
  // ==========================================

  /**
   * Get total number of tables
   */
  get tableCount(): number {
    return this.tables.size;
  }

  /**
   * Get total number of active players across all tables
   */
  get totalActivePlayers(): number {
    let count = 0;
    this.tables.forEach((table) => {
      count += table.playerCount;
    });
    return count;
  }

  /**
   * Get table status summary
   */
  getStatusSummary(): { waiting: number; playing: number; full: number } {
    const summary = { waiting: 0, playing: 0, full: 0 };
    this.tables.forEach((table) => {
      summary[table.status]++;
    });
    return summary;
  }
}

// Singleton instance
export const tableManager = new TableManager();
