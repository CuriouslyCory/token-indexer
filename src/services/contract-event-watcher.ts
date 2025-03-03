import { FastifyInstance } from "fastify";
import log from "electron-log";
import { loadEnv } from "~/utils/loadEnv";
import { z } from "zod";
import {
  createPublicClient,
  http,
  type Chain,
  type PublicClient,
  type Log,
  type Address,
  parseAbiItem,
  type WatchEventReturnType,
} from "viem";
import {
  mainnet,
  sepolia,
  base,
  optimism,
  arbitrum,
  polygon,
} from "viem/chains";
import { erc721Abi } from "~/constants/abi/erc721";
import { erc20Abi } from "~/constants/abi/erc20";
import { erc1155Abi } from "~/constants/abi/erc1155";

loadEnv();

// Token types supported by the service
export enum TokenType {
  ERC20 = "ERC20",
  ERC721 = "ERC721",
  ERC1155 = "ERC1155",
}

// Schema for contract watch parameters
export const ContractWatchParamsSchema = z.object({
  chain: z.string(),
  type: z.nativeEnum(TokenType),
  address: z.string(),
});

export type ContractWatchParams = z.infer<typeof ContractWatchParamsSchema>;

// Event types we're watching
type EventType =
  | "erc20Transfer"
  | "erc721Transfer"
  | "erc1155TransferSingle"
  | "erc1155TransferBatch"
  | "erc1155URI";

// Structure to hold event watchers by chain and event type
interface ChainEventWatchers {
  [chainId: string]: {
    client: PublicClient;
    eventWatchers: {
      [eventType in EventType]?: {
        addresses: Set<Address>;
        unwatch?: WatchEventReturnType;
      };
    };
  };
}

export class ContractEventWatcherService {
  private static instance: ContractEventWatcherService;
  private app?: FastifyInstance;
  private chainEventWatchers: ChainEventWatchers = {};

  // Map of supported chains
  private readonly chains: Record<string, Chain> = {
    mainnet,
    sepolia,
    base,
    optimism,
    arbitrum,
    polygon,
  };

  // Map chain names to chain IDs
  private readonly chainIds: Record<string, number> = {
    mainnet: 1,
    sepolia: 11155111,
    base: 8453,
    optimism: 10,
    arbitrum: 42161,
    polygon: 137,
  };

  private constructor() {}

  public setApp(app: FastifyInstance) {
    this.app = app;
  }

  public static getInstance(): ContractEventWatcherService {
    if (!ContractEventWatcherService.instance) {
      ContractEventWatcherService.instance = new ContractEventWatcherService();
    }
    return ContractEventWatcherService.instance;
  }

  /**
   * Get or create a client for a specific chain
   */
  private getOrCreateChainClient(chainName: string): PublicClient | null {
    const chainId = this.chainIds[chainName.toLowerCase()];
    if (!chainId) {
      log.error(`Unsupported chain: ${chainName}`);
      return null;
    }

    const chainIdStr = chainId.toString();

    // If we already have a client for this chain, return it
    if (this.chainEventWatchers[chainIdStr]?.client) {
      return this.chainEventWatchers[chainIdStr].client;
    }

    // Otherwise, create a new client
    const chain = this.chains[chainName.toLowerCase()];
    if (!chain) {
      log.error(`Unsupported chain: ${chainName}`);
      return null;
    }

    const client = createPublicClient({
      chain,
      transport: http(),
    });

    // Initialize the chain watcher structure
    if (!this.chainEventWatchers[chainIdStr]) {
      this.chainEventWatchers[chainIdStr] = {
        client,
        eventWatchers: {},
      };
    } else {
      this.chainEventWatchers[chainIdStr].client = client;
    }

    return client;
  }

