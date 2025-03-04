import { TokenType } from "~/services/contract-event-watcher";
import { NftType } from "@prisma/client";
import log from "electron-log";

/**
 * Convert a string to the TokenType enum
 * @param tokenTypeString The string representation of a token type
 * @returns The corresponding TokenType enum value or undefined if not found
 */
export function stringToTokenType(
  tokenTypeString: string
): TokenType | undefined {
  const normalizedType = tokenTypeString.toUpperCase();

  switch (normalizedType) {
    case "ERC20":
    case "ERC-20":
      return TokenType.ERC20;

    case "ERC721":
    case "ERC-721":
    case "NFT":
      return TokenType.ERC721;

    case "ERC1155":
    case "ERC-1155":
      return TokenType.ERC1155;

    default:
      log.warn(`Unknown token type string: ${tokenTypeString}`);
      return undefined;
  }
}

/**
 * Convert a NftType enum to the TokenType enum
 * @param nftType The NftType enum value
 * @returns The corresponding TokenType enum value
 */
export function nftTypeToTokenType(nftType: NftType): TokenType {
  switch (nftType) {
    case NftType.ERC721:
      return TokenType.ERC721;
    case NftType.ERC1155:
      return TokenType.ERC1155;
    default:
      // This should never happen if all enum values are handled
      const exhaustiveCheck: never = nftType;
      throw new Error(`Unhandled NftType: ${exhaustiveCheck}`);
  }
}

/**
 * Convert a TokenType enum to the NftType enum
 * @param tokenType The TokenType enum value
 * @returns The corresponding NftType enum value or undefined if not an NFT type
 */
export function tokenTypeToNftType(tokenType: TokenType): NftType | undefined {
  switch (tokenType) {
    case TokenType.ERC721:
      return NftType.ERC721;
    case TokenType.ERC1155:
      return NftType.ERC1155;
    case TokenType.ERC20:
      return undefined; // ERC20 is not an NFT type
    default:
      // This should never happen if all enum values are handled
      const exhaustiveCheck: never = tokenType;
      throw new Error(`Unhandled TokenType: ${exhaustiveCheck}`);
  }
}
