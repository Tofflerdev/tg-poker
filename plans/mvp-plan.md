# MVP Plan: Telegram Poker — Player Profiles & PostgreSQL

## Summary

Transition from in-memory storage to PostgreSQL, add player profiles with random names, daily chip refill mechanic, and buy-in/cash-out balance management. No real money involved.

---

## Current State vs Target

| Feature | Current | Target MVP |
|---------|---------|------------|
| User storage | In-memory `Map` (lost on restart) | PostgreSQL via Prisma ORM |
| Player identity | socket.id | Telegram ID (persistent) |
| Player name | `player_XXXX` from socket ID | Random fun name on first join, editable |
| Avatar | None | Telegram photo or custom upload |
| Balance | Hardcoded 1000 per session | Persistent in DB, survives restarts |
| Chip refill | None | Daily button: top up to 1000 if below |
| Buy-in | Hardcoded 1000 chips | Deducted from persistent balance |
| Cash-out | Chips lost on disconnect | Remaining chips returned to balance |
| Profile page | None | Settings page for name/avatar |

---

## Database Schema

```mermaid
erDiagram
    users {
        int id PK
        bigint telegram_id UK "Telegram user ID"
        string telegram_username "Telegram @username, nullable"
        string display_name "Shown at table, editable"
        string avatar_url "Photo URL, nullable"
        int balance "Chip balance, default 1000"
        datetime last_daily_refill "Last daily bonus claim"
        int hands_played "Total hands played"
        int hands_won "Total hands won"
        int total_winnings "Lifetime winnings"
        int biggest_pot "Biggest pot won"
        datetime created_at
        datetime updated_at
    }
```

### PostgreSQL Table: `users`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `SERIAL` | PK | Auto-increment ID |
| `telegram_id` | `BIGINT` | UNIQUE, NOT NULL | Telegram user ID from initData |
| `telegram_username` | `VARCHAR(255)` | NULLABLE | Telegram @username |
| `display_name` | `VARCHAR(50)` | NOT NULL | Display name at table |
| `avatar_url` | `TEXT` | NULLABLE | Avatar image URL |
| `balance` | `INTEGER` | NOT NULL, DEFAULT 1000 | Current chip balance |
| `last_daily_refill` | `TIMESTAMPTZ` | NULLABLE | When daily bonus was last claimed |
| `hands_played` | `INTEGER` | NOT NULL, DEFAULT 0 | Stats: total hands |
| `hands_won` | `INTEGER` | NOT NULL, DEFAULT 0 | Stats: hands won |
| `total_winnings` | `INTEGER` | NOT NULL, DEFAULT 0 | Stats: lifetime winnings |
| `biggest_pot` | `INTEGER` | NOT NULL, DEFAULT 0 | Stats: biggest pot won |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW | Registration date |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW | Last update |

---

## Architecture Changes

```mermaid
graph TB
    subgraph Client
        A[App.tsx] --> B[MainMenu]
        A --> C[TableList]
        A --> D[GameRoom]
        A --> E[ProfileSettings - NEW]
        B --> F[DailyBonusButton - NEW]
        D --> G[SeatsDisplay - shows names/avatars]
    end

    subgraph Server
        H[Socket.io Server] --> I[Auth Middleware]
        I --> J[UserRepository - NEW]
        J --> K[(PostgreSQL)]
        H --> L[TableManager]
        L --> M[Table/Game]
        M -->|buy-in deduct| J
        M -->|cash-out return| J
        H --> N[Profile Handlers - NEW]
        N --> J
        H --> O[Daily Bonus Handler - NEW]
        O --> J
    end

    Client -->|socket.io| Server
```

---

## Flow: First-Time User Registration

```mermaid
sequenceDiagram
    participant U as User
    participant TG as Telegram
    participant C as Client
    participant S as Server
    participant DB as PostgreSQL

    U->>TG: Open Mini App
    TG->>C: Load app with initData
    C->>S: socket auth with initData
    S->>S: Validate initData hash
    S->>DB: SELECT * FROM users WHERE telegram_id = ?
    alt User not found
        S->>S: Generate random display name
        S->>DB: INSERT INTO users with telegram_id, display_name, balance=1000
        DB->>S: New user record
    else User exists
        DB->>S: Existing user record
    end
    S->>C: authSuccess with user data including balance
    C->>U: Show MainMenu with balance
```

---

## Flow: Daily Chip Refill

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant S as Server
    participant DB as PostgreSQL

    U->>C: Click Daily Bonus button
    C->>S: socket claimDailyBonus
    S->>DB: SELECT balance, last_daily_refill FROM users WHERE telegram_id = ?
    alt balance >= 1000
        S->>C: error - Balance already >= 1000
    else last_daily_refill < 24h ago
        S->>C: error - Already claimed today, show remaining time
    else Eligible
        S->>DB: UPDATE users SET balance = 1000, last_daily_refill = NOW
        DB->>S: Updated
        S->>C: dailyBonusClaimed with new balance and next eligible time
    end
    C->>U: Update balance display
```

### Daily Bonus Rules
- Player can claim if `balance < 1000` AND `last_daily_refill` is NULL or more than 24 hours ago
- Sets balance to exactly 1000 (not adds 1000)
- Updates `last_daily_refill` to current timestamp
- Client shows countdown timer until next eligible claim

---

## Flow: Buy-in / Cash-out

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant DB as PostgreSQL
    participant T as Table/Game

    Note over C,T: JOIN TABLE
    C->>S: joinTable with tableId, seat
    S->>DB: SELECT balance FROM users WHERE telegram_id = ?
    alt balance < buyIn
        S->>C: tableError - Insufficient balance
    else OK
        S->>DB: UPDATE balance = balance - buyIn
        S->>T: addPlayer with buyIn chips
        S->>C: tableJoined with state
    end

    Note over C,T: LEAVE TABLE
    C->>S: leaveTable
    S->>T: Get remaining chips for player
    T->>S: remaining chips count
    S->>DB: UPDATE balance = balance + remainingChips
    S->>T: removePlayer
    S->>C: tableLeft with updated balance

    Note over C,T: DISCONNECT mid-game
    S->>T: Auto-fold, get remaining chips
    T->>S: remaining chips
    S->>DB: UPDATE balance = balance + remainingChips
    S->>T: removePlayer
```

