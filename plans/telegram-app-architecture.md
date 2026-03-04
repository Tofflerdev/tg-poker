# Архитектура Telegram Mini App - Покер

## Общая схема системы

```mermaid
graph TB
    subgraph Telegram
        A[Пользователь] -->|открывает| B[Telegram Mini App]
        B -->|WebApp SDK| C[initData]
    end

    subgraph Client[React Client]
        D[App Router] --> E[MainMenu]
        D --> F[TableList]
        D --> G[GameRoom]
        G --> H[Table Component]
        G --> I[GameControls]
        D --> J[useTelegram Hook]
        J --> K[Telegram WebApp API]
    end

    subgraph Server[Node.js Server]
        L[Socket.io Server] --> M[TableManager]
        M --> N[Table 1]
        M --> O[Table 2]
        M --> P[Table N]
        N --> Q[Game Instance]
        L --> R[Auth Middleware]
        R --> S[User Storage]
    end

    B --> D
    Client -->|Socket.io| L
    C -->|validate| R
```

## Структура данных

```mermaid
classDiagram
    class Table {
        +string id
        +string name
        +TableConfig config
        +Game game
        +string[] playerIds
        +TableStatus status
        +createdAt Date
    }

    class TableConfig {
        +number smallBlind
        +number bigBlind
        +number maxPlayers
        +number turnTime
        +number buyIn
        +TableCategory category
    }

    class Player {
        +string telegramId
        +string username
        +string firstName
        +string lastName
        +string photoUrl
        +number balance
        +number seat
    }

    class UserProfile {
        +string telegramId
        +string username
        +number totalWinnings
        +number handsPlayed
        +number handsWon
        +Date joinedAt
    }

    class GameState {
        +Player[] seats
        +string[] communityCards
        +Pot[] pots
        +GameStage stage
        +number currentPlayer
    }

    Table "1" --> "1" TableConfig
    Table "1" --> "1" GameState
    Player "1" --> "1" UserProfile
```

## Поток данных при входе

```mermaid
sequenceDiagram
    participant U as Пользователь
    participant C as Client
    participant T as Telegram
    participant S as Server
    participant DB as Storage

    U->>T: Открыть Mini App
    T->>C: Загрузить приложение
    C->>T: Получить initData
    T->>C: Вернуть user + hash
    C->>S: Подключиться (socket.io)
    C->>S: auth: {initData}
    S->>S: Валидация hash
    alt Валидация успешна
        S->>DB: Получить/создать User
        DB->>S: UserProfile
        S->>C: auth:success + user
        C->>U: Показать MainMenu
    else Ошибка валидации
        S->>C: auth:error
        C->>U: Ошибка авторизации
    end
```

## Поток при выборе стола

```mermaid
sequenceDiagram
    participant U as Пользователь
    participant C as Client
    participant S as Server
    participant TM as TableManager
    participant T as Table

    U->>C: Нажать "Найти стол"
    C->>S: getTables()
    S->>TM: Получить список
    TM->>S: Table[]
    S->>C: Список столов
    C->>U: Показать TableList

    U->>C: Выбрать стол
    C->>S: joinTable(tableId, seat)
    S->>TM: Найти стол
    TM->>T: Проверить место
    alt Место свободно
        T->>S: OK
        S->>C: success + gameState
        C->>C: Перейти в GameRoom
        C->>U: Показать стол
    else Место занято
        S->>C: error: occupied
        C->>U: Показать ошибку
    end
```

## Файловая структура

```
tg-poker/
├── client/                    # React приложение
│   ├── src/
│   │   ├── hooks/
│   │   │   └── useTelegram.ts
│   │   ├── pages/
│   │   │   ├── MainMenu.tsx
│   │   │   ├── TableList.tsx
│   │   │   └── GameRoom.tsx
│   │   ├── components/
│   │   │   ├── TableCard.tsx
│   │   │   ├── UserProfile.tsx
│   │   │   ├── BottomNav.tsx
│   │   │   └── MainButton.tsx
│   │   ├── styles/
│   │   │   └── telegram.css
│   │   └── App.tsx
│   └── package.json
├── server/
│   ├── models/
│   │   ├── User.ts
│   │   └── Table.ts
│   ├── middleware/
│   │   └── auth.ts
│   ├── config/
│   │   └── tables.ts
│   ├── TableManager.ts
│   ├── Game.ts
│   └── index.ts
├── types/
│   └── index.ts
└── plans/
    └── telegram-app-architecture.md
```

## Этапы реализации

### Фаза 1: Telegram Integration (1-2 дня)
- Подключение WebApp SDK
- Аутентификация через initData
- Базовая адаптация UI

### Фаза 2: Multi-Table (2-3 дня)
- TableManager
- Socket.io rooms
- Предопределённые столы

### Фаза 3: Главное меню (2 дня)
- React Router
- Список столов
- Навигация

### Фаза 4: Polish (2-3 дня)
- Анимации
- Haptic feedback
- Чат

### Фаза 5: Production (2 дня)
- Админка
- Безопасность
- Деплой

## Технологический стек

| Компонент | Технология |
|-----------|------------|
| Client | React + TypeScript + Vite |
| Server | Node.js + Express + Socket.io |
| State | Socket.io (real-time) |
| Auth | Telegram WebApp initData |
| Storage | Redis / MongoDB (позже) |
| UI | Telegram Design System |
