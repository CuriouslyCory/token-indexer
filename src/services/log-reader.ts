import { FastifyInstance } from "fastify";
import log from "electron-log";
import { loadEnv } from "~/utils/loadEnv";
import { z } from "zod";
loadEnv();

export class LogReaderService {
  private static instance: LogReaderService;
  private app?: FastifyInstance;

  private constructor() {}

  public setApp(app: FastifyInstance) {
    this.app = app;
  }

  public static getInstance(): LogReaderService {
    if (!LogReaderService.instance) {
      LogReaderService.instance = new LogReaderService();
    }
    return LogReaderService.instance;
  }

  private async connect(): Promise<void> {
    log.info("LogReaderService connected");
  }

  private async setupListeners(): Promise<void> {}

  public async start(): Promise<void> {
    try {
      await this.connect();
      await this.setupListeners();
      log.info("LogReaderService started successfully");
    } catch (error) {
      log.error("Failed to start Aurora Chat Service:", error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    log.info("LogReaderService stopped");
  }
}
