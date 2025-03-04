-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RevalidationRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "lastTokenIdProcessed" TEXT,
    "status" TEXT NOT NULL,
    "tokensProcessed" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "startTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" DATETIME,
    "processingRate" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_RevalidationRun" ("chainId", "contractAddress", "createdAt", "id", "lastTokenIdProcessed", "status", "tokensProcessed", "updatedAt") SELECT "chainId", "contractAddress", "createdAt", "id", "lastTokenIdProcessed", "status", "tokensProcessed", "updatedAt" FROM "RevalidationRun";
DROP TABLE "RevalidationRun";
ALTER TABLE "new_RevalidationRun" RENAME TO "RevalidationRun";
CREATE INDEX "RevalidationRun_chainId_contractAddress_idx" ON "RevalidationRun"("chainId", "contractAddress");
CREATE INDEX "RevalidationRun_status_idx" ON "RevalidationRun"("status");
CREATE INDEX "RevalidationRun_createdAt_idx" ON "RevalidationRun"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
