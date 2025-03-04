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

loadEnv();

// Schema for the watch contract request
const WatchContractRequestSchema = z.object({
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
        const params = WatchContractRequestSchema.parse(request.query);

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
}