  /**
   * Start watching events for a contract
   */
  public async watchContract(params: ContractWatchParams): Promise<boolean> {
    try {
      // Validate parameters
      const validatedParams = ContractWatchParamsSchema.parse(params);

      // Get the chain client
      const client = this.getOrCreateChainClient(validatedParams.chain);
      if (!client) {
        return false;
      }

      const chainId =
        this.chainIds[validatedParams.chain.toLowerCase()].toString();
      const address = validatedParams.address as Address;

      // Add the contract to the appropriate event watchers based on token type
      switch (validatedParams.type) {
        case TokenType.ERC721:
          await this.addContractToEventWatcher(
            chainId,
            "erc721Transfer",
            address
          );
          break;

        case TokenType.ERC20:
          await this.addContractToEventWatcher(
            chainId,
            "erc20Transfer",
            address
          );
          break;

        case TokenType.ERC1155:
          await this.addContractToEventWatcher(
            chainId,
            "erc1155TransferSingle",
            address
          );
          await this.addContractToEventWatcher(
            chainId,
            "erc1155TransferBatch",
            address
          );
          await this.addContractToEventWatcher(chainId, "erc1155URI", address);
          break;

        default:
          log.error(`Unsupported token type: ${validatedParams.type}`);
          return false;
      }

      log.info(
        `Started watching ${validatedParams.type} contract at ${validatedParams.address} on ${validatedParams.chain}`
      );
      return true;
    } catch (error) {
      log.error("Error setting up contract watch:", error);
      return false;
    }
  }

  /**
   * Add a contract address to an event watcher and set up the watcher if needed
   */
  private async addContractToEventWatcher(
    chainId: string,
    eventType: EventType,
    address: Address
  ): Promise<void> {
    // Initialize the event watcher if it doesn't exist
    if (!this.chainEventWatchers[chainId].eventWatchers[eventType]) {
      this.chainEventWatchers[chainId].eventWatchers[eventType] = {
        addresses: new Set<Address>(),
      };
    }

    // Add the address to the set
    this.chainEventWatchers[chainId].eventWatchers[eventType]!.addresses.add(
      address
    );

    // If we already have an active watcher, we don't need to create a new one
    if (this.chainEventWatchers[chainId].eventWatchers[eventType]!.unwatch) {
      return;
    }

    // Set up the event watcher based on the event type
    await this.setupEventWatcher(chainId, eventType);
  }

  /**
   * Set up an event watcher for a specific chain and event type
   */
  private async setupEventWatcher(
    chainId: string,
    eventType: EventType
  ): Promise<void> {
    const client = this.chainEventWatchers[chainId].client;
    const addresses = Array.from(
      this.chainEventWatchers[chainId].eventWatchers[eventType]!.addresses
    );

    if (addresses.length === 0) {
      return;
    }

    let unwatch: WatchEventReturnType;

    switch (eventType) {
      case "erc20Transfer":
        unwatch = client.watchEvent({
          address: addresses,
          event: parseAbiItem(
            "event Transfer(address indexed from, address indexed to, uint256 amount)"
          ),
          onLogs: (logs) => this.handleErc20TransferLogs(chainId, logs),
        });
        break;

      case "erc721Transfer":
        unwatch = client.watchEvent({
          address: addresses,
          event: parseAbiItem(
            "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
          ),
          onLogs: (logs) => this.handleErc721TransferLogs(chainId, logs),
        });
        break;

      case "erc1155TransferSingle":
        unwatch = client.watchEvent({
          address: addresses,
          event: parseAbiItem(
            "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)"
          ),
          onLogs: (logs) => this.handleErc1155TransferSingleLogs(chainId, logs),
        });
        break;

      case "erc1155TransferBatch":
        unwatch = client.watchEvent({
          address: addresses,
          event: parseAbiItem(
            "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)"
          ),
          onLogs: (logs) => this.handleErc1155TransferBatchLogs(chainId, logs),
        });
        break;

      case "erc1155URI":
        unwatch = client.watchEvent({
          address: addresses,
          event: parseAbiItem("event URI(string value, uint256 indexed id)"),
          onLogs: (logs) => this.handleErc1155URILogs(chainId, logs),
        });
        break;
    }

    // Store the unwatch function
    this.chainEventWatchers[chainId].eventWatchers[eventType]!.unwatch =
      unwatch;
  }

