-- CreateTable
CREATE TABLE "RevalidationRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "lastTokenIdProcessed" TEXT,
    "status" TEXT NOT NULL,
    "tokensProcessed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "RevalidationRun_chainId_contractAddress_idx" ON "RevalidationRun"("chainId", "contractAddress");

-- CreateIndex
CREATE INDEX "RevalidationRun_status_idx" ON "RevalidationRun"("status");

-- CreateIndex
CREATE INDEX "RevalidationRun_createdAt_idx" ON "RevalidationRun"("createdAt");
