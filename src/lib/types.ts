export type Attribute = { trait_type: string; value: string };
export type Token = {
  id: number;
  name: string;
  image: string;
  attributes: Attribute[];
};
export type Snapshot = {
  schemaVersion: 1;
  immutableReadBlocks?: string[];
  blockNumber: string;
  date: string;
  supply: number;
  traits: string[];
  tokens: Record<string, string[]>;
  skipped: number[];
  maxId: number;
  chainId: number;
  contract: string;
  source: string;
};
export type Facts = {
  owner?: string;
  holder?: string;
  custody: "wallet" | "staked" | "unknown";
  level: number | null;
  stakedDays: number | null;
  merge?: string;
  checkedAt?: string;
  cached?: boolean;
  unavailable?: boolean;
};
export type Wheel = {
  state: "ACTIVE" | "IDLE" | "unknown";
  rpm: number | null;
  block: string | null;
  at: string | null;
};
export type Format = "pfp" | "banner" | "phone" | "desktop" | "stickers" | "id";
export type Template =
  | "original"
  | "orbit"
  | "grid"
  | "paper"
  | "noir"
  | "postcard"
  | "bloom"
  | "signal";
export type StudioOptions = {
  format: Format;
  template: Template;
  nickname: string;
  handle: string;
  background: string;
  scale: number;
  showName: boolean;
  decor: boolean;
  verified?: string;
  preview: boolean;
  locale: "en" | "vi";
  guide: boolean;
};
export type TraitStat = Attribute & { count: number; share: number };
export type RenderPayload = {
  token: Token;
  team: Token[];
  facts: Facts;
  options: StudioOptions;
  rarity: TraitStat[];
  snapshotBlock?: string;
  wheel: Wheel;
  pageUrl: string;
  stickers?: number;
};
