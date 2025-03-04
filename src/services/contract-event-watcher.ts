import { FastifyInstance } from "fastify";
import log from "electron-log";
import { loadEnv, nftTypeToTokenType, tokenTypeToNftType } from "~/utils";
import { z } from "zod";
import {
  createPublicClient,
  http,
  type PublicClient,
  type Log,
  type Address,
  parseAbiItem,
  type WatchEventReturnType,
} from "viem";
import { SUPPORTED_CHAINS } from "~/constants";
import SuperJSON from "superjson";
import { ContractService } from "./contract";
import { getWssClient } from "~/utils/web3";

loadEnv();

// Token types supported by the service
export enum TokenType {
  ERC20 = "ERC20",
  ERC721 = "ERC721",
  ERC1155 = "ERC1155",
}

// Schema for contract watch parameters
export const ContractWatchParamsSchema = z.object({
  chain: z.coerce.number(),
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
  [chainId: number]: {
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
  private getOrCreateChainClient(chainId: number): PublicClient | null {
    if (!chainId) {
      log.error(`chainId is required: ${chainId}`);
      return null;
    }

    // If we already have a client for this chain, return it
    if (this.chainEventWatchers[chainId]?.client) {
      return this.chainEventWatchers[chainId].client;
    }

    // Otherwise, create a new client
    const chain = SUPPORTED_CHAINS[chainId];
    if (!chain) {
      log.error(`Unsupported chain: ${chainId}`);
      return null;
    }

    const client = getWssClient(chainId);

    // Initialize the chain watcher structure
    if (!this.chainEventWatchers[chainId]) {
      this.chainEventWatchers[chainId] = {
        client,
        eventWatchers: {},
      };
    } else {
      this.chainEventWatchers[chainId].client = client;
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

      const chainId = validatedParams.chain;
      const address = validatedParams.address as Address;

      // Add the contract to the appropriate event watchers based on token type
      switch (validatedParams.type) {
        case TokenType.ERC721:
          await this.addContractToEventWatcher(
            chainId,
            "erc721Transfer",
            address
          );
          // Use the ContractService to upsert the NFT
          await ContractService.getInstance().upsertNft(
            chainId,
            address,
            TokenType.ERC721
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
          // Use the ContractService to upsert the NFT
          await ContractService.getInstance().upsertNft(
            chainId,
            address,
            TokenType.ERC1155
          );
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
    chainId: number,
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
    chainId: number,
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
  private handleErc20TransferLogs(chainId: number, logs: Log[]): void {
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

        log.info(
          SuperJSON.stringify({
            chainId,
            contractAddress: logItem.address,
            tokenType: TokenType.ERC20,
            eventName: "Transfer",
            blockNumber: logItem.blockNumber,
            transactionHash: logItem.transactionHash,
            args,
          })
        );
      } catch (error) {
        log.error(`Error processing ERC20 Transfer log:`, error);
      }
    }
  }

  /**
   * Handle ERC721 Transfer logs
   */
  private handleErc721TransferLogs(chainId: number, logs: Log[]): void {
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

        // Upsert the NFT token in the database when a transfer occurs
        if (this.app?.prisma && args.to && args.tokenId) {
          // Use a self-executing async function to handle the database operation
          (async () => {
            try {
              await this.app!.prisma.nftToken.upsert({
                where: {
                  chainId_contractAddress_tokenId: {
                    chainId,
                    contractAddress: logItem.address,
                    tokenId: args.tokenId!.toString(),
                  },
                },
                update: {
                  ownerAddress: args.to,
                  updatedAt: new Date(),
                },
                create: {
                  chainId,
                  contractAddress: logItem.address,
                  tokenId: args.tokenId!.toString(),
                  ownerAddress: args.to,
                  supply: "1", // ERC721 tokens always have a supply of 1
                },
              });
              log.info(
                `Upserted ERC721 token ${args.tokenId} for ${logItem.address} on chain ${chainId} with owner ${args.to}`
              );
            } catch (error) {
              log.error(`Error upserting NFT token: ${error}`);
            }
          })();
        }
      } catch (error) {
        log.error(`Error processing ERC721 Transfer log:`, error);
      }
    }
  }

  /**
   * Handle ERC1155 TransferSingle logs
   */
  private handleErc1155TransferSingleLogs(chainId: number, logs: Log[]): void {
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

        // Upsert the NFT token in the database when a transfer occurs
        if (this.app?.prisma && args.to && args.id && args.value) {
          // Use a self-executing async function to handle the database operation
          (async () => {
            try {
              await this.app!.prisma.nftToken.upsert({
                where: {
                  chainId_contractAddress_tokenId: {
                    chainId,
                    contractAddress: logItem.address,
                    tokenId: args.id!.toString(),
                  },
                },
                update: {
                  ownerAddress: args.to,
                  supply: args.value!.toString(),
                  updatedAt: new Date(),
                },
                create: {
                  chainId,
                  contractAddress: logItem.address,
                  tokenId: args.id!.toString(),
                  ownerAddress: args.to,
                  supply: args.value!.toString(),
                },
              });
              log.info(
                `Upserted ERC1155 token ${args.id} for ${logItem.address} on chain ${chainId} with owner ${args.to} and supply ${args.value}`
              );
            } catch (error) {
              log.error(`Error upserting NFT token: ${error}`);
            }
          })();
        }
      } catch (error) {
        log.error(`Error processing ERC1155 TransferSingle log:`, error);
      }
    }
  }

  /**
   * Handle ERC1155 TransferBatch logs
   */
  private handleErc1155TransferBatchLogs(chainId: number, logs: Log[]): void {
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

        // For TransferBatch, we need to decode the data to get the token IDs and values
        if (this.app?.prisma && args.to && args.data && args.data.length > 2) {
          // Use a self-executing async function to handle the database operation
          (async () => {
            try {
              // Remove the 0x prefix
              const data = args.data.slice(2);

              // The first 64 characters represent the offset to the ids array
              const idsOffset = parseInt(data.slice(0, 64), 16);

              // The next 64 characters represent the offset to the values array
              const valuesOffset = parseInt(data.slice(64, 128), 16);

              // Get the length of the ids array (32 bytes after the offset)
              const idsLengthHex = data.slice(
                idsOffset * 2,
                (idsOffset + 32) * 2
              );
              const idsLength = parseInt(idsLengthHex, 16);

              // Get the length of the values array (32 bytes after the offset)
              const valuesLengthHex = data.slice(
                valuesOffset * 2,
                (valuesOffset + 32) * 2
              );
              const valuesLength = parseInt(valuesLengthHex, 16);

              // Ensure the arrays have the same length
              if (idsLength === valuesLength) {
                // Extract the ids and values
                for (let i = 0; i < idsLength; i++) {
                  const idHex = data.slice(
                    (idsOffset + 32 + i * 32) * 2,
                    (idsOffset + 32 + (i + 1) * 32) * 2
                  );
                  const valueHex = data.slice(
                    (valuesOffset + 32 + i * 32) * 2,
                    (valuesOffset + 32 + (i + 1) * 32) * 2
                  );

                  const id = BigInt(`0x${idHex}`);
                  const value = BigInt(`0x${valueHex}`);

                  // Process each token in a separate async function to avoid await issues
                  this.processErc1155Token(
                    chainId,
                    logItem.address,
                    id.toString(),
                    value.toString(),
                    args.to
                  );
                }
              }
            } catch (error) {
              log.error(
                `Error processing ERC1155 TransferBatch data: ${error}`
              );
            }
          })();
        }
      } catch (error) {
        log.error(`Error processing ERC1155 TransferBatch log:`, error);
      }
    }
  }

  /**
   * Process an ERC1155 token for database update
   */
  private async processErc1155Token(
    chainId: number,
    contractAddress: string,
    tokenId: string,
    supply: string,
    ownerAddress: string | undefined
  ): Promise<void> {
    if (!this.app?.prisma || !ownerAddress) return;

    try {
      await this.app.prisma.nftToken.upsert({
        where: {
          chainId_contractAddress_tokenId: {
            chainId,
            contractAddress,
            tokenId,
          },
        },
        update: {
          ownerAddress,
          supply,
          updatedAt: new Date(),
        },
        create: {
          chainId,
          contractAddress,
          tokenId,
          ownerAddress,
          supply,
        },
      });
      log.info(
        `Upserted ERC1155 token ${tokenId} for ${contractAddress} on chain ${chainId} with owner ${ownerAddress} and supply ${supply}`
      );
    } catch (error) {
      log.error(`Error upserting NFT token: ${error}`);
    }
  }

  /**
   * Handle ERC1155 URI logs
   */
  private handleErc1155URILogs(chainId: number, logs: Log[]): void {
    for (const logItem of logs) {
      try {
        const args = {
          id: logItem.topics?.[1]
            ? BigInt(`0x${logItem.topics[1].slice(2)}`)
            : undefined,
          value: logItem.data ?? "0x",
        };

        log.info(
          SuperJSON.stringify({
            chainId,
            contractAddress: logItem.address,
            tokenType: TokenType.ERC1155,
            eventName: "URI",
            blockNumber: logItem.blockNumber,
            transactionHash: logItem.transactionHash,
            args,
          })
        );
      } catch (error) {
        log.error(`Error processing ERC1155 URI log:`, error);
      }
    }
  }

  /**
   * Remove a contract from being watched
   */
  public stopWatching(address: string, chainId: number): boolean {
    try {
      if (!chainId || !this.chainEventWatchers[chainId]) {
        log.error(`Chain not found: ${chainId}`);
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
        log.info(`Stopped watching contract at ${address} on ${chainId}`);

        // Update the watching status in the database
        if (this.app?.prisma) {
          // Use a self-executing async function to handle the database operation
          (async () => {
            try {
              await this.app!.prisma.nft.updateMany({
                where: {
                  chainId,
                  contractAddress: normalizedAddress,
                },
                data: {
                  watching: false,
                },
              });
              log.info(
                `Updated watching status to false for ${address} on chain ${chainId}`
              );
            } catch (error) {
              log.error(`Error updating NFT watching status: ${error}`);
            }
          })();
        }

        // If there are no more event watchers for this chain, clean up
        if (
          Object.keys(this.chainEventWatchers[chainId].eventWatchers).length ===
          0
        ) {
          delete this.chainEventWatchers[chainId];
        }

        return true;
      }

      log.warn(`Contract at ${address} on ${chainId} was not being watched`);
      return false;
    } catch (error) {
      log.error(`Error stopping watch for ${address} on ${chainId}:`, error);
      return false;
    }
  }

  /**
   * Start the service
   */
  public async start(): Promise<void> {
    try {
      // Check if we have access to the database
      if (this.app?.prisma) {
        // Query the Nfts table for contracts with watching = true
        const watchingNfts = await this.app.prisma.nft.findMany({
          where: {
            watching: true,
          },
          select: {
            chainId: true,
            contractAddress: true,
            type: true,
          },
        });

        // Restart watching for each contract
        if (watchingNfts.length > 0) {
          log.info(`Found ${watchingNfts.length} contracts to resume watching`);

          for (const nft of watchingNfts) {
            try {
              // Convert the NftType to TokenType using our utility function
              const tokenType = nftTypeToTokenType(nft.type);

              // Restart watching the contract
              const success = await this.watchContract({
                chain: nft.chainId,
                address: nft.contractAddress,
                type: tokenType,
              });

              if (success) {
                log.info(
                  `Resumed watching ${tokenType} contract at ${nft.contractAddress} on chain ${nft.chainId}`
                );
              } else {
                log.error(
                  `Failed to resume watching ${tokenType} contract at ${nft.contractAddress} on chain ${nft.chainId}`
                );
              }
            } catch (error) {
              log.error(
                `Error processing contract ${nft.contractAddress} on chain ${nft.chainId}: ${error}`
              );
            }
          }
        } else {
          log.info("No contracts found with watching = true");
        }
      }

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
