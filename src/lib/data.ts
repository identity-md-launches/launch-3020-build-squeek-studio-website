import type { Address } from "viem";
import {
  API,
  COLLECTION,
  STAKING,
  client,
  nftAbi,
  stakeAbi,
  transferEvent,
  DEPLOY_BLOCK,
} from "./chain";
import { cached, remember } from "./cache";
import { parseToken, ownership, stakedDays, type Activity } from "./core";
import type { Token, Facts, Snapshot, Wheel } from "./types";
export class DataError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
export async function api(path: string) {
  const r = await fetch(API + path, {
    signal: AbortSignal.timeout(10000),
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!r.ok) throw new DataError("apiFailed");
  const j = await r.json();
  if (j.status === "unavailable") throw new DataError("apiFailed");
  return j;
}
export async function pages(address: string, activity = false) {
  let cursor: string | null = null;
  const rows: any[] = [];
  let seen = new Set<string>();
  do {
    const j = await api(
      `/accounts/${address}${activity ? "/activity" : ""}${cursor ? "?cursor=" + encodeURIComponent(cursor) : ""}`,
    );
    rows.push(...(activity ? j.activity || [] : j.tokens || []));
    cursor = j.nextCursor;
    if (cursor) {
      if (seen.has(cursor)) throw new DataError("apiFailed");
      seen.add(cursor);
    }
  } while (cursor);
  return rows;
}
export function normalizeActivity(rows: any[]): Activity[] {
  return rows.flatMap((e) => {
    const collection =
      typeof e.collection === "string" ? e.collection : e.collection?.address;
    if (collection && collection.toLowerCase() !== COLLECTION.toLowerCase())
      return [];
    const ids = e.tokenIds || [e.tokenId ?? e.nft?.tokenId];
    return ids
      .filter((id: any) => id != null)
      .map((id: any) => ({
        tokenId: id,
        type: e.kind || e.type || "",
        timestamp: e.source?.blockTimestamp || e.timestamp,
        collection: e.collection,
      }));
  });
}
export async function loadExamples(): Promise<Token[]> {
  const r = await fetch("./examples.json");
  if (!r.ok) throw new DataError("loadFailed");
  const tokens: Token[] = await r.json();
  for (const t of tokens) await remember("token:" + t.id, t);
  return tokens;
}
export async function loadSnapshot(): Promise<Snapshot | null> {
  try {
    const r = await fetch("./traits-snapshot.json");
    if (!r.ok) return null;
    const j = await r.json();
    return j.schemaVersion === 1 && j.tokens ? j : null;
  } catch {
    return null;
  }
}
export async function loadToken(id: number): Promise<Token> {
  const hit = await cached<Token>("token:" + id);
  if (hit) return hit;
  try {
    const reads = await client.multicall({
      allowFailure: true,
      contracts: [
        {
          address: COLLECTION,
          abi: nftAbi,
          functionName: "tokenURI",
          args: [BigInt(id)],
        },
      ],
    });
    if (reads[0].status !== "success") throw new DataError("tokenFailed");
    const t = parseToken(id, String(reads[0].result));
    await remember("token:" + id, t);
    return t;
  } catch {
    throw new DataError("tokenFailed");
  }
}
export const unknownFacts = (): Facts => ({
  custody: "unknown",
  level: null,
  stakedDays: null,
});
export async function readCustody(id: number): Promise<Facts> {
  const results = await client.multicall({
    contracts: [
      {
        address: COLLECTION,
        abi: nftAbi,
        functionName: "ownerOf",
        args: [BigInt(id)],
      },
      {
        address: STAKING,
        abi: stakeAbi,
        functionName: "depositor",
        args: [COLLECTION, BigInt(id)],
      },
    ],
    allowFailure: true,
  });
  if (results[0].status !== "success") throw new DataError("ownershipFailed");
  const owner = results[0].result as string;
  const deposited = owner.toLowerCase() === STAKING.toLowerCase();
  const depositor =
    results[1].status === "success" ? String(results[1].result) : undefined;
  return {
    owner,
    holder:
      deposited && depositor && !/^0x0{40}$/i.test(depositor)
        ? depositor
        : deposited
          ? undefined
          : owner,
    custody: deposited ? "staked" : "wallet",
    level: null,
    stakedDays: null,
    checkedAt: new Date().toISOString(),
  };
}
export async function loadFacts(id: number): Promise<Facts> {
  let facts: Facts;
  try {
    facts = await readCustody(id);
  } catch {
    const hit = await cached<Facts>("facts:" + id);
    return hit
      ? { ...hit, cached: true }
      : { ...unknownFacts(), unavailable: true };
  }
  if (facts.holder) {
    try {
      const tokens = await pages(facts.holder);
      const row = tokens.find((t: any) => Number(t.tokenId) === id);
      if (row) {
        const n = Number(row.level);
        facts.level =
          row.level !== "unavailable" &&
          row.level !== null &&
          row.level !== undefined &&
          Number.isFinite(n)
            ? n
            : null;
        facts.merge =
          typeof row.mergeState === "string" ? row.mergeState : undefined;
      }
      if (facts.custody === "staked") {
        try {
          facts.stakedDays = stakedDays(
            normalizeActivity(await pages(facts.holder, true)),
            id,
            true,
          );
        } catch {
          /* Unknown deposit age stays unknown. */
        }
      }
    } catch {
      /* Custody is still available when level API is not. */
    }
  }
  await remember("facts:" + id, facts);
  return facts;
}
export async function loadWheel(): Promise<Wheel> {
  try {
    const j = await api("/status");
    const m = j.measurement;
    const observed = Date.parse(m?.observedAt || "");
    const fresh =
      m?.freshness === "online" &&
      Number.isFinite(observed) &&
      Math.abs(Date.now() - observed) <=
        Math.max(30, Number(m.staleAfterSeconds) || 120) * 1000;
    const state =
      fresh && ["ACTIVE", "IDLE"].includes(m?.coreStatus)
        ? m.coreStatus
        : "unknown";
    return {
      state,
      rpm:
        state !== "unknown" &&
        m.rpmMilli !== null &&
        m.rpmMilli !== "unavailable" &&
        m.rpmMilli !== undefined
          ? Number(m.rpmMilli) / 1000
          : null,
      block:
        j.builder?.anchor?.blockHeight && j.builder?.status !== "unavailable"
          ? String(j.builder.anchor.blockHeight)
          : null,
      at: m?.observedAt || null,
    };
  } catch {
    return { state: "unknown", rpm: null, block: null, at: null };
  }
}
export async function walletSqueeks(
  wallet: Address,
  snapshot: Snapshot | null,
  progress: (n: number) => void,
) {
  const old = await cached<number[]>("wallet:" + wallet.toLowerCase());
  try {
    const candidates = new Set<number>();
    let indexed = true;
    try {
      const [incoming, deposits] = await Promise.all([
        client.getLogs({
          address: COLLECTION,
          event: transferEvent,
          args: { to: wallet },
          fromBlock: DEPLOY_BLOCK,
          toBlock: "latest",
        }),
        client.getLogs({
          address: COLLECTION,
          event: transferEvent,
          args: { to: STAKING },
          fromBlock: DEPLOY_BLOCK,
          toBlock: "latest",
        }),
      ]);
      for (const l of incoming) candidates.add(Number(l.args.tokenId));
      // Query every historically deposited ID, including deposits made by an operator.
      // A depositor need not have been the Transfer event's `from` address.
      const depositedIds = [
        ...new Set(deposits.map((log) => Number(log.args.tokenId))),
      ];
      for (let offset = 0; offset < depositedIds.length; offset += 180) {
        const batch = depositedIds.slice(offset, offset + 180);
        const reads = await client.multicall({
          allowFailure: true,
          contracts: batch.map((id) => ({
            address: STAKING,
            abi: stakeAbi,
            functionName: "depositor",
            args: [COLLECTION, BigInt(id)],
          })),
        });
        if (!reads.some((row) => row.status === "success"))
          throw new DataError("ownershipFailed");
        reads.forEach((row, i) => {
          if (
            row.status === "success" &&
            String(row.result).toLowerCase() === wallet.toLowerCase()
          )
            candidates.add(batch[i]);
        });
        progress(
          Math.round(
            Math.min(1, (offset + 180) / Math.max(depositedIds.length, 1)) * 70,
          ),
        );
      }
    } catch {
      indexed = false;
    }
    try {
      for (const t of await pages(wallet)) candidates.add(Number(t.tokenId));
    } catch {
      /* Logs or a full scan are authoritative. */
    }
    if (!indexed) {
      let max = snapshot?.maxId || 0;
      let knownIssuedBound = !!snapshot;

      try {
        const economy = await api("/economy/state");
        const issued = Number(economy.nft?.issued);
        if (Number.isSafeInteger(issued) && issued > 0) {
          max = Math.max(max, issued);
          knownIssuedBound = true;
        }
      } catch {}
      if (!knownIssuedBound) {
        const mints = await client.getLogs({
          address: COLLECTION,
          event: transferEvent,
          args: { from: "0x0000000000000000000000000000000000000000" },
          fromBlock: DEPLOY_BLOCK,
          toBlock: "latest",
        });
        for (const log of mints) max = Math.max(max, Number(log.args.tokenId));
        if (!max) throw new DataError("ownershipFailed");
      }
      for (let id = 1; id <= max; id++) candidates.add(id);
    }
    const ids = [...candidates].filter((n) => Number.isSafeInteger(n) && n > 0);
    const owned: number[] = [];
    for (let start = 0; start < ids.length; start += 60) {
      const batch = ids.slice(start, start + 60);
      const rows = await client.multicall({
        allowFailure: true,
        contracts: batch.flatMap((id) => [
          {
            address: COLLECTION,
            abi: nftAbi,
            functionName: "ownerOf",
            args: [BigInt(id)],
          },
          {
            address: STAKING,
            abi: stakeAbi,
            functionName: "depositor",
            args: [COLLECTION, BigInt(id)],
          },
        ]),
      });
      if (!rows.some((row) => row.status === "success"))
        throw new DataError("ownershipFailed");
      batch.forEach((id, i) => {
        const owner = rows[i * 2];
        const deposit = rows[i * 2 + 1];
        if (
          owner.status === "success" &&
          ownership(
            wallet,
            String(owner.result),
            String(owner.result).toLowerCase() === STAKING.toLowerCase() &&
              deposit.status === "success"
              ? String(deposit.result)
              : undefined,
          )
        )
          owned.push(id);
      });
      progress(
        Math.round(
          70 + Math.min(1, (start + 60) / Math.max(ids.length, 1)) * 30,
        ),
      );
    }
    await remember("wallet:" + wallet.toLowerCase(), owned);
    return { ids: owned, cached: false };
  } catch {
    if (old) return { ids: old, cached: true };
    throw new DataError("ownershipFailed");
  }
}
export async function latestSqueeks() {
  const previous = await cached<number[]>("latest");
  try {
    let end = await client.getBlockNumber();
    const found = new Set<number>();
    const seen = new Set<number>();
    while (end >= DEPLOY_BLOCK && found.size < 100) {
      const start = end - 1800n > DEPLOY_BLOCK ? end - 1800n : DEPLOY_BLOCK;
      const logs = await client.getLogs({
        address: COLLECTION,
        event: transferEvent,
        fromBlock: start,
        toBlock: end,
      });
      for (const l of logs.reverse()) {
        const id = Number(l.args.tokenId);
        if (seen.has(id)) continue;
        seen.add(id);
        if (l.args.to === "0x0000000000000000000000000000000000000000")
          continue;
        found.add(Number(l.args.tokenId));
        if (found.size === 100) break;
      }
      if (start === DEPLOY_BLOCK) break;
      end = start - 1n;
    }
    const ids = [...found];
    await remember("latest", ids);
    return { ids, cached: false };
  } catch {
    if (previous) return { ids: previous, cached: true };
    throw new DataError("galleryFailed");
  }
}
