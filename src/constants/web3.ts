import {
  mainnet,
  sepolia,
  base,
  optimism,
  arbitrum,
  polygon,
  type Chain,
} from "viem/chains";

/**
 * Map of supported chains by chain ID
 */
export const SUPPORTED_CHAINS: Record<number, Chain> = {
  1: mainnet,
  11155111: sepolia,
  8453: base,
  10: optimism,
  42161: arbitrum,
  137: polygon,
};

export const TRANSPORT_URIS: Record<number, string> = {
  1: "://eth-mainnet.g.alchemy.com/v2/CXw8NZgKdl9PXMyuKJqefR_Z1jzyRJkY",
  137: "://polygon-mainnet.g.alchemy.com/v2/CXw8NZgKdl9PXMyuKJqefR_Z1jzyRJkY",
  11155111: "://sepolia.infura.io/ws/v3/CXw8NZgKdl9PXMyuKJqefR_Z1jzyRJkY",
  8453: "://base-mainnet.g.alchemy.com/v2/CXw8NZgKdl9PXMyuKJqefR_Z1jzyRJkY",
};
