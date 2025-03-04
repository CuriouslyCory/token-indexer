import { FastifyInstance } from "fastify";
import { loadEnv } from "~/utils/loadEnv";
import log from "electron-log";
import { EventEmitter } from "events";

loadEnv();

export function registerDefaultRoutes(app: FastifyInstance) {
  app.get("/health", {
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

      return {
        status: "processing",
        message:
          "Document enhancement has started. You will be notified when it's complete.",
        documentId,
      };
    },
  });
}
