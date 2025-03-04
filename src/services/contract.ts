import { FastifyInstance } from "fastify";
import log from "electron-log";
import { TokenType } from "./contract-event-watcher";
import { tokenTypeToNftType } from "~/utils";
import {
  createPublicClient,
  http,
  type Chain,
  type PublicClient,
  type Address,
  getContract,
  ContractFunctionExecutionError,
} from "viem";
import { SUPPORTED_CHAINS } from "~/constants";
import { erc721Abi } from "~/constants/abi/erc721";
import { erc1155Abi } from "~/constants/abi/erc1155";

// Define the metadata interface
export interface ContractMetadata {
  name?: string;
  symbol?: string;
  supply?: bigint;
  maxSupply?: bigint;
  owner?: Address;
  contractURI?: string;
}

export class ContractService {
  private static instance: ContractService;
  private app?: FastifyInstance;

  private constructor() {}

  public setApp(app: FastifyInstance) {
    this.app = app;
  }

  public static getInstance(): ContractService {
    if (!ContractService.instance) {
      ContractService.instance = new ContractService();
    }
    return ContractService.instance;
  }

  /**
   * Get a client for a specific chain
   */
  private getChainClient(chainId: number): PublicClient | null {
    if (!chainId) {
      log.error(`chainId is required: ${chainId}`);
      return null;
    }

    // Get the chain configuration
    const chain = SUPPORTED_CHAINS[chainId];
    if (!chain) {
      log.error(`Unsupported chain: ${chainId}`);
      return null;
    }

    // Create a new client
    return createPublicClient({
      chain,
      transport: http(),
    });
  }

  /**
   * Upsert an NFT record in the database
   */
  public async upsertNft(
    chainId: number,
    address: Address,
    tokenType: TokenType
  ): Promise<boolean> {
    // Upsert the NFT record in the database
    if (!this.app?.prisma) {
      log.error("Prisma client not available");
      return false;
    }

    try {
      // Check if the record already exists
      const existingNft = await this.app.prisma.nft.findUnique({
        where: {
          chainId_contractAddress: {
            chainId,
            contractAddress: address,
          },
        },
      });

      // Prepare data for upsert
      const nftType = tokenTypeToNftType(tokenType);
      if (!nftType) {
        log.error(`Invalid token type: ${tokenType}`);
        return false;
      }

      // If the NFT already exists, just update the watching status
      if (existingNft) {
        log.info(
          `NFT record already exists for ${address} on chain ${chainId}, updating watching status`
        );

        await this.app.prisma.nft.update({
          where: {
            chainId_contractAddress: {
              chainId,
              contractAddress: address,
            },
          },
          data: {
            watching: true,
          },
        });

        log.info(`Updated watching status for ${address} on chain ${chainId}`);
        return true;
      }

      // Only fetch metadata from the blockchain for new NFTs
      log.info(`Fetching metadata for new NFT ${address} on chain ${chainId}`);
      const metadata = await this.getMetadata(chainId, address, tokenType);

      // Log metadata values for debugging
      if (metadata.maxSupply) {
        log.info(
          `Max supply for ${address} on chain ${chainId}: ${metadata.maxSupply}`
        );
      }

      if (metadata.contractURI) {
        log.info(
          `Contract URI for ${address} on chain ${chainId}: ${metadata.contractURI}`
        );
      }

      // Create a new NFT record
      await this.app.prisma.nft.create({
        data: {
          chainId,
          contractAddress: address,
          name: metadata.name ?? `NFT (${address.slice(0, 6)}...)`,
          symbol: metadata.symbol ?? undefined,
          supply: metadata.supply?.toString() ?? undefined,
          ownerAddress: metadata.owner ?? undefined,
          maxSupply: metadata.maxSupply?.toString() ?? undefined,
          contractURI: metadata.contractURI ?? undefined,
          type: nftType,
          watching: true,
        },
      });

      log.info(`Created new NFT record for ${address} on chain ${chainId}`);
      return true;
    } catch (error) {
      log.error(`Error upserting NFT record: ${error}`);
      return false;
    }
  }

