import { FastifyInstance } from "fastify";
import { LogReaderService } from "./log-reader";
import { ContractEventWatcherService } from "./contract-event-watcher";
import { ContractService } from "./contract";
import log from "electron-log";

export async function setupServices(app: FastifyInstance) {
  const logReaderService = LogReaderService.getInstance();
  const contractEventWatcherService = ContractEventWatcherService.getInstance();
  const contractService = ContractService.getInstance();

  // Set up the Fastify app in the services for event handling
  logReaderService.setApp(app);
  contractEventWatcherService.setApp(app);
  contractService.setApp(app);

  app.addHook("onReady", async () => {
    logReaderService.start();
    contractEventWatcherService.start();
    log.info("Services started");
  });
}

export { LogReaderService, ContractEventWatcherService, ContractService };
