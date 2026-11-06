/** Attribute-only reproducible snapshot. Never writes images to the snapshot. */
import {
  createPublicClient,
  custom,
  decodeFunctionResult,
  encodeFunctionData,
  parseAbi,
} from "viem";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import {
  COLLECTION,
  MULTICALL,
  nftAbi,
  RPCS,
  DEPLOY_BLOCK,
} from "../src/lib/chain";
import { parseToken, TRAITS } from "../src/lib/core";
import type { Snapshot, Token } from "../src/lib/types";
const run = promisify(execFile);
let req = 0;
async function rpc(method: string, params: unknown[]) {
  for (const url of RPCS) {
    try {
      const { stdout } = await run(
        "curl",
        [
          "--silent",
          "--show-error",
          "--fail",
          "--max-time",
          "10",
          url,
          "-H",
          "content-type: application/json",
          "--data-binary",
          JSON.stringify({ jsonrpc: "2.0", id: ++req, method, params }),
        ],
        { maxBuffer: 64 * 1024 * 1024 },
      );
      const j = JSON.parse(stdout);
      if (j.error) throw Error(j.error.message);
      return j.result;
    } catch (e) {
      if (/out of gas|gas required/i.test(String(e)) || url === RPCS.at(-1))
        throw e;
    }
  }
}
const provider = createPublicClient({
  transport: custom({
    request: ({ method, params }: any) => rpc(method, params || []),
  }),
});
const mcAbi = parseAbi([
  "function aggregate3((address target,bool allowFailure,bytes callData)[] calls) payable returns ((bool success,bytes returnData)[])",
]);
const checkpoint = "test/scratch/snapshot-checkpoint.json";
await mkdir("test/scratch", { recursive: true });
let snapshot: Snapshot;
try {
  if (process.argv.includes("--fresh")) throw Error("Start a new snapshot");
  snapshot = JSON.parse(await readFile(checkpoint, "utf8"));
  console.log("Resume snapshot", Object.keys(snapshot.tokens).length);
} catch {
  const block = await provider.getBlockNumber();
  const supply = Number(
    await provider.readContract({
      address: COLLECTION,
      abi: nftAbi,
      functionName: "totalSupply",
      blockNumber: block,
    }),
  );
  // totalSupply is circulating supply. Transfer mints establish the highest issued id, including IDs above supply after burns.
  let maxId = supply;
  const logs = await provider.getLogs({
    address: COLLECTION,
    event: parseAbi([
      "event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)",
    ])[0],
    fromBlock: DEPLOY_BLOCK,
    toBlock: block,
    args: { from: "0x0000000000000000000000000000000000000000" },
  });
  for (const l of logs)
    maxId = Math.max(maxId, Number((l.args as any).tokenId));
  const b = await provider.getBlock({ blockNumber: block });
  snapshot = {
    schemaVersion: 1,
    blockNumber: String(block),
    date: new Date(Number(b.timestamp) * 1000).toISOString(),
    supply,
    traits: TRAITS,
    tokens: {},
    skipped: [],
    maxId,
    chainId: 11155111,
    contract: COLLECTION,
    source: RPCS[0],
  };
  console.log(
    "Snapshot",
    snapshot.blockNumber,
    "circulating",
    supply,
    "issued max",
    maxId,
  );
}
async function existingAt(ids: number[], block: string): Promise<boolean[]> {
  const data = encodeFunctionData({
    abi: mcAbi,
    functionName: "aggregate3",
    args: [
      ids.map((id) => ({
        target: COLLECTION,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: nftAbi,
          functionName: "ownerOf",
          args: [BigInt(id)],
        }),
      })),
    ],
  });
  const raw = await rpc("eth_call", [
    { to: MULTICALL, data },
    "0x" + BigInt(block).toString(16),
  ]);
  const result = decodeFunctionResult({
    abi: mcAbi,
    functionName: "aggregate3",
    data: raw,
  });
  return result.map((r) => r.success);
}
if (process.argv.includes("--rebase")) {
  const priorBlock = snapshot.blockNumber;
  const block = await provider.getBlockNumber();
  const supply = Number(
    await provider.readContract({
      address: COLLECTION,
      abi: nftAbi,
      functionName: "totalSupply",
      blockNumber: block,
    }),
  );
  const mints = await provider.getLogs({
    address: COLLECTION,
    event: parseAbi([
      "event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)",
    ])[0],
    fromBlock: DEPLOY_BLOCK,
    toBlock: block,
    args: { from: "0x0000000000000000000000000000000000000000" },
  });
  let max = snapshot.maxId;
  for (const log of mints)
    max = Math.max(max, Number((log.args as any).tokenId));
  const exists = new Set<number>();
  const skipped: number[] = [];
  for (let first = 1; first <= max; first += 160) {
    const ids = Array.from(
      { length: Math.min(160, max - first + 1) },
      (_, i) => first + i,
    );
    const flags = await existingAt(ids, String(block));
    ids.forEach((id, i) => (flags[i] ? exists.add(id) : skipped.push(id)));
  }
  if (exists.size !== supply) throw Error("Rebased population check failed");
  for (const id of Object.keys(snapshot.tokens))
    if (!exists.has(Number(id))) delete snapshot.tokens[id];
  const b = await provider.getBlock({ blockNumber: block });
  snapshot = {
    ...snapshot,
    blockNumber: String(block),
    date: new Date(Number(b.timestamp) * 1000).toISOString(),
    supply,
    maxId: max,
    skipped,
    immutableReadBlocks: [
      ...new Set([
        ...(snapshot.immutableReadBlocks || [priorBlock]),
        String(block),
      ]),
    ],
  };
  await writeFile(checkpoint, JSON.stringify(snapshot));
  console.log(
    "Rebased population at",
    snapshot.blockNumber,
    "survivors",
    exists.size,
    "reused immutable traits",
    Object.keys(snapshot.tokens).length,
  );
}
const examples: Token[] = [];
async function readBatch(ids: number[]): Promise<void> {
  if (!ids.length) return;
  const calls = ids.map((x) => ({
    target: COLLECTION,
    allowFailure: true,
    callData: encodeFunctionData({
      abi: nftAbi,
      functionName: "tokenURI",
      args: [BigInt(x)],
    }),
  }));
  const data = encodeFunctionData({
    abi: mcAbi,
    functionName: "aggregate3",
    args: [calls],
  });
  let result: any;
  try {
    const raw = await rpc("eth_call", [
      { to: MULTICALL, data },
      "0x" + BigInt(snapshot.blockNumber).toString(16),
    ]);
    result = decodeFunctionResult({
      abi: mcAbi,
      functionName: "aggregate3",
      data: raw,
    });
  } catch (e) {
    if (/historical state|state is not available/i.test(String(e))) throw e;
    if (ids.length > 1) {
      const middle = Math.floor(ids.length / 2);
      await readBatch(ids.slice(0, middle));
      await readBatch(ids.slice(middle));
      return;
    }
    throw e;
  }
  for (let i = 0; i < ids.length; i++) {
    const r = result[i];
    if (!r.success) {
      // A renderer can exhaust aggregate gas. Check existence before treating a failed URI as a burn.
      const owners = await existingAt([ids[i]], snapshot.blockNumber);
      if (owners[0]) {
        if (ids.length === 1)
          throw Error("Existing tokenURI failed at " + ids[i]);
        await readBatch([ids[i]]);
      } else if (!snapshot.skipped.includes(ids[i]))
        snapshot.skipped.push(ids[i]);
      continue;
    }
    const uri = decodeFunctionResult({
      abi: nftAbi,
      functionName: "tokenURI",
      data: r.returnData,
    });
    const t = parseToken(ids[i], uri as string);
    snapshot.tokens[ids[i]] = TRAITS.map((n) => {
      const attr = t.attributes.find(
        (a: { trait_type: string; value: string }) => a.trait_type === n,
      );
      if (!attr) throw Error("Missing trait " + n + " in Squeek " + ids[i]);
      return attr.value;
    });
    if (ids[i] <= 6) examples.push(t);
  }
}
// Recheck a resumed checkpoint's failures so an interrupted/limited provider never creates false burns.
if (snapshot.skipped.length) {
  const prior = [...snapshot.skipped];
  snapshot.skipped = [];
  for (let i = 0; i < prior.length; i += 60) {
    const batch = prior.slice(i, i + 60);
    const owners = await existingAt(batch, snapshot.blockNumber);
    for (let j = 0; j < batch.length; j++) {
      if (owners[j]) await readBatch([batch[j]]);
      else snapshot.skipped.push(batch[j]);
    }
  }
  console.log("Verified checkpoint burn IDs", snapshot.skipped.length);
}
for (let id = 1; id <= snapshot.maxId; id += 8) {
  const ids = Array.from(
    { length: Math.min(8, snapshot.maxId - id + 1) },
    (_, i) => id + i,
  ).filter((x) => !snapshot.tokens[x] && !snapshot.skipped.includes(x));
  if (!ids.length) continue;
  try {
    await Promise.all([readBatch(ids.slice(0, 4)), readBatch(ids.slice(4))]);
  } catch (e) {
    await writeFile(checkpoint, JSON.stringify(snapshot));
    throw e;
  }
  if (examples.length)
    await writeFile("public/examples.json", JSON.stringify(examples));
  if (id % 80 === 1) {
    await writeFile(checkpoint, JSON.stringify(snapshot));
    console.log(
      "Read through",
      id,
      "attributes",
      Object.keys(snapshot.tokens).length,
      "burned",
      snapshot.skipped.length,
    );
  }
}
if (Object.keys(snapshot.tokens).length !== snapshot.supply)
  throw Error(
    "Snapshot population does not equal totalSupply: " +
      Object.keys(snapshot.tokens).length +
      " vs " +
      snapshot.supply,
  );
await writeFile("public/traits-snapshot.json", JSON.stringify(snapshot));
await writeFile(checkpoint, JSON.stringify(snapshot));
console.log(
  "Done",
  Object.keys(snapshot.tokens).length,
  "records",
  Buffer.byteLength(JSON.stringify(snapshot)),
  "bytes",
);
