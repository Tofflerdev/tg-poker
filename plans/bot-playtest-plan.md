# План: Боты для плейтеста и накопления данных

**Создан:** 2026-06-08
**Статус:** черновик к обсуждению (реализация — после повторного обсуждения)
**Ветка:** будет создана при старте реализации

## Контекст и цель

Реальных игроков на проде ещё нет. Текущий прод (`tgp.isgood.host`) де-факто
выступает staging-окружением до настоящего запуска. Цель — дать возможность
**человеку (владельцу) играть против ботов**, чтобы:

1. Накопить данные реальных (человек-vs-бот) раздач.
2. На их основе находить баги, оценивать баланс и стабильность.
3. После каждой сессии генерировать отчёт-рекомендации (правила / баланс / стабильность).

Фокус отчётов (приоритеты владельца): **корректность правил, баланс/геймплей, стабильность.**
UX/интерфейс — вне scope этого плана.

## Выбранная архитектура: in-process боты, спавн через админку

Флоу пользователя: сел за любой стол через Mini App → в админке добавил 2–5 ботов
к этому столу → играет с ними.

Почему так (а не внешний бот-клиент + сервисный auth):

- `Game.addPlayer(telegramId, seat, chips, …)` (`server/Game.ts:54`) сажает игрока
  обычным in-memory вызовом — **сокет не нужен**. Бот = серверный `Player` в `seats[]`.
- **Сервисный auth-путь не нужен вообще** — это снимает самый рискованный кусок
  (новый auth-bypass на публичном хосте). Ботов спавнит только админ через
  уже существующий JWT-гейт `/admin` namespace.
- Нет внешнего процесса; клиент рендерит ботов как обычных игроков бесплатно.
- Audit-лог админки фиксирует спавн ботов автоматически.

Ограничение (осознанное): in-process боты не тестируют слой сокета/реконнекта —
они не «подключаются». Под фокус (правила/баланс/стабильность геймплея) этого
достаточно; реконнект прогоняет клиент человека.

## Принятые решения

- **A. Идентичность ботов:** заводим ботам реальные `User`-строки в зарезервированном
  диапазоне `telegramId` (напр. отрицательные id), с флагом `isBot`. Тогда руки ботов
  нормально пишутся в БД (`HandHistoryRepository`/`HandHistoryQueue`), и анализ
  получает полные данные.
- **B. Поведение при отсутствии людей:** по умолчанию боты НЕ доигрывают сами
  (стол не крутится бот-на-бот), но есть включаемая опция «боты продолжают играть»
  для накопления данных без участия человека.
- **Multi-bot:** 2–5 ботов, не heads-up — multiway-банки с несколькими all-in
  нужны, чтобы задействовать сайд-поты (там живут самые дорогие баги корректности).
- **C. Эвристика старта: tight-passive.** Только сильные руки, чаще call/check,
  рейз лишь с топ-рук, всегда без блефа. Предсказуемое поведение → проще отлаживать
  логику раздач (осознанный размен: реже доходим до крупных multiway-банков).
- **D. Cleanup:** боты снимаются автоматически, когда за столом не осталось людей
  (если не включена опция «боты продолжают» из решения B). Ручной `removeBot`
  в админке доступен всегда.
- **E. Маркер ботов:** боты НЕ помечаются визуально в UI — выглядят как обычные
  игроки (имя через `nameGenerator`). Отличить можно по логам/`isBot` в состоянии.

## Компоненты (порядок реализации)

### 1. BotDriver — ядро (`server/bot/`) — ✅ СДЕЛАНО (ветка `feat/bot-playtest-driver`)
- `server/bot/handStrength.ts` — оценка силы руки (preflop-бакеты + postflop через
  `pokersolver.rank`), 4 тира: premium/strong/medium/weak.
- `server/bot/decideAction.ts` — чистая функция решения (tight-passive, без блефа):
  премиум иногда рейзит для вэлью, обычно call; medium — call только дёшево; weak — fold/check.
  Возвращает `{kind, amount?}`, где `amount` = инкремент рейза над коллом (контракт `Game.raise`).
- `server/bot/BotDriver.ts` — оркестрация: задержка 1–3с, guard от двойного
  планирования (per-table, по seat), ре-валидация перед действием (ход мог уйти),
  fallback-цепочка при отклонённом действии, чейнинг бот-на-бот через `onActed`.
- Хук — единая точка broadcast `updateTableState` в `index.ts`: после каждого
  апдейта (ход человека / таймаут / новая раздача / ход бота) вызывается
  `botDriver.notifyStateChanged(tableId)`. Чтобы переиспользовать пост-экшен путь,
  `checkShowdownAndUpdate` поднят на модульный уровень как `settleAndBroadcast`.
