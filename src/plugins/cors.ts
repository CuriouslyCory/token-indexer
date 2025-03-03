import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fastifyCorsPlugin from "@fastify/cors";
import { loadEnv } from "~/utils/loadEnv";
import log from "electron-log";

loadEnv();

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "localhost:3200",
  "https://unfiltered.curiouslycory.com",
];
const DEV_API_KEY = process.env.DEV_API_KEY;

export async function registerCorsPlugin(app: FastifyInstance) {
  app.register(fastifyCorsPlugin, {
    origin: ALLOWED_ORIGINS,
  });
}
