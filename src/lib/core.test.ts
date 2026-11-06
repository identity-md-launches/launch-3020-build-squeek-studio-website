import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ownership,
  rarity,
  rarityIndex,
  decoration,
  layout,
  SIZES,
  extractColors,
  stakedDays,
  parseToken,
  svgText,
} from "./core";
import type { Snapshot } from "./types";
const w = "0xABC123";
test("ownership resolves held and deposited NFTs case-insensitively", () => {
  assert.equal(ownership(w, "0xabc123"), "held");
  assert.equal(ownership(w, "0xstaking", "0xabc123"), "deposited");
  assert.equal(ownership(w, "0xother", "0xother"), null);
  assert.equal(ownership(w, undefined, undefined), null);
  assert.equal(
    ownership(
      "0x0000000000000000000000000000000000000000",
      "0xstaking",
      "0x0000000000000000000000000000000000000000",
    ),
    null,
  );
});
const snapshot: Snapshot = {
  schemaVersion: 1,
  blockNumber: "123",
  date: "2026-11-06",
  supply: 4,
  traits: ["Palette", "Eyes"],
  tokens: {
    1: ["red", "round"],
    2: ["red", "sleepy"],
    3: ["blue", "round"],
    4: ["green", "round"],
  },
  skipped: [],
  maxId: 4,
  chainId: 11155111,
  contract: "collection",
  source: "rpc",
};
test("rarity counts value within its trait, uses snapshot population and scores new values as 0%", () => {
  const index = rarityIndex(snapshot);
  const result = rarity(
    [
      { trait_type: "Palette", value: "red" },
      { trait_type: "Eyes", value: "round" },
      { trait_type: "Palette", value: "new" },
    ],
    snapshot,
    index,
  );
  assert.deepEqual(
    result.map((r) => [r.count, r.share]),
    [
      [2, 0.5],
      [3, 0.75],
      [0, 0],
    ],
  );
  assert.deepEqual(rarity([], null), []);
  assert.deepEqual(rarity([], { ...snapshot, tokens: {} }), []);
});
test("level frame boundaries are explicit; unavailable is not bronze", () => {
  const levels = [null, 1, 2, 3, 4, 5, 7, 8, 10];
  assert.deepEqual(
    levels.map(
      (level) =>
        decoration({ level, stakedDays: null, custody: "wallet" }).frame,
    ),
    [
      null,
      "bronze",
      "bronze",
      "silver",
      "silver",
      "gold",
      "gold",
      "neon",
      "neon",
    ],
  );
});
test("ribbons require current staking and exact 7/30/90-day thresholds; rare foil is strictly under 2%", () => {
  const results = [null, 0, 6, 7, 29, 30, 89, 90].map((stakedDays) =>
    decoration({ level: 1, stakedDays, custody: "staked" }, 0.019),
  );
  assert.deepEqual(
    results.map((d) => d.ribbon),
    [null, null, null, 7, 7, 30, 30, 90],
  );
  assert.equal(
    decoration({ level: 1, stakedDays: 90, custody: "wallet" }, 0.02).ribbon,
    null,
  );
  assert.equal(
    decoration({ level: 1, stakedDays: 90, custody: "staked" }, 0.02).foil,
    false,
  );
  assert.equal(results[0].foil, true);
  assert.equal(
    decoration({ level: null, stakedDays: null, custody: "unknown" }).foil,
    false,
  );
});
test("all output dimensions and X safe zones match the contract", () => {
  assert.deepEqual(SIZES, {
    pfp: [1000, 1000],
    banner: [1500, 500],
    phone: [1170, 2532],
    desktop: [2560, 1440],
    stickers: [512, 512],
    id: [1200, 750],
  });
  assert.deepEqual(layout("pfp").circle, { x: 500, y: 500, r: 460 });
  assert.equal(layout("banner").content.x, 600);
  assert.equal(layout("banner").avatar?.width, 600);
  assert.equal(layout("phone").width, 1170);
});
test("SVG palette extraction includes group colors, deduplicates, ignores resource URLs and currentColor", () => {
  const svg =
    '<g color="#aabbcc"><path fill="currentColor"/><rect fill="#08080A"/><g color="#aabbcc"/><path fill="rgb(5, 9, 12)"/><path fill="url(https://bad.example/a)"/></g>';
  assert.deepEqual(extractColors(svg), ["#aabbcc", "#08080A", "rgb(5, 9, 12)"]);
});
test("staking age uses earliest deposit in current period, not a previous stake or repeated deposit", () => {
  const events = [
    { type: "nft_deposited", tokenId: 1, timestamp: "2026-01-01T00:00:00Z" },
    { type: "nft_withdrawn", tokenId: 1, timestamp: "2026-01-20T00:00:00Z" },
    { type: "nft_deposited", tokenId: 1, timestamp: "2026-02-01T00:00:00Z" },
    { type: "nft_deposited", tokenId: 1, timestamp: "2026-02-02T00:00:00Z" },
    { type: "nft_deposited", tokenId: 2, timestamp: "2025-01-01T00:00:00Z" },
  ];
  assert.equal(
    stakedDays(events.reverse(), 1, true, Date.parse("2026-02-10T00:00:00Z")),
    9,
  );
  assert.equal(stakedDays(events, 1, false), null);
  assert.equal(stakedDays([], 1, true), null);
  assert.equal(
    stakedDays(
      [{ type: "deposit", tokenId: 1, timestamp: "unavailable" }],
      1,
      true,
    ),
    null,
  );
});
test("data URI parser accepts on-chain metadata and rejects remote artwork", () => {
  const svg = "data:image/svg+xml;base64," + btoa("<svg/>");
  const uri =
    "data:application/json;base64," +
    btoa(
      JSON.stringify({
        name: "Squeek #1",
        image: svg,
        attributes: [{ trait_type: "Palette", value: "blue" }],
      }),
    );
  assert.equal(parseToken(1, uri).id, 1);
  assert.equal(svgText(svg), "<svg/>");
  assert.throws(() => parseToken(1, "https://example.org/token"));
  assert.throws(() => svgText("https://example.org/image.svg"));
});
