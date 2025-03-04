import { FastifyInstance } from "fastify";
import { registerDefaultRoutes } from "./default";
import { registerNftRoutes } from "./nft";
import { registerUserRoutes } from "./user";

export function registerRoutes(app: FastifyInstance) {
  registerDefaultRoutes(app);
  registerNftRoutes(app);
  registerUserRoutes(app);
}
