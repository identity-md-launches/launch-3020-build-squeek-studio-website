import type { Attribute, Facts, Format, Snapshot, TraitStat } from "./types";
export const TRAITS = [
  "Palette",
  "Color Pattern",
  "Body Glyph",
  "Face Glyph",
  "Eye Glyph",
  "Muzzle Glyph",
  "Ear Glyph",
  "Illumination",
  "Eyes",
  "Ears",
  "Background",
];
export const SIZES: Record<Format, [number, number]> = {
  pfp: [1000, 1000],
  banner: [1500, 500],
  phone: [1170, 2532],
  desktop: [2560, 1440],
  stickers: [512, 512],
  id: [1200, 750],
};
export const short = (v: string) =>
  v.length > 13 ? `${v.slice(0, 6)}…${v.slice(-4)}` : v;
export function ownership(
  wallet: string,
  owner?: string,
  depositor?: string,
): "held" | "deposited" | null {
  const w = wallet.toLowerCase();
  if (owner?.toLowerCase() === w) return "held";
  if (depositor?.toLowerCase() === w && !/^0x0{40}$/i.test(depositor))
    return "deposited";
  return null;
}
export function rarityIndex(s: Snapshot): Map<string, number> {
  const m = new Map<string, number>();
  for (const row of Object.values(s.tokens))
    row.forEach((v, i) => {
      const k = s.traits[i] + "\0" + v;
      m.set(k, (m.get(k) || 0) + 1);
    });
  return m;
}
export function rarity(
  attributes: Attribute[],
  snapshot: Snapshot | null,
  index?: Map<string, number>,
): TraitStat[] {
  if (!snapshot) return [];
  const n = Object.keys(snapshot.tokens).length;
  if (!n) return [];
  const counts = index || rarityIndex(snapshot);
  return attributes.map((a) => ({
    ...a,
    count: counts.get(a.trait_type + "\0" + a.value) || 0,
    share: (counts.get(a.trait_type + "\0" + a.value) || 0) / n,
  }));
}
export function decoration(
  facts: Pick<Facts, "level" | "stakedDays" | "custody">,
  rarest?: number,
) {
  return {
    frame:
      facts.level === null
        ? null
        : facts.level >= 8
          ? ("neon" as const)
          : facts.level >= 5
            ? ("gold" as const)
            : facts.level >= 3
              ? ("silver" as const)
              : ("bronze" as const),
    ribbon:
      facts.custody !== "staked" || facts.stakedDays === null
        ? null
        : facts.stakedDays >= 90
          ? 90
          : facts.stakedDays >= 30
            ? 30
            : facts.stakedDays >= 7
              ? 7
              : null,
    foil: rarest !== undefined && rarest < 0.02,
  };
}
export function layout(format: Format) {
  const [w, h] = SIZES[format];
  return {
    width: w,
    height: h,
    circle: format === "pfp" ? { x: 500, y: 500, r: 460 } : null,
    avatar:
      format === "banner" ? { x: 0, y: 300, width: 600, height: 200 } : null,
    content:
      format === "banner"
        ? { x: 600, y: 35, width: 850, height: 400 }
        : { x: w * 0.08, y: h * 0.08, width: w * 0.84, height: h * 0.84 },
  };
}
export function extractColors(svg: string): string[] {
  const colors = [
    ...svg.matchAll(
      /(?:fill|color|stroke)\s*=\s*["'](#[\da-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))["']/gi,
    ),
  ].map((m) => m[1]);
  return [...new Set(colors)];
}
export function svgText(image: string) {
  if (!image.startsWith("data:image/svg+xml"))
    throw Error("Only on-chain SVG is supported");
  return image.includes(";base64,")
    ? new TextDecoder().decode(
        Uint8Array.from(atob(image.split(",")[1]), (c) => c.charCodeAt(0)),
      )
    : decodeURIComponent(image.slice(image.indexOf(",") + 1));
}
export function parseToken(id: number, uri: string) {
  if (!uri.startsWith("data:application/json"))
    throw Error("Expected on-chain JSON");
  const raw = uri.includes(";base64,")
    ? new TextDecoder().decode(
        Uint8Array.from(atob(uri.split(",")[1]), (c) => c.charCodeAt(0)),
      )
    : decodeURIComponent(uri.slice(uri.indexOf(",") + 1));
  const j = JSON.parse(raw);
  if (!String(j.image).startsWith("data:image/svg+xml"))
    throw Error("Expected on-chain SVG");
  return {
    id,
    name: String(j.name),
    image: String(j.image),
    attributes: (j.attributes || []).map((a: Attribute) => ({
      trait_type: String(a.trait_type),
      value: String(a.value),
    })),
  };
}
export type Activity = {
  type: string;
  tokenId?: string | number;
  timestamp?: string;
  collection?: string;
};
export function stakedDays(
  events: Activity[],
  id: number,
  staked: boolean,
  now = Date.now(),
): number | null {
  if (!staked) return null;
  const rows = events
    .filter(
      (e) =>
        String(e.tokenId) === String(id) &&
        e.timestamp &&
        Number.isFinite(Date.parse(e.timestamp)),
    )
    .sort((a, b) => Date.parse(a.timestamp!) - Date.parse(b.timestamp!));
  let since: number | null = null;
  for (const e of rows) {
    if (/withdraw|unstake|merge.*burn/i.test(e.type)) since = null;
    else if (/deposit|stake/i.test(e.type) && since === null)
      since = Date.parse(e.timestamp!);
  }
  return since === null
    ? null
    : Math.max(0, Math.floor((now - since) / 86400000));
}
