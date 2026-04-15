-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "telegram_id" BIGINT NOT NULL,
    "telegram_username" VARCHAR(255),
    "display_name" VARCHAR(50) NOT NULL,
    "avatar_url" TEXT,
    "balance" INTEGER NOT NULL DEFAULT 1000,
    "last_daily_refill" TIMESTAMPTZ,
    "hands_played" INTEGER NOT NULL DEFAULT 0,
    "hands_won" INTEGER NOT NULL DEFAULT 0,
    "total_winnings" INTEGER NOT NULL DEFAULT 0,
    "biggest_pot" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "avatarId" TEXT,
    "currentTableId" TEXT,
    "currentSeat" INTEGER,
    "currentChips" INTEGER,
    "sessionToken" TEXT,
    "disconnectedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "bannedAt" TIMESTAMP(3),
    "tosAcceptedAt" TIMESTAMP(3),
    "tosVersion" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandHistory" (
    "id" TEXT NOT NULL,
    "handId" TEXT NOT NULL,
    "telegramId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "board" TEXT[],
    "holeCards" TEXT[],
    "seat" INTEGER NOT NULL,
    "netDelta" INTEGER NOT NULL,
    "finalChips" INTEGER NOT NULL,
    "showedDown" BOOLEAN NOT NULL,
    "won" BOOLEAN NOT NULL,

    CONSTRAINT "HandHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminTelegramId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id");

-- CreateIndex
CREATE INDEX "users_currentTableId_idx" ON "users"("currentTableId");

-- CreateIndex
CREATE INDEX "HandHistory_telegramId_playedAt_idx" ON "HandHistory"("telegramId", "playedAt" DESC);

-- CreateIndex
CREATE INDEX "HandHistory_playedAt_idx" ON "HandHistory"("playedAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_adminTelegramId_createdAt_idx" ON "AdminAuditLog"("adminTelegramId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_createdAt_idx" ON "AdminAuditLog"("action", "createdAt" DESC);