- `Player.isBot` добавлен в `types/index.ts`; прокинут через `Game.addPlayer`.
- Тесты: `botHandStrength`, `botDecideAction`, `botDriver` (23 теста, весь сьют — 103 зелёных).
- ⚠️ End-to-end пока не запускается: бот-местами никто не сажает — это компонент №2 (addBot).

### 2. Admin addBot / removeBot — ✅ СДЕЛАНО (ветка `feat/bot-playtest-driver`)
- `adminMutations.ts`: `addBots(adminUser, tableId, count)` / `removeBots(adminUser, tableId)` —
  через `runWithAudit` (audit-строка пишется до посадки). addBots сажает до `count`
  ботов (стоп при заполнении стола), removeBots снимает все бот-места (мид-хенд → авто-фолд).
- `adminNamespace.ts`: события `addBots`/`removeBots` (валидация count 1..5),
  после мутации — `broadcastTableState(tableId)` (рефреш игроков) + `tableStateChanged` (admin UI).
  `setupAdminNamespace(io, { broadcastTableState })` — broadcast прокинут из `index.ts`.
- `server/bot/botRegistry.ts`: `acquireBotIdentity(seatedBotIds)` — выдаёт свободный
  отрицательный `telegramId` (id переиспользуются, пул ограничен), имя/аватар как у людей.
- `UserRepository.ensureBotUser` — идемпотентный upsert бот-`User` (isBot=true, balance=0).
- `TableManager.getActiveBotIds()`; `Table.addPlayer`/`Game.addPlayer` принимают `isBot`.
- Типы: `AdminTableInfo.botCount`, `AdminClientEvents.addBots/removeBots`.
- Admin UI (`AdminTables.tsx`): селектор 1–5, кнопки Add Bots / Remove Bots, индикатор `N bots`.
- Тесты: `botAdminMutations` (6) — server 109 зелёных; client 124 зелёных.
- ⚠️ **ТРЕБУЕТСЯ ПЕРЕД ЗАПУСКОМ:** `npx prisma db push` (добавлена колонка `users.is_bot`).
  Docker был выключен — миграция не применена; `prisma generate` выполнен.
### 2a. Human-aware авто-старт + cleanup (решения B + D) — ✅ СДЕЛАНО (ветка `feat/bot-playtest-driver`)
- **Gate (B):** `Table.canRunHands() = botsContinue || есть eligible-человек`. Вшит в
  `scheduleNextHand` и `tryStartNextHand` (`models/Table.ts`) — бот-на-бот по умолчанию
  НЕ стартует. `getEligiblePlayers()` по-прежнему считает ботов, но gate отсекает старт.
- **Cleanup (D):** `Table.maybeCleanupBots()` снимает всех ботов, когда не осталось людей —
  **только между раздачами** (mid-hand откладывается; если человек ушёл mid-hand, боты
  доигрывают одну руку, чистятся на следующей границе через `scheduleNextHand`).
  `removeAllBots()` после снятия сбрасывает движок в `waiting` (через `startNextHand`, <2 eligible).
  Хук на уход человека — в `Table.removePlayer` (только если ушедший — не бот).
- **Опция (B):** `Table.botsContinue` (default false) + `setBotsContinue()`; включение
  стартует бот-онли раздачи, выключение чистит ботов (если нет людей).
- Admin: мутация `setBotsContinue` (audit) + событие; `AdminTableInfo.botsContinue`;
  кнопка-тумблер «Bots: self-play ON/OFF» в `AdminTables.tsx`.
- Тесты: `tableBotGating` (6) — server 115 зелёных; client 124 зелёных.
- Поведение «человек сидит out»: остаётся за столом → боты НЕ чистятся, но раздачи
  на паузе (нет eligible-человека); сел обратно → раздачи возобновляются.

### 3. Recorder — ✅ СДЕЛАНО (ветка `feat/bot-playtest-driver`)
- `server/bot/SessionRecorder.ts` — append JSONL в `sessions/session-<ts>.jsonl`.
  Подписан на существующие точки в `index.ts setupTableEvents`:
  `setOnPlayerAction` → `recordAction`, `setOnHandComplete` → `recordHandComplete`.
- Формат строки (tagged envelope, новых схем в `types/` нет):
  `{ ts, kind:'action', e:PlayerActionEvent }` / `{ ts, kind:'hand', e:HandCompleteEvent }`.
  `HandCompleteEvent` несёт СЫРЫЕ hole-cards всех мест (до broadcast-редакции) — нужно Oracle.
- Гейт: env `RECORD_SESSIONS` (truthy) — иначе полный no-op (без касания FS). Файл
  создаётся лениво на первом событии, один на запуск процесса; закрывается на SIGTERM/SIGINT.
- `sessions/` и `reports/` добавлены в `.gitignore`; флаг описан в `.env.example`.
- Тесты: `sessionRecorder` (4) — server 119 зелёных.

