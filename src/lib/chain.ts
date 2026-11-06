import {
  createPublicClient,
  fallback,
  http,
  parseAbi,
  parseAbiItem,
} from "viem";
import { sepolia } from "viem/chains";
export const COLLECTION = "0xc4c7982657f00509548f3a3a41db7fa439a6856b" as const;
export const STAKING = "0x50fd1780526c3186a0c037c7622203bc4fb611ca" as const;
export const MULTICALL = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
export const RPCS = [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://sepolia.gateway.tenderly.co",
  "https://1rpc.io/sepolia",
];
export const API = "https://api.squeekchain.com/v1";
export const DEPLOY_BLOCK = 12057769n;
export const nftAbi = parseAbi([
  "function tokenURI(uint256) view returns (string)",
  "function ownerOf(uint256) view returns (address)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function tokenByIndex(uint256) view returns (uint256)",
]);
export const stakeAbi = parseAbi([
  "function depositor(address,uint256) view returns (address)",
]);
export const transferEvent = parseAbiItem(
  "event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)",
);
export const client = createPublicClient({
  chain: sepolia,
  transport: fallback(
    RPCS.map((url) => http(url, { timeout: 10000, retryCount: 0 })),
    { retryCount: 0 },
  ),
  ccipRead: false,
  batch: { multicall: { wait: 12, batchSize: 16000 } },
});
