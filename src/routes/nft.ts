import { FastifyInstance } from "fastify";
import { loadEnv } from "~/utils/loadEnv";
import log from "electron-log";
import { EventEmitter } from "events";
import {
  ContractEventWatcherService,
  TokenType,
  ContractWatchParamsSchema,
} from "~/services/contract-event-watcher";
import { z } from "zod";
import { ContractService } from "~/services";
import { nftTypeToTokenType } from "~/utils";
import type { Address } from "viem";

loadEnv();

// Schema for the watch contract request
const ContractRequestSchema = z.object({
  chain: z.coerce.number(),
  type: z.nativeEnum(TokenType, {
    errorMap: () => ({
      message: "Type must be one of: ERC20, ERC721, ERC1155",
    }),
  }),
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address format"),
});

// Schema for the stop watching request
const StopWatchingRequestSchema = z.object({
  chain: z.coerce.number(),
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address format"),
});

// Schema for the revalidate request
const RevalidateRequestSchema = z.object({
  chain: z.coerce.number(),
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address format"),
  startTokenId: z.string().optional(), // Optional starting token ID for resuming revalidation
});

// Schema for the revalidation status request
const RevalidationStatusRequestSchema = z.object({
  chain: z.coerce.number(),
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address format"),
});

export function registerNftRoutes(app: FastifyInstance) {
  // Endpoint to watch a contract
  app.get("/nft/watch", {
    schema: {
      querystring: {
        type: "object",
        required: ["chain", "type", "address"],
        properties: {
          chain: { type: "string" },
          type: { type: "string", enum: Object.values(TokenType) },
          address: { type: "string" },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            message: { type: "string" },
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
        // Validate request body
        const params = ContractRequestSchema.parse(request.query);

        // Get the contract event watcher service
        const contractEventWatcherService =
          ContractEventWatcherService.getInstance();

        // Start watching the contract
        const success = await contractEventWatcherService.watchContract({
          chain: params.chain,
          type: params.type,
          address: params.address,
        });

        if (success) {
          return {
            success: true,
            message: `Started watching ${params.type} contract at ${params.address} on ${params.chain}`,
          };
        } else {
          reply.code(400);
          return {
            success: false,
            error: "Failed to watch contract. Check logs for details.",
          };
        }
      } catch (error) {
        log.error("Error in watch contract endpoint:", error);

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

  // Endpoint to stop watching a contract
  app.get("/nft/unwatch", {
    schema: {
      querystring: {
        type: "object",
        required: ["chain", "address"],
        properties: {
          chain: { type: "string" },
          address: { type: "string" },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            message: { type: "string" },
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
        const params = StopWatchingRequestSchema.parse(request.query);

        // Get the contract event watcher service
        const contractEventWatcherService =
          ContractEventWatcherService.getInstance();

        // Stop watching the contract
        const success = contractEventWatcherService.stopWatching(
          params.address,
          params.chain
        );

        if (success) {
          return {
            success: true,
            message: `Stopped watching contract at ${params.address} on ${params.chain}`,
          };
        } else {
          reply.code(400);
          return {
            success: false,
            error: "Failed to stop watching contract. Check logs for details.",
          };
        }
      } catch (error) {
        log.error("Error in stop watching endpoint:", error);

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

  app.get("/nft/revalidate", {
    schema: {
      querystring: {
        type: "object",
        required: ["chain", "address"],
        properties: {
          chain: { type: "string" },
          address: { type: "string" },
          startTokenId: { type: "string" },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            message: { type: "string" },
            revalidationRunId: { type: "number" },
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
        const params = RevalidateRequestSchema.parse(request.query);

        // Find the NFT in the database
        const compositeId = `${params.chain}:${params.address}`;
        const nft = await request.server.prisma.nft.findUnique({
          where: {
            compositeId,
          },
        });

        if (!nft) {
          reply.code(404);
          return {
            success: false,
            error: `NFT not found for address ${params.address} on chain ${params.chain}`,
          };
        }

        // Convert NftType to TokenType
        const tokenType = nftTypeToTokenType(nft.type);

        // Revalidate the contract's tokens
        try {
          const contractService = ContractService.getInstance();
          const success = await contractService.revalidate(
            nft.chainId,
            nft.contractAddress as Address,
            tokenType,
            params.startTokenId
          );

          // Get the latest revalidation run
          const latestRun =
            await request.server.prisma.revalidationRun.findFirst({
              where: {
                chainId: params.chain,
                contractAddress: params.address,
              },
              orderBy: {
                createdAt: "desc",
              },
            });

          if (success) {
            return {
              success: true,
              message: `Successfully revalidated tokens for ${nft.contractAddress} on chain ${nft.chainId}`,
              revalidationRunId: latestRun?.id ?? 0,
            };
          } else {
            reply.code(400);
            return {
              success: false,
              error: `Failed to revalidate tokens for ${nft.contractAddress} on chain ${nft.chainId}`,
              revalidationRunId: latestRun?.id ?? 0,
            };
          }
        } catch (revalidateError) {
          log.error(
            `Error revalidating tokens for ${nft.contractAddress} on chain ${nft.chainId}: ${revalidateError}`
          );
          reply.code(500);
          return {
            success: false,
            error: "Error during revalidation process",
          };
        }
      } catch (error) {
        log.error("Error in revalidate endpoint:", error);

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

  // Endpoint to get revalidation status
  app.get("/nft/revalidation-status", {
    schema: {
      querystring: {
        type: "object",
        required: ["chain", "address"],
        properties: {
          chain: { type: "string" },
          address: { type: "string" },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            revalidationRuns: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "number" },
                  status: { type: "string" },
                  lastTokenIdProcessed: { type: "string" },
                  tokensProcessed: { type: "number" },
                  successCount: { type: "number" },
                  failureCount: { type: "number" },
                  processingRate: { type: "number" },
                  startTime: { type: "string" },
                  endTime: { type: "string", nullable: true },
                  createdAt: { type: "string" },
                  updatedAt: { type: "string" },
                },
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
        const params = RevalidationStatusRequestSchema.parse(request.query);

        // Find revalidation runs for this contract
        const revalidationRuns =
          await request.server.prisma.revalidationRun.findMany({
            where: {
              chainId: params.chain,
              contractAddress: params.address,
            },
            orderBy: {
              createdAt: "desc",
            },
            take: 10, // Limit to the 10 most recent runs
          });

        return {
          success: true,
          revalidationRuns: revalidationRuns.map((run) => ({
            id: run.id,
            status: run.status,
            lastTokenIdProcessed: run.lastTokenIdProcessed ?? "0",
            tokensProcessed: run.tokensProcessed,
            successCount: run.successCount ?? 0,
            failureCount: run.failureCount ?? 0,
            processingRate: run.processingRate ?? 0,
            startTime: run.startTime.toISOString(),
            endTime: run.endTime ? run.endTime.toISOString() : null,
            createdAt: run.createdAt.toISOString(),
            updatedAt: run.updatedAt.toISOString(),
          })),
        };
      } catch (error) {
        log.error("Error in revalidation status endpoint:", error);

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