  /**
   * Handle ERC20 Transfer logs
   */
  private handleErc20TransferLogs(chainId: string, logs: Log[]): void {
    for (const logItem of logs) {
      try {
        const args = {
          from: logItem.topics?.[1]
            ? `0x${logItem.topics[1].slice(26)}`
            : undefined,
          to: logItem.topics?.[2]
            ? `0x${logItem.topics[2].slice(26)}`
            : undefined,
          amount: logItem.data ? BigInt(logItem.data) : undefined,
        };

        log.info({
          chainId,
          contractAddress: logItem.address,
          tokenType: TokenType.ERC20,
          eventName: "Transfer",
          blockNumber: logItem.blockNumber,
          transactionHash: logItem.transactionHash,
          args,
        });
      } catch (error) {
        log.error(`Error processing ERC20 Transfer log:`, error);
      }
    }
  }

  /**
   * Handle ERC721 Transfer logs
   */
  private handleErc721TransferLogs(chainId: string, logs: Log[]): void {
    for (const logItem of logs) {
      try {
        const args = {
          from: logItem.topics?.[1]
            ? `0x${logItem.topics[1].slice(26)}`
            : undefined,
          to: logItem.topics?.[2]
            ? `0x${logItem.topics[2].slice(26)}`
            : undefined,
          tokenId: logItem.topics?.[3]
            ? BigInt(`0x${logItem.topics[3].slice(2)}`)
            : undefined,
        };

        log.info({
          chainId,
          contractAddress: logItem.address,
          tokenType: TokenType.ERC721,
          eventName: "Transfer",
          blockNumber: logItem.blockNumber,
          transactionHash: logItem.transactionHash,
          args,
        });
      } catch (error) {
        log.error(`Error processing ERC721 Transfer log:`, error);
      }
    }
  }

  /**
   * Handle ERC1155 TransferSingle logs
   */
  private handleErc1155TransferSingleLogs(chainId: string, logs: Log[]): void {
    for (const logItem of logs) {
      try {
        const args = {
          operator: logItem.topics?.[1]
            ? `0x${logItem.topics[1].slice(26)}`
            : undefined,
          from: logItem.topics?.[2]
            ? `0x${logItem.topics[2].slice(26)}`
            : undefined,
          to: logItem.topics?.[3]
            ? `0x${logItem.topics[3].slice(26)}`
            : undefined,
          id:
            logItem.data && logItem.data.length >= 66
              ? BigInt(`0x${logItem.data.slice(2, 66)}`)
              : undefined,
          value:
            logItem.data && logItem.data.length >= 130
              ? BigInt(`0x${logItem.data.slice(66, 130)}`)
              : undefined,
        };

        log.info({
          chainId,
          contractAddress: logItem.address,
          tokenType: TokenType.ERC1155,
          eventName: "TransferSingle",
          blockNumber: logItem.blockNumber,
          transactionHash: logItem.transactionHash,
          args,
        });
      } catch (error) {
        log.error(`Error processing ERC1155 TransferSingle log:`, error);
      }
    }
  }

  /**
   * Handle ERC1155 TransferBatch logs
   */
  private handleErc1155TransferBatchLogs(chainId: string, logs: Log[]): void {
    for (const logItem of logs) {
      try {
        const args = {
          operator: logItem.topics?.[1]
            ? `0x${logItem.topics[1].slice(26)}`
            : undefined,
          from: logItem.topics?.[2]
            ? `0x${logItem.topics[2].slice(26)}`
            : undefined,
          to: logItem.topics?.[3]
            ? `0x${logItem.topics[3].slice(26)}`
            : undefined,
          data: logItem.data ?? "0x",
        };

        log.info({
          chainId,
          contractAddress: logItem.address,
          tokenType: TokenType.ERC1155,
          eventName: "TransferBatch",
          blockNumber: logItem.blockNumber,
          transactionHash: logItem.transactionHash,
          args,
        });
      } catch (error) {
        log.error(`Error processing ERC1155 TransferBatch log:`, error);
      }
    }
  }

