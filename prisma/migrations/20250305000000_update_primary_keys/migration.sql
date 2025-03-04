-- Step 1: Create a new field for the composite primary key in Nft
ALTER TABLE "Nft"
ADD COLUMN "compositeId" TEXT;

-- Step 2: Populate the new field with the composite key format
UPDATE "Nft"
SET
    "compositeId" = (chainId || ':' || contractAddress);

-- Step 3: Create a new field for the composite primary key in NftToken
ALTER TABLE "NftToken"
ADD COLUMN "compositeId" TEXT;

-- Step 4: Populate the new field with the composite key format
UPDATE "NftToken"
SET
    "compositeId" = (
        chainId || ':' || contractAddress || ':' || tokenId
    );

-- Step 5: Create temporary tables with the new schema
CREATE TABLE
    "Nft_new" (
        "compositeId" TEXT NOT NULL PRIMARY KEY,
        "chainId" INTEGER NOT NULL,
        "contractAddress" TEXT NOT NULL,
        "ownerAddress" TEXT,
        "supply" TEXT,
        "maxSupply" TEXT,
        "symbol" TEXT,
        "name" TEXT NOT NULL,
        "logoUri" TEXT,
        "bannerUri" TEXT,
        "description" TEXT,
        "contractURI" TEXT,
        "type" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "watching" BOOLEAN NOT NULL DEFAULT false
    );

CREATE TABLE
    "NftToken_new" (
        "compositeId" TEXT NOT NULL PRIMARY KEY,
        "chainId" INTEGER NOT NULL,
        "contractAddress" TEXT NOT NULL,
        "tokenId" TEXT NOT NULL,
        "supply" TEXT,
        "ownerAddress" TEXT,
        "metadata" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
    );

-- Step 6: Copy data from old tables to new tables
INSERT INTO
    "Nft_new"
SELECT
    "compositeId",
    "chainId",
    "contractAddress",
    "ownerAddress",
    "supply",
    "maxSupply",
    "symbol",
    "name",
    "logoUri",
    "bannerUri",
    "description",
    "contractURI",
    "type",
    "createdAt",
    "updatedAt",
    "watching"
FROM
    "Nft";

INSERT INTO
    "NftToken_new"
SELECT
    "compositeId",
    "chainId",
    "contractAddress",
    "tokenId",
    "supply",
    "ownerAddress",
    "metadata",
    "createdAt",
    "updatedAt"
FROM
    "NftToken";

-- Step 7: Drop old tables
DROP TABLE "Nft";

DROP TABLE "NftToken";

-- Step 8: Rename new tables to original names
ALTER TABLE "Nft_new"
RENAME TO "Nft";

ALTER TABLE "NftToken_new"
RENAME TO "NftToken";

-- Step 9: Create indexes for faster queries
CREATE INDEX "Nft_chainId_idx" ON "Nft" ("chainId");

CREATE INDEX "Nft_ownerAddress_idx" ON "Nft" ("ownerAddress");

CREATE INDEX "Nft_type_idx" ON "Nft" ("type");

CREATE UNIQUE INDEX "Nft_chainId_contractAddress_key" ON "Nft" ("chainId", "contractAddress");

CREATE INDEX "NftToken_chainId_contractAddress_idx" ON "NftToken" ("chainId", "contractAddress");

CREATE INDEX "NftToken_ownerAddress_idx" ON "NftToken" ("ownerAddress");

CREATE UNIQUE INDEX "NftToken_chainId_contractAddress_tokenId_key" ON "NftToken" ("chainId", "contractAddress", "tokenId");