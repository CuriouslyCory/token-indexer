// ESM
import Fastify from "fastify";
import { registerPlugins } from "./plugins";
import { registerRoutes } from "./routes";
import { setupServices } from "./services";
import log from "electron-log";
/**
 * Run the server!
 */
const start = async () => {
  const app = Fastify({
    logger: {
      level: "info",
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss.l",
        },
      },
    },
    trustProxy: true,
  });

  try {
    await registerPlugins(app);
    registerRoutes(app);
    await setupServices(app);

    await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT) });
  } catch (err) {
    log.error(err);
    process.exit(1);
  }
};
start();
