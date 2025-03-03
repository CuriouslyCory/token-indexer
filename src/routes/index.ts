import { FastifyInstance } from "fastify";
import { registerDefaultRoutes } from "./default";
import { registerNftRoutes } from "./nft";

export function registerRoutes(app: FastifyInstance) {
  registerDefaultRoutes(app);
  registerNftRoutes(app);
}