### 4. Oracle-ассерции — ✅ СДЕЛАНО (ветка `feat/bot-playtest-driver`)
- `server/bot/oracle.ts` — `parseSession` (стриминг, буфер экшенов по столу → руки) +
  `checkHand` + `runOracle`. CLI: `server/bot/runOracle.ts` (`node dist/server/bot/runOracle.js <file>`).
- **Обогащение события** (чтобы проверки сайд-потов вообще были возможны): в
  `HandCompleteEvent` добавлены опц. `pots: Pot[]` (снапшот до очистки) и
  `HandCompletePerPlayer.contributed` (= `player.totalBet`). Заполняются в `Game.ts`
  на обоих путях (showdown + win-by-fold). Рекордер пишет их автоматически.
- Проверяемые инварианты (категория «корректность правил»):
  - **chipConservation** — Σ netDelta == 0 (есть caveat: уход игрока mid-hand → ложноположит.).
  - **potsAccounting** — Σ pots.amount == Σ contributed; нет неположит. потов.
  - **eligibility** — eligible-id реальны (есть в perPlayer), множества вложены
    (side ⊆ main), на шоудауне eligible ⊆ невыбывшие (showedDown).
  - **winnerRecompute** — независимый пересчёт победителя каждого пота через
    `pokersolver` (Hand.winners среди eligible-с-картами) == `won`-флаги (только шоудаун).
- Тесты: `oracle` (11) — server 130 зелёных; client 124 зелёных.

### 5. Reviewer — ✅ СДЕЛАНО (ветка `feat/bot-playtest-driver`)
- Объективная часть автоматизирована: `server/bot/sessionStats.ts` (метрики:
  showdown/all-in/side-pot rate, распределение экшенов, per-player net/VPIP/all-ins,
  bot/human split, длительность), `reportBuilder.ts` (markdown-скаффолд с 3 фокус-
  секциями: Правила | Баланс/геймплей | Стабильность), CLI `generateReport.ts`
  → `reports/report-<ts>.md`.
- Качественная часть: я (Claude) читаю отчёт + JSONL + код и заполняю секцию
  «Reviewer notes» — интерпретация, приоритезация (правила > баланс > стабильность),
  привязка рекомендаций к конкретным hand id / метрике.
- Воркфлоу целиком описан в `server/bot/README.md`.
- Тесты: `sessionReport` (7) — server 137 зелёных; client 124 зелёных.
- E2E проверено на синтетической сессии: `runOracle` ловит нарушение (exit 2),
  `generateReport` пишет корректный отчёт со всеми секциями.

## Статус: ВСЕ КОМПОНЕНТЫ (1–5 + 2a) РЕАЛИЗОВАНЫ
Ветка `feat/bot-playtest-driver`. Перед запуском плейтеста — `npx prisma db push`
(колонка `users.is_bot`) и `RECORD_SESSIONS=1`.

## Проверено по коду (обсуждение 2026-06-09)

- **Hand-history примет ботов.** `HandHistory.telegramId` — обычный `String`, **без FK**
  на `User` (`prisma/schema.prisma:40-56`). Руки ботов пишутся в `HandHistoryQueue` свободно.
- **Чекпойнт требует `User`-строк для ботов.** `checkpointSeatedPlayers` →
  `UserRepository.checkpointSeat` делает `prisma.user.update` (НЕ upsert,
  `UserRepository.ts:254+`). Без бот-строки бросит исключение (ловится/логируется,
  игру не валит, но спамит ошибками). → решение A (реальные `User`-строки) не опционально,
  а **обязательно**.
- **Нужен фильтр `isBot` в выборках.** `updateStats` инкрементит статы на `User`
  (`UserRepository.ts:314`). Бот-строки иначе попадут в leaderboard/stats/админ-список —
  добавить `where: { isBot: false }` в соответствующие запросы.
- **Хук BotDriver уже есть.** `Game` зовёт `onStateChange` на каждой смене хода
  (`nextPlayer()` → `onStateChange`), уже подписан в `index.ts:201`. Драйвер вешается
  туда же: после апдейта проверить `currentPlayer`; если место бота — запланировать
  действие (1–3с) с guard от двойного планирования на один ход.

## Открытые вопросы

- Где хранить `sessions/` и `reports/`. **Рекомендация:** отдельная папка в корне,
  добавить в `.gitignore` (это сырые игровые данные/отчёты, не код).

## Ключевые файлы (для реализации)

- `server/Game.ts` — движок; `addPlayer:54`, turn-логика, action-методы
- `server/admin/adminNamespace.ts`, `server/admin/adminMutations.ts` — паттерн админ-мутаций
- `server/HandHistoryQueue.ts`, `server/db/HandHistoryRepository.ts` — персист рук
- `types/index.ts` — события (`PlayerActionEvent`, `HandCompleteEvent`, `AdminClientEvents`)
- `prisma/schema.prisma` — модель `User` (добавить `isBot`?)
- `server/utils/nameGenerator.ts` — имена ботов
