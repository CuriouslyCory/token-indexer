-- CreateTable
CREATE TABLE "Nft" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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

-- CreateTable
CREATE TABLE "NftToken" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "supply" TEXT,
    "ownerAddress" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Nft_chainId_idx" ON "Nft"("chainId");

-- CreateIndex
CREATE INDEX "Nft_ownerAddress_idx" ON "Nft"("ownerAddress");

-- CreateIndex
CREATE INDEX "Nft_type_idx" ON "Nft"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Nft_chainId_contractAddress_key" ON "Nft"("chainId", "contractAddress");

-- CreateIndex
CREATE INDEX "NftToken_chainId_contractAddress_idx" ON "NftToken"("chainId", "contractAddress");

-- CreateIndex
CREATE INDEX "NftToken_ownerAddress_idx" ON "NftToken"("ownerAddress");

-- CreateIndex
CREATE UNIQUE INDEX "NftToken_chainId_contractAddress_tokenId_key" ON "NftToken"("chainId", "contractAddress", "tokenId");