---

## Flow: Profile Update

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant S as Server
    participant DB as PostgreSQL

    U->>C: Open Profile Settings
    C->>S: socket getProfile
    S->>DB: SELECT * FROM users WHERE telegram_id = ?
    S->>C: profileData with current name, avatar, stats

    U->>C: Change display name / avatar
    C->>S: socket updateProfile with displayName, avatarUrl
    S->>S: Validate name length 2-20 chars, no profanity
    S->>DB: UPDATE users SET display_name = ?, avatar_url = ?
    S->>C: profileUpdated with new data
```

---

## Types Changes (`types/index.ts`)

### Updated `TelegramUser`
```typescript
export interface TelegramUser {
  id: string;           // internal ID (was socket.id, now DB id)
  telegramId: number;
  username?: string;     // Telegram @username
  displayName: string;   // NEW: editable display name
  firstName: string;
  lastName?: string;
  photoUrl?: string;
  avatarUrl?: string;    // NEW: custom avatar (overrides photoUrl)
  balance: number;
  lastDailyRefill?: string; // NEW: ISO timestamp
  canClaimDaily?: boolean;  // NEW: computed field
}
```

### Updated `Player` (in-game)
```typescript
export interface Player {
  id: string;
  telegramId?: number;    // NEW: for persistent identity
  displayName?: string;   // NEW: shown at table
  avatarUrl?: string;     // NEW: shown at table
  seat: number;
  hand: string[];
  chips: number;
  bet: number;
  totalBet: number;
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  showCards: boolean;
  waitingForBB: boolean;
  sittingOut: boolean;
}
```

### New Socket Events
```typescript
// Client -> Server
export interface ExtendedClientEvents extends ClientEvents {
  // ... existing events ...
  claimDailyBonus: () => void;
  getProfile: () => void;
  updateProfile: (data: { displayName?: string; avatarUrl?: string }) => void;
}

// Server -> Client
export interface ExtendedServerEvents extends ServerEvents {
  // ... existing events ...
  dailyBonusClaimed: (data: { balance: number; nextClaimAt: string }) => void;
  dailyBonusError: (msg: string) => void;
  profileData: (profile: UserProfile) => void;
  profileUpdated: (profile: UserProfile) => void;
  profileError: (msg: string) => void;
  balanceUpdate: (balance: number) => void;
}
```

---

## New Files to Create

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Prisma schema with User model |
| `server/db/prisma.ts` | Prisma client singleton |
| `server/db/UserRepository.ts` | DB operations for users (CRUD, balance, stats) |
| `server/utils/nameGenerator.ts` | Random display name generator |
| `client/src/pages/ProfileSettings.tsx` | Profile editing page |
| `client/src/components/DailyBonusButton.tsx` | Daily bonus claim button with timer |
| `client/src/components/PlayerAvatar.tsx` | Reusable avatar component |
| `docker-compose.yml` | PostgreSQL for local development |
| `.env.example` | Environment variables template |

## Files to Modify

| File | Changes |
|------|---------|
| `package.json` | Add `prisma`, `@prisma/client` dependencies |
| `types/index.ts` | Add new fields to TelegramUser, Player, new events |
| `server/models/User.ts` | Replace in-memory with UserRepository calls |
| `server/middleware/auth.ts` | Use DB for user creation/lookup |
| `server/index.ts` | Add profile/bonus handlers, buy-in/cash-out logic |
| `server/TableManager.ts` | Pass user balance info during join |
| `server/Game.ts` | Add displayName/avatarUrl to Player |
| `client/src/App.tsx` | Add ProfileSettings route, daily bonus state |
| `client/src/pages/MainMenu.tsx` | Add daily bonus button, profile link |
| `client/src/components/SeatsDisplay.tsx` | Show displayName and avatar |
| `client/src/components/Chat.tsx` | Use displayName for messages |

---

## Random Name Generator

Generates names like: "Lucky Tiger", "Bold Eagle", "Swift Fox", "Calm Bear"

```
adjectives = [Lucky, Bold, Swift, Calm, Brave, Wise, Cool, Wild, Sly, Keen, ...]
nouns = [Tiger, Eagle, Fox, Bear, Wolf, Hawk, Lion, Shark, Cobra, Raven, ...]
displayName = random(adjectives) + " " + random(nouns) + random(10-99)
```

---

## Implementation Order

1. **Database setup** — Prisma schema, migrations, docker-compose for local PG
2. **UserRepository** — DB layer replacing in-memory storage
3. **Auth flow** — first-connect creates user with random name, reconnect loads existing
4. **Types update** — new fields in shared types
5. **Buy-in / Cash-out** — balance deduction on join, return on leave
6. **Daily bonus** — server handler + client button
7. **Profile page** — settings UI for name/avatar
8. **Display names/avatars** — update SeatsDisplay, Chat
9. **Reconnection handling** — restore state on socket reconnect
10. **Testing** — full flow verification

---

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://poker:poker@localhost:5432/poker_db

# Telegram
BOT_TOKEN=your_bot_token_here

# Server
NODE_ENV=development
PORT=3000
```

---

## Docker Compose (local dev)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: poker
      POSTGRES_PASSWORD: poker
      POSTGRES_DB: poker_db
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```
