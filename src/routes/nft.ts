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
  chain: z.string().min(1, "Chain name is required"),
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
  chain: z.string().min(1, "Chain name is required"),
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address format"),
});

export function registerNftRoutes(app: FastifyInstance) {
  // Initialize the event emitter
  app.decorate("workflowEvents", new EventEmitter());

  // Endpoint to watch a contract
  app.post("/nft/watch", {
    schema: {
      body: {
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
        const params = WatchContractRequestSchema.parse(request.body);

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
  app.post("/nft/unwatch", {
    schema: {
      body: {
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
        // Validate request body
        const params = StopWatchingRequestSchema.parse(request.body);

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

  // Keep the existing user endpoint
  app.get("/user", {
    schema: {
      querystring: {
        type: "object",
        properties: {
          documentId: { type: "number" },
        },
        required: ["documentId"],
      },
    },
    handler: async (request, reply) => {
      const { documentId } = request.query as { documentId: number };

      // Immediately return a response indicating the workflow has started
      return {
        status: "processing",
        message:
          "Document enhancement has started. You will be notified when it's complete.",
        documentId,
        workflow: "enhance",
      };
    },
  });
}
