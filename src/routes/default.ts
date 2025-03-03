import { FastifyInstance } from "fastify";
import { loadEnv } from "~/utils/loadEnv";
import log from "electron-log";
import { EventEmitter } from "events";

loadEnv();

export function registerDefaultRoutes(app: FastifyInstance) {
  // Initialize the event emitter
  app.decorate("workflowEvents", new EventEmitter());
  // Register enhance workflow route
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
