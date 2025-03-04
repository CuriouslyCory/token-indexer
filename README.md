# Basic node.js Token Indexer

## Installation

```bash
pnpm install

# Generate Prisma client
pnpm db:generate
# Push Prisma schema to database
pnpm db:push

# Run the dev server
pnpm dev

# Database Viewer
pnpm db:studio
```

## Usage

Start a contract subscription:
```bash
curl -X POST \
  'http://localhost:3222/nft/watch?chain=1&type=ERC721&address=0x524cab2ec69124574082676e6f654a18df49a048'
```

Subscriptions automatically restart when the server restarts. Turning off subscriptions is manual.
```bash
curl -X POST \
  'http://localhost:3222/nft/unwatch?chain=1&type=ERC721&address=0x524cab2ec69124574082676e6f654a18df49a048'
```


Revalidate a contract. Steps calls ownerOf or tokenOfOwnerByIndex for all token ids. Currently only works for ERC721.
```bash
curl -X POST \
  'http://localhost:3222/nft/revalidate?chain=1&type=ERC721&address=0x524cab2ec69124574082676e6f654a18df49a048&startTokenId=8054'
```