  /**
   * Handle ERC1155 URI logs
   */
  private handleErc1155URILogs(chainId: string, logs: Log[]): void {
    for (const logItem of logs) {
      try {
        const args = {
          id: logItem.topics?.[1]
            ? BigInt(`0x${logItem.topics[1].slice(2)}`)
            : undefined,
          value: logItem.data ?? "0x",
        };

        log.info({
          chainId,
          contractAddress: logItem.address,
          tokenType: TokenType.ERC1155,
          eventName: "URI",
          blockNumber: logItem.blockNumber,
          transactionHash: logItem.transactionHash,
          args,
        });
      } catch (error) {
        log.error(`Error processing ERC1155 URI log:`, error);
      }
    }
  }

  /**
   * Remove a contract from being watched
   */
  public stopWatching(address: string, chainName: string): boolean {
    try {
      const chainId = this.chainIds[chainName.toLowerCase()]?.toString();
      if (!chainId || !this.chainEventWatchers[chainId]) {
        log.error(`Chain not found: ${chainName}`);
        return false;
      }

      const normalizedAddress = address.toLowerCase() as Address;
      let removed = false;

      // Remove the address from all event watchers for this chain
      for (const [eventType, watcher] of Object.entries(
        this.chainEventWatchers[chainId].eventWatchers
      )) {
        if (watcher.addresses.has(normalizedAddress)) {
          watcher.addresses.delete(normalizedAddress);
          removed = true;

          // If there are no more addresses for this event type, unwatch
          if (watcher.addresses.size === 0 && watcher.unwatch) {
            watcher.unwatch();
            delete this.chainEventWatchers[chainId].eventWatchers[
              eventType as EventType
            ];
          } else if (watcher.addresses.size > 0 && watcher.unwatch) {
            // If there are still addresses, update the watcher
            watcher.unwatch();
            this.setupEventWatcher(chainId, eventType as EventType);
          }
        }
      }

      if (removed) {
        log.info(`Stopped watching contract at ${address} on ${chainName}`);

        // If there are no more event watchers for this chain, clean up
        if (
          Object.keys(this.chainEventWatchers[chainId].eventWatchers).length ===
          0
        ) {
          delete this.chainEventWatchers[chainId];
        }

        return true;
      }

      log.warn(`Contract at ${address} on ${chainName} was not being watched`);
      return false;
    } catch (error) {
      log.error(`Error stopping watch for ${address} on ${chainName}:`, error);
      return false;
    }
  }

  /**
   * Start the service
   */
  public async start(): Promise<void> {
    try {
      log.info("ContractEventWatcherService started successfully");
    } catch (error) {
      log.error("Failed to start ContractEventWatcherService:", error);
      throw error;
    }
  }

  /**
   * Stop the service
   */
  public async stop(): Promise<void> {
    try {
      // Unwatch all event watchers
      for (const chainId in this.chainEventWatchers) {
        for (const eventType in this.chainEventWatchers[chainId]
          .eventWatchers) {
          const watcher =
            this.chainEventWatchers[chainId].eventWatchers[
              eventType as EventType
            ];
          if (watcher?.unwatch) {
            watcher.unwatch();
          }
        }
      }

      // Clear all watchers
      this.chainEventWatchers = {};

      log.info("ContractEventWatcherService stopped");
    } catch (error) {
      log.error("Error stopping ContractEventWatcherService:", error);
    }
  }
}
