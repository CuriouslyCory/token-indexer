import { FastifyInstance } from "fastify";
import { loadEnv } from "~/utils/loadEnv";
import log from "electron-log";
import { z } from "zod";

loadEnv();

// Schema for the user inventory request
const UserInventoryRequestSchema = z.object({
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address format"),
  limit: z.coerce.number().min(1).max(100).default(20),
  page: z.coerce.number().min(1).default(1),
});

// Schema for the user collections request
const UserCollectionsRequestSchema = z.object({
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address format"),
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.coerce.number().optional(),
});

// Type for collection token count result
type TokensByCollectionResult = {
  chainId: number;
  contractAddress: string;
  tokenCount: bigint;
};

// Type for count result
type CountResult = {
  count: bigint;
};

export function registerUserRoutes(app: FastifyInstance) {
  // Endpoint to get a user's NFT inventory
  app.get("/user/inventory", {
    schema: {
      querystring: {
        type: "object",
        required: ["address"],
        properties: {
          address: { type: "string" },
          limit: { type: "number" },
          page: { type: "number" },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            nfts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  compositeId: { type: "string" },
                  chainId: { type: "number" },
                  contractAddress: { type: "string" },
                  tokenId: { type: "string" },
                  ownerAddress: { type: "string" },
                  supply: { type: "string", nullable: true },
                  metadata: { type: "string", nullable: true },
                  createdAt: { type: "string" },
                  updatedAt: { type: "string" },
                  collection: {
                    type: "object",
                    nullable: true,
                    properties: {
                      name: { type: "string" },
                      symbol: { type: "string", nullable: true },
                      logoUri: { type: "string", nullable: true },
                      type: { type: "string" },
                    },
                  },
                },
              },
            },
            pagination: {
              type: "object",
              properties: {
                totalCount: { type: "number" },
                totalPages: { type: "number" },
                currentPage: { type: "number" },
                pageSize: { type: "number" },
                hasNextPage: { type: "boolean" },
                hasPreviousPage: { type: "boolean" },
              },
            },
          },
        },
        400: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            error: { type: "string" },
          },
        },
      },
    },
    handler: async (request, reply) => {
      try {
        // Validate request query
        const params = UserInventoryRequestSchema.parse(request.query);

        // Get total count for pagination info
        const totalCount = await request.server.prisma.nftToken.count({
          where: {
            ownerAddress: params.address,
          },
        });

        // Calculate skip based on page and limit
        const skip = (params.page - 1) * params.limit;

        // Query NFT tokens owned by the address with pagination
        const nftTokens = await request.server.prisma.nftToken.findMany({
          where: {
            ownerAddress: params.address,
          },
          take: params.limit,
          skip,
          orderBy: {
            contractAddress: "asc",
          },
        });

        const uniqueCollections = [
          ...new Set(
            nftTokens.map(
              (token) => `${token.chainId}:${token.contractAddress}`
            )
          ),
        ];

        // Get collection information for each token
        const nftCollections = await request.server.prisma.nft.findMany({
          where: {
            compositeId: {
              in: uniqueCollections,
            },
          },
          select: {
            chainId: true,
            contractAddress: true,
            name: true,
            symbol: true,
            logoUri: true,
            type: true,
          },
        });

        // Create a map for quick lookup of collection data
        const collectionMap = new Map();
        nftCollections.forEach((collection) => {
          const key = `${collection.chainId}:${collection.contractAddress}`;
          collectionMap.set(key, collection);
        });

        // Calculate pagination information
        const totalPages = Math.ceil(totalCount / params.limit);
        const hasNextPage = params.page * params.limit < totalCount;
        const hasPreviousPage = params.page > 1;

        return {
          success: true,
          nfts: nftTokens.map((token) => {
            const collectionKey = `${token.chainId}:${token.contractAddress}`;
            const collection = collectionMap.get(collectionKey) ?? null;

            return {
              id: token.compositeId,
              chainId: token.chainId,
              contractAddress: token.contractAddress,
              tokenId: token.tokenId,
              ownerAddress: token.ownerAddress,
              supply: token.supply,
              metadata: token.metadata,
              createdAt: token.createdAt.toISOString(),
              updatedAt: token.updatedAt.toISOString(),
              collection: collection
                ? {
                    name: collection.name,
                    symbol: collection.symbol,
                    logoUri: collection.logoUri,
                    type: collection.type,
                  }
                : null,
            };
          }),
          pagination: {
            totalCount,
            totalPages,
            currentPage: params.page,
            pageSize: params.limit,
            hasNextPage,
            hasPreviousPage,
          },
        };
      } catch (error) {
        log.error("Error in user inventory endpoint:", error);

        // Handle validation errors
        if (error instanceof z.ZodError) {
          reply.code(400);
          return {
            success: false,
            error: error.errors.map((e) => e.message).join(", "),
          };
        }

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
        };
      }
    },
  });
}
