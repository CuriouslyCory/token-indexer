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