  private async getRevalidationRun(
    chainId: number,
    contractAddress: Address,
    startTokenId = "0"
  ) {
    // Check if there's already an in-progress revalidation
    const existingRun = await this.app?.prisma.revalidationRun.findFirst({
      where: {
        chainId,
        contractAddress,
        status: "in_progress",
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (existingRun) {
      return existingRun;
    }

    // create new revalidation run
    const newRun = await this.app?.prisma.revalidationRun.create({
      data: {
        chainId,
        contractAddress,
        status: "in_progress",
        lastTokenIdProcessed: startTokenId,
      },
    });

    if (!newRun) {
      throw new Error(
        `Failed to create revalidation run for ${contractAddress} on chain ${chainId}`
      );
    }

    return newRun;
  }

  /**
   * Revalidate token ownership for a contract
   * This function will try different methods to check token ownership
   */
  public async revalidate(
    chainId: number,
    contractAddress: Address,
    tokenType: TokenType,
    startTokenId?: string
  ): Promise<boolean> {
    if (!this.app?.prisma) {
      log.error("Prisma client not available");
      return false;
    }

    // Get the contract from the database
    const contract = await this.app.prisma.nft.findUnique({
      where: {
        chainId_contractAddress: {
          chainId,
          contractAddress,
        },
      },
    });

    if (!contract) {
      log.error(
        `NFT not found for contract ${contractAddress} on chain ${chainId}`
      );
      return false;
    }

    // Get the revalidation run (new or existing)
    const revalidationRun = await this.getRevalidationRun(
      chainId,
      contractAddress,
      startTokenId
    );

    log.info(
      `Revalidating tokens for contract ${contractAddress} on chain ${chainId}${
        startTokenId ? ` starting from token ID ${startTokenId}` : ""
      }`
    );

    let success = false;

    log.info(`Created revalidation run with ID ${revalidationRun.id}`);

    try {
      // Try different methods based on token type
      if (tokenType === TokenType.ERC721) {
        // Try ownerOf method first
        success = await this.revalidateWithOwnerOf(
          chainId,
          contractAddress,
          parseInt(contract.supply ?? "0"),
          revalidationRun.id,
          startTokenId ? parseInt(startTokenId) : 0
        );

        // If ownerOf failed, try tokenOfOwnerByIndex
        if (!success) {
          success = await this.revalidateWithTokenByIndex(
            chainId,
            contractAddress,
            parseInt(contract.supply ?? "0"),
            revalidationRun.id,
            startTokenId ? parseInt(startTokenId) : 0
          );
        }
      } else if (tokenType === TokenType.ERC1155) {
        // erc1155 doesn't have a way to check token ownership without addresses
        success = false;
      }

      // Update the revalidation run record with the final status
      await this.app.prisma.revalidationRun.update({
        where: { id: revalidationRun.id },
        data: {
          status: success ? "completed" : "failed",
          updatedAt: new Date(),
        },
      });

      return success;
    } catch (error) {
      // Update the revalidation run record with error status
      await this.app.prisma.revalidationRun.update({
        where: { id: revalidationRun.id },
        data: {
          status: "failed",
          updatedAt: new Date(),
        },
      });

      log.error(`Error during revalidation: ${error}`);
      return false;
    }
  }

  /**
   * Revalidate tokens using the ownerOf method (ERC721)
   */
  private async revalidateWithOwnerOf(
    chainId: number,
    contractAddress: Address,
    supply: number,
    revalidationRunId: number,
    startTokenId: number = 0
  ): Promise<boolean> {
    try {
      log.info(
        `Revalidating with ownerOf for ${contractAddress} starting from token ID ${startTokenId}`
      );

      const client = this.getChainClient(chainId);
      if (!client) {
        log.error(`Failed to get client for chain ${chainId}`);
        return false;
      }

      const contract = getContract({
        address: contractAddress,
        abi: erc721Abi,
        client,
      });

      // Process tokens in batches of 10
      const batchSize = 10;
      let successCount = 0;
      let failureCount = 0;

      for (let i = startTokenId; i < supply; i += batchSize) {
        let batchSuccess = false;

        for (
          let tokenId = i;
          tokenId < i + batchSize && tokenId < supply;
          tokenId++
        ) {
          try {
            // Call ownerOf for each token
            const owner = await contract.read.ownerOf([BigInt(tokenId)]);

            // If the owner has changed, update the database
            await this.updateTokenOwner(
              chainId,
              contractAddress,
              tokenId.toString(),
              owner.toLowerCase() as Address
            );

            batchSuccess = true;
            successCount++;

            // Update the revalidation run with the last processed token ID
            await this.app?.prisma.revalidationRun.update({
              where: { id: revalidationRunId },
              data: {
                lastTokenIdProcessed: tokenId.toString(),
                tokensProcessed: successCount,
                updatedAt: new Date(),
              },
            });
          } catch (error) {
            failureCount++;
            log.warn(`Failed to check ownerOf for token ${tokenId}: ${error}`);
          }
        }

        // If the first batch completely fails, consider it a failure
        if (i === startTokenId && !batchSuccess) {
          log.error(
            `First batch of ownerOf checks failed for ${contractAddress}`
          );
          return false;
        }

        // If a batch completely fails, consider the method exhausted
        if (!batchSuccess) {
          log.info(
            `Batch ${(i - startTokenId) / batchSize} failed completely, stopping ownerOf checks`
          );
          break;
        }
      }

      log.info(
        `ownerOf revalidation complete: ${successCount} successes, ${failureCount} failures`
      );
      return successCount > 0;
    } catch (error) {
      log.error(`Error in revalidateWithOwnerOf: ${error}`);
      return false;
    }
  }

  /**
   * Revalidate tokens using the tokenOfOwnerByIndex method (ERC721)
   */
  private async revalidateWithTokenByIndex(
    chainId: number,
    contractAddress: Address,
    supply: number,
    revalidationRunId: number,
    startTokenId: number = 0
  ): Promise<boolean> {
    try {
      log.info(
        `Revalidating with tokenOfOwnerByIndex for ${contractAddress} starting from token ID ${startTokenId}`
      );

      const client = this.getChainClient(chainId);
      if (!client) {
        log.error(`Failed to get client for chain ${chainId}`);
        return false;
      }

      const contract = getContract({
        address: contractAddress,
        abi: erc721Abi,
        client,
      });

      // Process owners in batches of 10
      const batchSize = 10;
      let successCount = 0;
      let failureCount = 0;

      for (let i = startTokenId; i < supply; i += batchSize) {
        let batchSuccess = false;

        for (
          let tokenId = i;
          tokenId < i + batchSize && tokenId < supply;
          tokenId++
        ) {
          try {
            // Try to get the first token for this owner
            const owner = await contract.read.ownerOf([BigInt(tokenId)]);

            // If we got a token, the owner is valid
            batchSuccess = true;
            successCount++;

            // Check if this token is in our database
            const token = await this.app?.prisma.nftToken.findUnique({
              where: {
                chainId_contractAddress_tokenId: {
                  chainId,
                  contractAddress,
                  tokenId: tokenId.toString(),
                },
              },
            });
            if (!token) {
              // This is a new token, add it to the database
              await this.app?.prisma.nftToken.create({
                data: {
                  chainId,
                  contractAddress,
                  tokenId: tokenId.toString(),
                  ownerAddress: owner as Address,
                },
              });
            }

            // Update the revalidation run with the last processed token ID
            await this.app?.prisma.revalidationRun.update({
              where: { id: revalidationRunId },
              data: {
                lastTokenIdProcessed: tokenId.toString(),
                tokensProcessed: successCount,
                updatedAt: new Date(),
              },
            });
          } catch (error) {
            failureCount++;
            log.warn(
              `Failed to check tokenOfOwnerByIndex for token ${tokenId}: ${error}`
            );
          }
        }

        // If the first batch completely fails, consider it a failure
        if (i === startTokenId && !batchSuccess) {
          log.error(
            `First batch of tokenOfOwnerByIndex checks failed for ${contractAddress}`
          );
          return false;
        }

        // If a batch completely fails, consider the method exhausted
        if (!batchSuccess) {
          log.info(
            `Batch ${(i - startTokenId) / batchSize} failed completely, stopping tokenOfOwnerByIndex checks`
          );
          break;
        }
      }

      log.info(
        `tokenOfOwnerByIndex revalidation complete: ${successCount} successes, ${failureCount} failures`
      );
      return successCount > 0;
    } catch (error) {
      log.error(`Error in revalidateWithTokenOfOwnerByIndex: ${error}`);
      return false;
    }
  }

  /**
   * Update the owner of a token in the database
   */
  private async updateTokenOwner(
    chainId: number,
    contractAddress: Address,
    tokenId: string,
    newOwner: Address
  ): Promise<void> {
    if (!this.app?.prisma) return;

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
          ownerAddress: newOwner,
          updatedAt: new Date(),
        },
        create: {
          chainId,
          contractAddress,
          tokenId,
          ownerAddress: newOwner,
        },
      });
      log.info(`Updated owner of token ${tokenId} to ${newOwner}`);
    } catch (error) {
      log.error(`Error updating token owner: ${error}`);
    }
  }

  /**
   * Mark a token as having an unknown owner
   */
  private async markTokenAsUnknownOwner(
    chainId: number,
    contractAddress: Address,
    tokenId: string
  ): Promise<void> {
    if (!this.app?.prisma) return;

    try {
      await this.app.prisma.nftToken.update({
        where: {
          chainId_contractAddress_tokenId: {
            chainId,
            contractAddress,
            tokenId,
          },
        },
        data: {
          ownerAddress: null,
          updatedAt: new Date(),
        },
      });
      log.info(`Marked token ${tokenId} as having unknown owner`);
    } catch (error) {
      log.error(`Error marking token as unknown owner: ${error}`);
    }
  }

  /**
   * Add a new token to the database
   */
  private async addNewToken(
    chainId: number,
    contractAddress: Address,
    tokenId: string,
    owner: Address
  ): Promise<void> {
    if (!this.app?.prisma) return;

    try {
      await this.app.prisma.nftToken.create({
        data: {
          chainId,
          contractAddress,
          tokenId,
          ownerAddress: owner,
          supply: "1", // For ERC721 tokens
        },
      });
      log.info(`Added new token ${tokenId} with owner ${owner}`);
    } catch (error) {
      log.error(`Error adding new token: ${error}`);
    }
  }

  /**
   * Get metadata from a contract
   * Attempts to retrieve various metadata fields, handling the case where methods may not be implemented
   */
  public async getMetadata(
    chainId: number,
    address: Address,
    tokenType: TokenType
  ): Promise<ContractMetadata> {
    const client = this.getChainClient(chainId);
    if (!client) {
      log.error(`Failed to get client for chain ${chainId}`);
      return {};
    }

    const metadata: ContractMetadata = {};

    // Get the appropriate ABI based on token type
    const abi = tokenType === TokenType.ERC721 ? erc721Abi : erc1155Abi;

    const contract = getContract({
      address,
      abi,
      client,
    });

    // Helper function to safely call a contract method
    const safeCall = async <T>(
      methodName: string,
      args: any[] = []
    ): Promise<T | undefined> => {
      try {
        // Use type assertion to access methods dynamically
        const method = (contract.read as any)[methodName];
        if (typeof method === "function") {
          const result = await method(args);
          log.info(`Retrieved ${methodName} for ${address}: ${result}`);
          return result as T;
        }
        return undefined;
      } catch (error) {
        log.warn(`Contract ${address} does not implement ${methodName} method`);
        return undefined;
      }
    };

    // Try to get name
    metadata.name = await safeCall<string>("name");

    // Try to get symbol
    metadata.symbol = await safeCall<string>("symbol");

    // Try to get totalSupply
    metadata.supply =
      (await safeCall<bigint>("totalSupply")) ??
      (await safeCall<bigint>("supply"));

    // Try to get maxSupply (less common, might be named differently in different contracts)
    metadata.maxSupply =
      (await safeCall<bigint>("maxSupply")) ??
      (await safeCall<bigint>("MAX_SUPPLY"));

    // Try to get owner
    metadata.owner =
      (await safeCall<Address>("owner")) ??
      (await safeCall<Address>("getOwner"));

    // Try to get contractURI (EIP-7572)
    metadata.contractURI = await safeCall<string>("contractURI");

    return metadata;
  }
}
