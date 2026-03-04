import { Table } from './models/Table.js';
import { userStorage } from './models/User.js';
import type { TableConfig, TableInfo, TableStatus } from '../types/index.js';

/**
 * TableManager manages all poker tables in the system
 * Handles table creation, player assignment, and lookups
 */
export class TableManager {
  private tables: Map<string, Table> = new Map();
  private playerToTable: Map<string, string> = new Map(); // socketId -> tableId

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
   * Get table where player is currently seated
   */
  getPlayerTable(socketId: string): Table | undefined {
    const tableId = this.playerToTable.get(socketId);
    if (tableId) {
      return this.tables.get(tableId);
    }
    return undefined;
  }

  /**
   * Get table ID where player is currently seated
   */
  getPlayerTableId(socketId: string): string | undefined {
    return this.playerToTable.get(socketId);
  }

  /**
   * Add player to a table
   * If seat is -1, automatically finds the first available seat
   */
  joinTable(socketId: string, tableId: string, seat: number): { success: boolean; error?: string; seat?: number } {
    // Check if player is already at another table
    const currentTableId = this.playerToTable.get(socketId);
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

    const user = userStorage.getUser(socketId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const success = table.addPlayer(
      socketId,
      seat,
      table.config.buyIn,
      user.telegramId,
      user.displayName,
      user.avatarUrl
    );
    
    if (success) {
      this.playerToTable.set(socketId, tableId);
      return { success: true, seat };
    }

    return { success: false, error: 'Failed to join table' };
  }

  /**
   * Add spectator to a table
   */
  spectateTable(socketId: string, tableId: string): { success: boolean; error?: string } {
    const table = this.tables.get(tableId);
    if (!table) {
      return { success: false, error: 'Table not found' };
    }

    table.addSpectator(socketId);
    this.playerToTable.set(socketId, tableId);
    return { success: true };
  }

  /**
   * Remove player from their current table
   */
  leaveTable(socketId: string): void {
    const tableId = this.playerToTable.get(socketId);
    if (tableId) {
      const table = this.tables.get(tableId);
      if (table) {
        table.removePlayer(socketId);
      }
      this.playerToTable.delete(socketId);
    }
  }

  /**
   * Handle player disconnect
   */
  handleDisconnect(socketId: string): void {
    this.leaveTable(socketId);
  }

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
