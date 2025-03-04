//transport: http(""),

import {
  createPublicClient,
  http,
  HttpTransport,
  webSocket,
  WebSocketTransport,
} from "viem";
import { SUPPORTED_CHAINS, TRANSPORT_URIS } from "~/constants";

export function getHttpClient(chainId: number) {
  const uri = TRANSPORT_URIS[chainId];
  console.log(`uri: ${uri}`);
  let transport: HttpTransport = http();
  if (uri) {
    console.log(`https${uri}`);
    transport = http(`https${uri}`);
  }
  const client = createPublicClient({
    chain: SUPPORTED_CHAINS[chainId],
    transport,
  });

  return client;
}

export function getWssClient(chainId: number) {
  const uri = TRANSPORT_URIS[chainId];
  console.log(`uri: ${uri}`, chainId);
  let transport: WebSocketTransport = webSocket();
  if (uri) {
    console.log(`wss${uri}`);
    transport = webSocket(`wss${uri}`);
  }
  const client = createPublicClient({
    chain: SUPPORTED_CHAINS[chainId],
    transport: transport,
  });

  return client;
}
