import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { keccak256, stringToHex, verifyMessage, type Address } from "viem";
import { zipSync } from "fflate";
import { messages, translate, type Key, type Locale } from "./i18n";
import { COLLECTION, STAKING, RPCS } from "./lib/chain";
import {
  decoration,
  rarity,
  rarityIndex,
  short,
  SIZES,
  TRAITS,
} from "./lib/core";
import {
  DataError,
  loadExamples,
  loadFacts,
  loadSnapshot,
  loadToken,
  loadWheel,
  latestSqueeks,
  readCustody,
  unknownFacts,
  walletSqueeks,
} from "./lib/data";
import { downloadBlob, renderBlob } from "./lib/export";
import { tokenPalette, templateBackground } from "./lib/render";
import { useWallet, type WalletInfo } from "./lib/wallet";
import type {
  Facts,
  Format,
  RenderPayload,
  Snapshot,
  StudioOptions,
  Template,
  Token,
  Wheel,
} from "./lib/types";
import { Icon, Mark } from "./components/Icon";
import { Preview } from "./components/Preview";
const FORMATS: Format[] = [
  "pfp",
  "banner",
  "phone",
  "desktop",
  "stickers",
  "id",
];
const TEMPLATES: Template[] = [
  "original",
  "orbit",
  "grid",
  "paper",
  "noir",
  "postcard",
  "bloom",
  "signal",
];
const baseOptions = (locale: Locale): StudioOptions => ({
  format: "pfp",
  template: "orbit",
  nickname: "",
  handle: "",
  background: "",
  scale: 1,
  showName: true,
  decor: true,
  preview: true,
  locale,
  guide: true,
});
const unknownWheel: Wheel = {
  state: "unknown",
  rpm: null,
  block: null,
  at: null,
};
type ContextValue = {
  locale: Locale;
  t: (key: Key, vars?: Record<string, string | number>) => string;
  snapshot: Snapshot | null;
  index: Map<string, number>;
  examples: Token[];
  wheel: Wheel;
  refreshWheel: () => void;
  wallet: ReturnType<typeof useWallet>;
  openWallet: () => void;
  walletIds: number[];
  walletBusy: boolean;
  walletProgress: number;
  walletError: string;
  walletCached: boolean;
  refreshWallet: () => void;
};
const AppContext = createContext<ContextValue>(null!);
const useApp = () => useContext(AppContext);
function messageCode(e: unknown, fallback: Key = "loadFailed"): Key {
  return e instanceof DataError ? (e.code as Key) : fallback;
}
function useHash() {
  const [hash, setHash] = useState(location.hash || "#/");
  useEffect(() => {
    const fn = () => setHash(location.hash || "#/");
    addEventListener("hashchange", fn);
    return () => removeEventListener("hashchange", fn);
  }, []);
  return hash;
}
function goto(path: string) {
  location.hash = path;
}
function ErrorBox({ code, retry }: { code: Key; retry?: () => void }) {
  const { t } = useApp();
  return (
    <div className="notice error" role="alert">
      <span>{t(code)}</span>
      {retry && (
        <button className="text-button" onClick={retry}>
          <Icon name="refresh" />
          {t("retry")}
        </button>
      )}
    </div>
  );
}
function TokenForm({ compact = false }: { compact?: boolean }) {
  const { t } = useApp();
  const [id, setId] = useState("1");
  const [error, setError] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (
      !/^\d+$/.test(id) ||
      !Number.isSafeInteger(Number(id)) ||
      Number(id) < 1
    ) {
      setError(true);
      input.current?.focus();
      return;
    }
    setError(false);
    goto("/studio/" + Number(id));
  }
  return (
    <form
      className={`token-form ${compact ? "compact" : ""}`}
      onSubmit={submit}
    >
      <label htmlFor={compact ? "quick-id" : "hero-id"}>{t("tokenId")}</label>
      <div className="token-entry">
        <span className="hash-symbol" aria-hidden="true">
          #
        </span>
        <input
          ref={input}
          id={compact ? "quick-id" : "hero-id"}
          value={id}
          onChange={(e) => setId(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          aria-invalid={error}
          aria-describedby={error ? "id-error" : undefined}
          placeholder={t("enterId")}
        />
        <button className="button primary" type="submit">
          {t("previewAction")}
          <Icon name="arrow" />
        </button>
      </div>
      {error ? (
        <p id="id-error" className="field-error">
          {t("invalidId")}
        </p>
      ) : (
        !compact && <p className="hint">{t("previewHint")}</p>
      )}
    </form>
  );
}
function WheelStatus({ small = false }: { small?: boolean }) {
  const { t, wheel, refreshWheel } = useApp();
  return (
    <div className={`wheel-status ${small ? "small" : ""}`}>
      <span
        className={`status-dot ${wheel.state === "ACTIVE" ? "active" : ""}`}
      />
      <span>
        {t(
          wheel.state === "ACTIVE"
            ? "wheelLive"
            : wheel.state === "IDLE"
              ? "wheelIdle"
              : "wheelUnknown",
        )}
      </span>
      {!small && (
        <>
          <span className="wheel-number">
            {wheel.rpm ?? t("unknown")} {t("rpm")}
          </span>
          <button
            className="icon-button"
            onClick={refreshWheel}
            aria-label={t("refresh")}
          >
            <Icon name="refresh" size={16} />
          </button>
        </>
      )}
    </div>
  );
}
function makePayload(
  token: Token,
  locale: Locale,
  template: Template = "orbit",
  format: Format = "pfp",
): RenderPayload {
  return {
    token,
    team: [token],
    facts: unknownFacts(),
    options: {
      ...baseOptions(locale),
      template,
      format,
      showName: false,
      decor: false,
    },
    rarity: [],
    wheel: unknownWheel,
    pageUrl: new URL(`#/squeek/${token.id}`, location.href).href,
  };
}
function Home() {
  const { t, locale, examples } = useApp();
  const payloads = useMemo(
    () =>
      examples
        .slice(0, 3)
        .map((token, i) =>
          makePayload(
            token,
            locale,
            (["orbit", "paper", "noir"] as Template[])[i],
          ),
        ),
    [examples, locale],
  );
  return (
    <>
      <section className="hero shell">
        <div className="hero-copy">
          <h1>{t("hero")}</h1>
          <p className="intro">{t("intro")}</p>
          <TokenForm />
          <div className="hero-promise">
            <Icon name="lock" size={16} />
            <span>{t("noGas")}</span>
            <span className="promise-divider">/</span>
            <span>{t("free")}</span>
          </div>
        </div>
        <div className="hero-art" aria-label={t("realArt")}>
          <div className="art-note note-top">
            <span className="note-line" />
            {t("realArt")}
          </div>
          {payloads.length > 0 ? (
            <>
              <div className="hero-card card-back">
                <Preview payload={payloads[1] || payloads[0]} />
                <span>{t("phone")}</span>
              </div>
              <div className="hero-card card-main">
                <Preview payload={payloads[0]} />
                <div className="hero-card-label">
                  <span>{payloads[0].token.name}</span>
                  <Icon name="spark" />
                </div>
              </div>
              <div className="hero-card card-front">
                <Preview payload={payloads[2] || payloads[0]} />
                <span>{t("pfp")}</span>
              </div>
              <span className="art-star star-one">✳</span>
              <span className="art-star star-two">✳</span>
            </>
          ) : (
            <div className="art-loading" role="status">
              {t("loading")}
            </div>
          )}
          <div className="art-note note-bottom">
            {t("localOnly")}
            <Icon name="arrow" size={18} />
          </div>
        </div>
      </section>
      <div className="chain-strip">
        <div className="shell chain-inner">
          <WheelStatus />
          <span>{t("hamster")}</span>
          <span className="chain-label">Ethereum Sepolia</span>
        </div>
      </div>
      <section className="shell formats-section">
        <div className="section-heading">
          <div>
            <h2>{t("formatTitle")}</h2>
            <p>{t("formatLine")}</p>
          </div>
          <a className="text-button" href="#/studio/1">
            {t("start")}
            <Icon name="arrow" />
          </a>
        </div>
        <div className="format-showcase">
          {FORMATS.map((f) => (
            <a
              key={f}
              className="format-card"
              href={`#/studio/${examples[0]?.id || 1}?format=${f}`}
            >
              <div className={`format-diagram ${f}`}>
                <Icon name={f} size={42} />
                {f === "stickers" && <span className="mini-star">✳</span>}
              </div>
              <div>
                <h3>{t(f)}</h3>
                <p className="hint">
                  {f === "stickers"
                    ? t("transparent")
                    : `${SIZES[f][0]} × ${SIZES[f][1]}`}
                </p>
              </div>
              <Icon name="arrow" size={18} />
            </a>
          ))}
        </div>
      </section>
      <section className="shell examples-section">
        <div className="section-heading">
          <div>
            <h2>{t("examples")}</h2>
            <p>{t("examplesLine")}</p>
          </div>
          <a href="#/gallery" className="text-button">
            {t("gallery")}
            <Icon name="arrow" />
          </a>
        </div>
        <div className="example-grid">
          {payloads.map((p, i) => (
            <a
              key={p.token.id}
              href={`#/studio/${p.token.id}`}
              className={`example-item example-${i}`}
            >
              <Preview
                payload={{ ...p, options: { ...p.options, showName: true } }}
              />
              <div>
                <span>{p.token.name}</span>
                <span>{t("makeArt")} ↗</span>
              </div>
            </a>
          ))}
        </div>
      </section>
    </>
  );
}
function FactsList({ facts }: { facts: Facts }) {
  const { t } = useApp();
  return (
    <dl className="facts-list">
      <div>
        <dt>{t("level")}</dt>
        <dd>{facts.level ?? t("unknown")}</dd>
      </div>
      <div>
        <dt>{t("custody")}</dt>
        <dd>{t(facts.custody)}</dd>
      </div>
      <div>
        <dt>{t("stakeAge")}</dt>
        <dd>
          {facts.stakedDays === null
            ? t("unknown")
            : t("days", { n: facts.stakedDays })}
        </dd>
      </div>
      <div>
        <dt>{t("owner")}</dt>
        <dd>
          {facts.holder ? (
            <span title={facts.holder}>{short(facts.holder)}</span>
          ) : (
            t("unknown")
          )}
        </dd>
      </div>
      {facts.merge && (
        <div>
          <dt>{t("merge")}</dt>
          <dd>{facts.merge}</dd>
        </div>
      )}
    </dl>
  );
}
function useSqueek(id: number) {
  const [token, setToken] = useState<Token>();
  const [facts, setFacts] = useState<Facts>(unknownFacts());
  const [error, setError] = useState<Key>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setToken(undefined);
    setFacts(unknownFacts());
    setError(undefined);
    if (!Number.isSafeInteger(id) || id < 1) {
      setError("invalidId");
      return;
    }
    loadToken(id)
      .then((tok) => {
        if (alive) setToken(tok);
      })
      .catch((e) => {
        if (alive) setError(messageCode(e));
      });
    loadFacts(id).then((v) => {
      if (alive) setFacts(v);
    });
    return () => {
      alive = false;
    };
  }, [id, attempt]);
  return {
    token,
    facts,
    setFacts,
    error,
    retry: () => setAttempt((n) => n + 1),
  };
}
function Traits({ token }: { token: Token }) {
  const { t, locale, snapshot, index } = useApp();
  const stats = useMemo(
    () => rarity(token.attributes, snapshot, index),
    [token, snapshot, index],
  );
  const rarest = stats.length ? Math.min(...stats.map((s) => s.share)) : null;
  return (
    <div className="traits-section">
      <h2>{t("traits")}</h2>
      <p className="hint">
        {snapshot
          ? t("rarityAsOf", { block: snapshot.blockNumber })
          : t("noSnapshot")}
      </p>
      <table className="trait-table">
        <caption className="sr-only">{t("traitsHint")}</caption>
        <thead>
          <tr className="trait-row trait-head">
            <th scope="col">{t("trait")}</th>
            <th scope="col">{t("value")}</th>
            {snapshot && <th scope="col">{t("rarity")}</th>}
          </tr>
        </thead>
        <tbody>
          {token.attributes.map((a) => {
            const stat = stats.find((r) => r.trait_type === a.trait_type);
            const isRarest = stat?.share === rarest;
            return (
              <tr
                className={`trait-row ${isRarest ? "rarest" : ""}`}
                key={a.trait_type}
              >
                <th scope="row">
                  {messages[locale].traitNames[
                    a.trait_type as keyof typeof messages.en.traitNames
                  ] || a.trait_type}
                </th>
                <td>
                  {a.value}
                  {isRarest && (
                    <>
                      <Icon name="spark" size={14} />
                      <span className="sr-only"> · {t("rarest")}</span>
                    </>
                  )}
                </td>
                {stat && <td>{(stat.share * 100).toFixed(2)}%</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hint">{t("traitsHint")}</p>
    </div>
  );
}

function SqueekPage({ id }: { id: number }) {
  const { t, locale, snapshot, index, wheel } = useApp();
  const { token, facts, error, retry } = useSqueek(id);
  const payload = useMemo(
    () =>
      token
        ? {
            ...makePayload(token, locale),
            facts,
            rarity: rarity(token.attributes, snapshot, index),
            wheel,
            options: { ...baseOptions(locale), showName: false, preview: true },
          }
        : undefined,
    [token, locale, facts, snapshot, index, wheel],
  );
  return (
    <section className="shell page-section">
      <div className="section-heading">
        <div>
          <h1>{t("squeekTitle", { id })}</h1>
          <p>{t("publicIntro")}</p>
        </div>
        <button
          className="button primary"
          onClick={() => goto("/studio/" + id)}
        >
          {t("makeArt")}
          <Icon name="arrow" />
        </button>
      </div>
      {error ? (
        <ErrorBox code={error} retry={retry} />
      ) : !token || !payload ? (
        <p role="status">{t("loading")}</p>
      ) : (
        <>
          <div className="public-grid">
            <div>
              <Preview payload={payload} />
              <p className="hint">
                {t("collection")} · {short(COLLECTION)}
              </p>
            </div>
            <div>
              <FactsList facts={facts} />
              {(facts.cached || facts.unavailable) && (
                <p className="notice">
                  {t(facts.cached ? "cachedNotice" : "offlineNotice")}
                </p>
              )}
              {facts.holder && (
                <details>
                  <summary>{t("fullAddress")}</summary>
                  <p className="address">{facts.holder}</p>
                </details>
              )}
              <Traits token={token} />
            </div>
          </div>
          <a className="button secondary" href={`#/studio/${id}`}>
            {t("makeArt")}
            <Icon name="arrow" />
          </a>
        </>
      )}
    </section>
  );
}
function WalletCollection() {
  const {
    t,
    walletIds,
    walletBusy,
    walletProgress,
    walletError,
    walletCached,
    wallet,
    refreshWallet,
  } = useApp();
  const [tokens, setTokens] = useState<(Token & { staked?: boolean })[]>([]);
  useEffect(() => {
    let alive = true;
    setTokens([]);
    async function fill() {
      for (let i = 0; i < walletIds.length; i += 6) {
        if (!alive) return;
        const r = await Promise.allSettled(
          walletIds.slice(i, i + 6).map(async (id) => {
            const token = await loadToken(id);
            const custody = await readCustody(id).catch(() => unknownFacts());
            return { ...token, staked: custody.custody === "staked" };
          }),
        );
        if (alive)
          setTokens((old) => [
            ...old,
            ...r.flatMap((v) => (v.status === "fulfilled" ? [v.value] : [])),
          ]);
      }
    }
    void fill();
    return () => {
      alive = false;
    };
  }, [walletIds]);
  if (!wallet.address) return null;
  return (
    <details className="wallet-collection" open>
      <summary>
        {t("mySqueeks")} <span>{walletIds.length}</span>
      </summary>
      {walletBusy && <p role="status">{t("reading", { n: walletProgress })}</p>}
      {walletError && (
        <ErrorBox code={walletError as Key} retry={refreshWallet} />
      )}{" "}
      {walletCached && <p className="notice">{t("cachedNotice")}</p>}
      {!walletBusy && !walletError && walletIds.length === 0 && (
        <p>{t("noneOwned")}</p>
      )}
      <div className="wallet-token-grid">
        {tokens.map((tok) => (
          <a key={tok.id} href={`#/studio/${tok.id}`}>
            <img src={tok.image} alt="" />
            <span>{tok.name}</span>
            {tok.staked && <span className="staked-label">{t("staked")}</span>}
          </a>
        ))}
      </div>
    </details>
  );
}
function Studio({ id, initialFormat }: { id: number; initialFormat?: string }) {
  const app = useApp();
  const { t, locale, snapshot, index, wheel, wallet, walletIds, openWallet } =
    app;
  const { token, facts, setFacts, error, retry } = useSqueek(id);
  const [options, setOptions] = useState<StudioOptions>(() => ({
    ...baseOptions(locale),
    format: FORMATS.includes(initialFormat as Format)
      ? (initialFormat as Format)
      : "pfp",
  }));
  const [teamIds, setTeamIds] = useState<number[]>([id]);
  const [team, setTeam] = useState<Token[]>([]);
  const [seal, setSeal] = useState<{ address: Address; fingerprint: string }>();
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Key>();
  const [shareFiles, setShareFiles] = useState<File[]>([]);
  const owned =
    !!wallet.address &&
    facts.holder?.toLowerCase() === wallet.address.toLowerCase() &&
    !facts.cached;
  useEffect(() => {
    setSeal(undefined);
    setTeamIds([id]);
    setNotice(undefined);
    setOptions((o) => ({ ...o, nickname: "", handle: "", background: "" }));
  }, [id, wallet.address, wallet.chain]);
  useEffect(() => {
    let alive = true;
    Promise.all(teamIds.map(loadToken))
      .then((v) => {
        if (alive) setTeam(v);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [teamIds]);
  useEffect(() => {
    setShareFiles([]);
  }, [id, options, locale, wallet.address, seal]);
  function patch(value: Partial<StudioOptions>) {
    setOptions((o) => ({ ...o, ...value }));
    setNotice(undefined);
  }
  const stats = useMemo(
    () => (token ? rarity(token.attributes, snapshot, index) : []),
    [token, snapshot, index],
  );
  const payload = useMemo<RenderPayload | undefined>(
    () =>
      token
        ? {
            token,
            team: options.format === "banner" && owned ? team : [token],
            facts,
            options: {
              ...options,
              locale,
              preview: !owned,
              verified:
                owned &&
                seal &&
                seal.address.toLowerCase() === wallet.address?.toLowerCase()
                  ? seal.fingerprint
                  : undefined,
            },
            rarity: stats,
            snapshotBlock: snapshot?.blockNumber,
            wheel,
            pageUrl: new URL(`#/squeek/${id}`, location.href).href,
          }
        : undefined,
    [
      token,
      team,
      facts,
      options,
      locale,
      owned,
      seal,
      stats,
      snapshot,
      wheel,
      id,
    ],
  );
  const deco = decoration(
    facts,
    stats.length ? Math.min(...stats.map((a) => a.share)) : undefined,
  );
  async function verify() {
    if (!wallet.active || !wallet.address || !owned) return;
    setVerifyBusy(true);
    setNotice(undefined);
    try {
      const current = await readCustody(id);
      if (current.holder?.toLowerCase() !== wallet.address.toLowerCase())
        throw new DataError("verifyOwnership");
      const message = `Squeek Studio | I hold Squeek #${id} | ${new Date().toISOString()}`;
      const signature = await wallet.active.provider.request({
        method: "personal_sign",
        params: [stringToHex(message), wallet.address],
      });
      if (
        !(await verifyMessage({ address: wallet.address, message, signature }))
      )
        throw new DataError("verifyDenied");
      setSeal({
        address: wallet.address,
        fingerprint: keccak256(signature).slice(2, 10),
      });
    } catch (e) {
      setSeal(undefined);
      setNotice(messageCode(e, "verifyDenied"));
    } finally {
      setVerifyBusy(false);
    }
  }
  async function generate(firstOnly = false) {
    if (!payload) throw Error();
    let fresh = { ...payload };
    const [freshWheel, latestFacts] = await Promise.all([
      loadWheel(),
      loadFacts(id),
    ]);
    setFacts(latestFacts);
    fresh.facts = latestFacts;
    if (wallet.address) {
      const current =
        latestFacts.cached || latestFacts.unavailable
          ? unknownFacts()
          : await readCustody(id).catch(() => unknownFacts());
      const valid =
        current.holder?.toLowerCase() === wallet.address.toLowerCase();
      if (options.format === "banner" && team.length > 1) {
        for (const teammate of team) {
          const owner = await readCustody(teammate.id);
          if (owner.holder?.toLowerCase() !== wallet.address.toLowerCase())
            throw new DataError("verifyOwnership");
        }
      }
      fresh = {
        ...fresh,
        facts: latestFacts,
        options: {
          ...fresh.options,
          preview: !valid,
          verified:
            valid &&
            seal &&
            seal.address.toLowerCase() === wallet.address?.toLowerCase()
              ? seal.fingerprint
              : undefined,
        },
      };
      if (!valid) setSeal(undefined);
    }
    fresh.wheel = freshWheel;
    const count = options.format === "stickers" && !firstOnly ? 6 : 1;
    const blobs: Blob[] = [];
    for (let i = 0; i < count; i++)
      blobs.push(await renderBlob({ ...fresh, stickers: i }));
    return blobs;
  }
  async function exportArt(action: "download" | "copy" | "share") {
    if (busy) return;
    setBusy(true);
    setNotice(undefined);
    try {
      if (action === "copy") {
        if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
          throw new DataError("copyFailed");
        // Request clipboard access synchronously with the click. Safari accepts an
        // asynchronous Blob in ClipboardItem, retaining the original user gesture.
        const png = shareFiles[0]
          ? Promise.resolve(shareFiles[0])
          : generate(true).then((blobs) => blobs[0]);
        void png.catch(() => {});
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": png }),
        ]);
        setNotice("copied");
        return;
      }
      if (action === "share" && shareFiles.length) {
        if (!navigator.canShare?.({ files: shareFiles }))
          throw new DataError("shareFailed");
        await navigator.share({ files: shareFiles, title: token!.name });
        return;
      }
      const blobs = await generate();
      const prepared = blobs.map(
        (b, i) =>
          new File([b], `squeek-${id}-${i + 1}.png`, { type: "image/png" }),
      );
      setShareFiles(prepared);
      if (action === "download") {
        if (blobs.length === 6) {
          const files: Record<string, Uint8Array> = {};
          const names = [
            "happy",
            "sleepy",
            "running",
            "gm",
            "wen-merge",
            "zoomies",
          ];
          for (let i = 0; i < 6; i++)
            files[`squeek-${id}-${names[i]}.png`] = new Uint8Array(
              await blobs[i].arrayBuffer(),
            );
          downloadBlob(
            new Blob([zipSync(files, { level: 0 }) as BlobPart], {
              type: "application/zip",
            }),
            `squeek-${id}-stickers.zip`,
          );
        } else downloadBlob(blobs[0], `squeek-${id}-${options.format}.png`);
        setNotice("downloadReady");
      } else {
        const files = blobs.map(
          (b, i) =>
            new File([b], `squeek-${id}-${i + 1}.png`, { type: "image/png" }),
        );
        if (!navigator.canShare?.({ files }))
          throw new DataError("shareFailed");
        if (navigator.userActivation && !navigator.userActivation.isActive) {
          setNotice("sharePrepared");
          return;
        }
        await navigator.share({ files, title: token!.name });
      }
    } catch (e) {
      setNotice(
        messageCode(
          e,
          action === "copy"
            ? "copyFailed"
            : action === "share"
              ? "shareFailed"
              : "exportError",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const shareUrl = new URL(`#/squeek/${id}`, location.href).href;
  const stickers = useMemo(
    () =>
      payload
        ? Array.from({ length: 6 }, (_, i) => ({ ...payload, stickers: i }))
        : [],
    [payload],
  );
  return (
    <section className="shell studio-section">
      <div className="section-heading editor-heading">
        <div>
          <h1>{t("editorTitle")}</h1>
          <p>{t("editorIntro")}</p>
        </div>
        <a className="text-button" href={`#/squeek/${id}`}>
          {t("squeekTitle", { id })}
          <Icon name="external" size={17} />
        </a>
      </div>
      <WalletCollection />
      {error ? (
        <>
          <ErrorBox code={error} retry={retry} />
          <TokenForm compact />
        </>
      ) : !token || !payload ? (
        <div className="loading-panel" role="status">
          {t("loading")}
        </div>
      ) : (
        <>
          {(facts.cached || facts.unavailable) && (
            <div className="notice" role="status">
              {t(facts.cached ? "cachedNotice" : "offlineNotice")}
              <button className="text-button" onClick={retry}>
                <Icon name="refresh" />
                {t("retry")}
              </button>
            </div>
          )}
          {!facts.cached &&
            !facts.unavailable &&
            facts.checkedAt &&
            facts.level === null && (
              <p className="notice" role="status">
                {t("apiFailed")}
              </p>
            )}
          <div className="format-picker" role="group" aria-label={t("format")}>
            {FORMATS.map((f) => (
              <button
                key={f}
                className={options.format === f ? "selected" : ""}
                aria-pressed={options.format === f}
                onClick={() => patch({ format: f })}
              >
                <Icon name={f} />
                <span>{t(f)}</span>
              </button>
            ))}
          </div>
          <div className="studio-grid">
            <div className="preview-column">
              <div className="preview-toolbar">
                <span className="preview-label">
                  <span className={`status-dot ${owned ? "active" : ""}`} />
                  {t(owned ? "connected" : "previewMode")}
                </span>
                <span>
                  {t("dimensions", {
                    w: SIZES[options.format][0],
                    h: SIZES[options.format][1],
                  })}
                </span>
              </div>
              <div className={`canvas-stage ${options.format}`}>
                {options.format === "stickers" ? (
                  <div className="sticker-previews">
                    {stickers.map((p, i) => (
                      <Preview key={i} payload={p} />
                    ))}
                  </div>
                ) : (
                  <Preview payload={payload} guide={options.guide} />
                )}
              </div>
              <div className="guide-row">
                {(options.format === "pfp" || options.format === "banner") && (
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={options.guide}
                      onChange={(e) => patch({ guide: e.target.checked })}
                    />
                    {t("showGuide")}
                  </label>
                )}
                <span className="hint">
                  {t(
                    options.format === "pfp"
                      ? "square"
                      : options.format === "banner"
                        ? "bannerHint"
                        : options.format === "phone"
                          ? "phoneHint"
                          : options.format === "desktop"
                            ? "desktopHint"
                            : options.format === "stickers"
                              ? "stickersHint"
                              : "idHint",
                  )}
                </span>
              </div>
              <div className="export-panel">
                <div>
                  <h2>{t("exportTitle")}</h2>
                  <p className="hint">{t("exportNote")}</p>
                </div>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => void exportArt("download")}
                >
                  <Icon name="download" />
                  {t(
                    busy
                      ? "exporting"
                      : options.format === "stickers"
                        ? "downloadPack"
                        : "download",
                  )}
                </button>
                <div className="share-actions">
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void exportArt("copy")}
                  >
                    <Icon name="copy" size={17} />
                    {t("copy")}
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void exportArt("share")}
                  >
                    <Icon name="share" size={17} />
                    {t("share")}
                  </button>
                  <a
                    className="text-button"
                    href={`https://x.com/intent/post?text=${encodeURIComponent(t("shareText", { id }))}&url=${encodeURIComponent(shareUrl)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("shareX")}
                    <Icon name="external" size={16} />
                  </a>
                </div>
              </div>
              <div className="studio-notice" role="status">
                {notice && t(notice)}
              </div>
              <p className="hint">{t("guideNote")}</p>
            </div>
            <aside className="editor-controls">
              {options.format !== "stickers" && (
                <section className="control-section">
                  <h2>
                    <span className="step-number">1</span>
                    {t("template")}
                  </h2>
                  <p className="hint">{t("templateDesc")}</p>
                  <div className="template-grid">
                    {TEMPLATES.map((tpl, i) => (
                      <button
                        key={tpl}
                        className={`template-choice ${tpl} ${options.template === tpl ? "selected" : ""}`}
                        aria-pressed={options.template === tpl}
                        onClick={() => patch({ template: tpl, background: "" })}
                      >
                        <span className="template-swatch">
                          <img src={token.image} alt="" />
                          {options.template === tpl && (
                            <span className="template-check">
                              <Icon name="check" size={15} />
                            </span>
                          )}
                        </span>
                        <span>{t(tpl)}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <section className="control-section">
                <h2>
                  <span className="step-number">2</span>
                  {t("customize")}
                </h2>
                {options.format !== "stickers" ? (
                  <>
                    <label className="field">
                      {t("nickname")}
                      <input
                        value={options.nickname}
                        maxLength={28}
                        placeholder={t("nicknamePlaceholder")}
                        onChange={(e) => patch({ nickname: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      {t("handle")}
                      <input
                        value={options.handle}
                        maxLength={20}
                        placeholder={t("handlePlaceholder")}
                        onChange={(e) => patch({ handle: e.target.value })}
                      />
                    </label>
                    <div className="color-row">
                      <label htmlFor="bg-color">{t("background")}</label>
                      <input
                        id="bg-color"
                        type="color"
                        value={templateBackground(
                          token,
                          options.template,
                          options.background,
                        )}
                        onChange={(e) => patch({ background: e.target.value })}
                      />
                      <button
                        className="text-button"
                        onClick={() => patch({ background: "" })}
                      >
                        {t("palette")}
                      </button>
                    </div>
                    <div className="palette-swatches">
                      {tokenPalette(token).map((color) => (
                        <button
                          key={color}
                          aria-label={`${t("background")} ${color}`}
                          title={color}
                          onClick={() => patch({ background: color })}
                          style={{ background: color }}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="hint">{t("stickerControls")}</p>
                )}
                <label className="field range-field">
                  {t("artScale")}
                  <span>{Math.round(options.scale * 100)}%</span>
                  <input
                    type="range"
                    min="0.6"
                    max="1.2"
                    step="0.05"
                    value={options.scale}
                    onChange={(e) => patch({ scale: Number(e.target.value) })}
                  />
                </label>
                {options.format !== "stickers" && options.format !== "id" && (
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={options.showName}
                      onChange={(e) => patch({ showName: e.target.checked })}
                    />
                    {t("showName")}
                  </label>
                )}
                {options.format !== "stickers" && (
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={options.decor}
                      onChange={(e) => patch({ decor: e.target.checked })}
                    />
                    {t("showDecor")}
                  </label>
                )}
              </section>
              {options.format === "banner" && (
                <section className="control-section">
                  <h2>{t("team")}</h2>
                  <p className="hint">
                    {t(owned ? "teamHint" : "teamConnect")}
                  </p>
                  {owned && (
                    <>
                      <p className="hint">
                        {t("teamCount", { n: teamIds.length })}
                      </p>
                      <div className="team-picker">
                        {[...new Set([id, ...walletIds])].map((n) => (
                          <button
                            key={n}
                            aria-label={t("toggleSelection", { id: n })}
                            aria-pressed={teamIds.includes(n)}
                            className={teamIds.includes(n) ? "selected" : ""}
                            disabled={
                              !teamIds.includes(n) && teamIds.length >= 5
                            }
                            onClick={() =>
                              setTeamIds((old) =>
                                old.includes(n)
                                  ? old.length > 1
                                    ? old.filter((x) => x !== n)
                                    : old
                                  : [...old, n],
                              )
                            }
                          >
                            #{n}
                            {teamIds.includes(n) && (
                              <Icon name="check" size={14} />
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </section>
              )}
              <section className="control-section holder-section">
                <h2>
                  <Icon name="lock" />
                  {t(seal ? "verified" : "verify")}
                </h2>
                <p className="hint">
                  {t(owned ? "verifyHint" : "previewNote")}
                </p>
                {!wallet.address ? (
                  <button className="button secondary" onClick={openWallet}>
                    {t("connect")}
                  </button>
                ) : owned ? (
                  <button
                    className="button secondary"
                    onClick={() => void verify()}
                    disabled={verifyBusy}
                  >
                    {seal ? <Icon name="check" /> : <Icon name="wallet" />}
                    {t(verifyBusy ? "verifying" : seal ? "verified" : "verify")}
                  </button>
                ) : (
                  <span className="badge">{t("previewMode")}</span>
                )}
                {seal && (
                  <p className="hint">
                    {t("signature", { fingerprint: seal.fingerprint })}
                  </p>
                )}
              </section>
              <details className="data-details">
                <summary>{t("badgeTitle")}</summary>
                <p className="hint">{t("badgeLine")}</p>
                <FactsList facts={facts} />
                <ul className="badge-list">
                  {deco.frame ? (
                    <li>{t("frame", { tier: t(deco.frame) })}</li>
                  ) : (
                    <li>{t("noLevel")}</li>
                  )}
                  {deco.ribbon && (
                    <li>{t("staker", { n: facts.stakedDays! })}</li>
                  )}
                  {deco.foil && <li>{t("foil")}</li>}
                  {facts.custody === "staked" && facts.stakedDays === null && (
                    <li>{t("noStakeAge")}</li>
                  )}
                </ul>
                {snapshot && (
                  <p className="hint">
                    {t("rarityAsOf", { block: snapshot.blockNumber })}
                  </p>
                )}
                <p className="hint">{t("wheelExport")}</p>
                {facts.cached && <p className="notice">{t("cachedNotice")}</p>}
                {facts.checkedAt && facts.level === null && (
                  <p className="hint">{t("apiFailed")}</p>
                )}
                <button className="text-button" onClick={retry}>
                  <Icon name="refresh" />
                  {t("refresh")}
                </button>
              </details>
              <TokenForm compact />
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
function Gallery() {
  const { t, locale } = useApp();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<Key>();
  const [attempt, setAttempt] = useState(0);
  const [cached, setCached] = useState(false);
  const [trait, setTrait] = useState("");
  const [value, setValue] = useState("");
  useEffect(() => {
    let alive = true;
    setBusy(true);
    setError(undefined);
    setTokens([]);
    async function fill() {
      try {
        const latest = await latestSqueeks();
        if (!alive) return;
        setCached(latest.cached);
        for (let i = 0; i < latest.ids.length; i += 4) {
          if (!alive) return;
          const batch = await Promise.allSettled(
            latest.ids.slice(i, i + 4).map(loadToken),
          );
          if (alive)
            setTokens((old) => [
              ...old,
              ...batch.flatMap((v) =>
                v.status === "fulfilled" ? [v.value] : [],
              ),
            ]);
        }
      } catch (e) {
        if (alive) setError(messageCode(e, "galleryFailed"));
      } finally {
        if (alive) setBusy(false);
      }
    }
    void fill();
    return () => {
      alive = false;
    };
  }, [attempt]);
  const values = [
    ...new Set(
      tokens.flatMap((tok) =>
        tok.attributes
          .filter((a) => a.trait_type === trait)
          .map((a) => a.value),
      ),
    ),
  ].sort();
  const filtered = tokens.filter(
    (tok) =>
      !trait ||
      tok.attributes.some(
        (a) => a.trait_type === trait && (!value || a.value === value),
      ),
  );
  return (
    <section className="shell page-section">
      <div className="section-heading">
        <div>
          <h1>{t("galleryTitle")}</h1>
          <p>{t("galleryIntro")}</p>
        </div>
        <button
          className="button secondary"
          onClick={() => setAttempt((n) => n + 1)}
          disabled={busy}
        >
          <Icon name="refresh" />
          {t("refresh")}
        </button>
      </div>
      <div className="gallery-filters">
        <label className="field">
          {t("filterTrait")}
          <select
            aria-label={t("filterTrait")}
            value={trait}
            onChange={(e) => {
              setTrait(e.target.value);
              setValue("");
            }}
          >
            <option value="">{t("allTraits")}</option>
            {TRAITS.map((tr) => (
              <option key={tr} value={tr}>
                {
                  messages[locale].traitNames[
                    tr as keyof typeof messages.en.traitNames
                  ]
                }
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t("value")}
          <select
            aria-label={t("value")}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={!trait}
          >
            <option value="">{t("allValues")}</option>
            {values.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <button
          className="text-button"
          onClick={() => {
            setTrait("");
            setValue("");
          }}
        >
          {t("clearFilters")}
        </button>
        <span className="result-count" role="status">
          {t("results", { n: filtered.length })}
        </span>
      </div>
      {cached && <p className="notice">{t("cachedNotice")}</p>}
      {error && (
        <ErrorBox code={error} retry={() => setAttempt((n) => n + 1)} />
      )}
      <div className="gallery-grid">
        {filtered.map((tok) => (
          <a className="gallery-item" key={tok.id} href={`#/squeek/${tok.id}`}>
            <img src={tok.image} alt={tok.name} loading="lazy" />
            <div>
              <span>{tok.name}</span>
              <Icon name="arrow" size={18} />
            </div>
            <p className="hint">
              {tok.attributes.find((a) => a.trait_type === "Palette")?.value}
            </p>
          </a>
        ))}
      </div>
      {busy ? (
        <p className="gallery-status" role="status">
          {t("loading")} {tokens.length}/100
        </p>
      ) : filtered.length === 0 && !error ? (
        <div className="empty-state">
          <p>{t("noResults")}</p>
          <button
            className="button secondary"
            onClick={() => {
              setTrait("");
              setValue("");
            }}
          >
            {t("clearFilters")}
          </button>
        </div>
      ) : (
        tokens.length < 100 && (
          <p className="hint">{t("galleryPartial", { n: tokens.length })}</p>
        )
      )}
    </section>
  );
}
function About() {
  const { t, snapshot, locale } = useApp();
  return (
    <section className="shell page-section about-page">
      <h1>{t("aboutTitle")}</h1>
      <p className="intro">{t("aboutIntro")}</p>
      <div className="about-grid">
        <div className="about-story">
          <div className="wheel-illustration" aria-hidden="true">
            <svg viewBox="0 0 300 250">
              <circle cx="150" cy="105" r="80" />
              <circle cx="150" cy="105" r="70" />
              {Array.from({ length: 12 }, (_, i) => {
                const a = (i * Math.PI) / 6;
                return (
                  <path
                    key={i}
                    d={`M150 105L${150 + 70 * Math.cos(a)} ${105 + 70 * Math.sin(a)}`}
                  />
                );
              })}
              <path d="m150 110-35 115m35-115 35 115m-90 0h110" />
              <g className="illustration-hamster">
                <ellipse cx="170" cy="145" rx="30" ry="23" />
                <circle cx="192" cy="128" r="12" />
                <circle cx="192" cy="128" r="5" />
                <circle cx="150" cy="146" r="3" />
                <path d="m153 165-5 7m29-7 7 7" />
              </g>
            </svg>
            <WheelStatus small />
          </div>
          <h2>{t("storyTitle")}</h2>
          <p>{t("story")}</p>
          <a
            href="https://squeekchain.com/genesis/e86n3z8y"
            target="_blank"
            rel="noreferrer"
            className="button primary"
          >
            {t("join")}
            <Icon name="external" />
          </a>
        </div>
        <div className="about-content">
          {(["data", "rarity", "privacy", "safety", "offline"] as const).map(
            (key) => (
              <section key={key}>
                <h2>{t((key + "Title") as Key)}</h2>
                <p>{t((key + "Text") as Key)}</p>
                {key === "data" && (
                  <div className="source-addresses">
                    <span>{t("collection")}</span>
                    <code>{COLLECTION}</code>
                    <span>{t("staked")}</span>
                    <code>{STAKING}</code>
                    <a href={RPCS[0]} target="_blank" rel="noreferrer">
                      {new URL(RPCS[0]).hostname}
                      <Icon name="external" size={14} />
                    </a>
                    <a
                      href="https://api.squeekchain.com/v1/status"
                      target="_blank"
                      rel="noreferrer"
                    >
                      api.squeekchain.com
                      <Icon name="external" size={14} />
                    </a>
                  </div>
                )}
                {key === "rarity" && (
                  <>
                    {snapshot ? (
                      <>
                        <p className="badge">
                          {t("rarityAsOf", { block: snapshot.blockNumber })}
                        </p>
                        <p className="hint">
                          {t("snapshotInfo", {
                            n: Object.keys(snapshot.tokens).length,
                            date: new Date(snapshot.date).toLocaleDateString(
                              locale,
                            ),
                          })}
                        </p>
                      </>
                    ) : (
                      <p className="notice">{t("noSnapshot")}</p>
                    )}
                    <p>{t("frameRules")}</p>
                  </>
                )}
              </section>
            ),
          )}
          <section>
            <h2>{t("source")}</h2>
            <p>{t("sourceNote")}</p>
            <a href="./source.zip" className="button secondary" download>
              <Icon name="download" />
              {t("source")}
            </a>
          </section>
        </div>
      </div>
      <p className="fan-note">{t("fan")}</p>
    </section>
  );
}
function WalletDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t, wallet } = useApp();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  useEffect(() => {
    if (wallet.address) onClose();
  }, [wallet.address]);
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const fallback: WalletInfo | undefined = window.ethereum
    ? {
        uuid: "legacy",
        rdns: "browser",
        name: t("browserWallet"),
        provider: window.ethereum,
      }
    : undefined;
  const listed = wallet.wallets.length
    ? wallet.wallets
    : fallback
      ? [fallback]
      : [];
  const url = location.href;
  const links = [
    [
      "MetaMask",
      `https://link.metamask.io/dapp/${url.replace(/^https?:\/\//, "")}`,
    ],
    [
      "Rabby",
      `https://go.rabby.io/mobile/?_cmd=open-dapp&dapp=${encodeURIComponent(url)}`,
    ],
    [
      "Coinbase Wallet",
      `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`,
    ],
    [
      "Phantom",
      `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(location.origin)}`,
    ],
  ];
  return (
    <dialog
      ref={dialog}
      className="wallet-dialog"
      aria-labelledby="wallet-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id="wallet-title">{t("walletTitle")}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label={t("close")}
        >
          <Icon name="close" />
        </button>
      </div>
      <p>{t("walletIntro")}</p>
      <div className="wallet-rows">
        {listed.map((w) => (
          <button
            key={w.uuid}
            disabled={!!wallet.pending}
            onClick={() => void wallet.connect(w)}
          >
            {w.icon?.startsWith("data:image/") ? (
              <img src={w.icon} alt="" width="28" height="28" />
            ) : (
              <Icon name="wallet" size={28} />
            )}
            <span>{w.name}</span>
            {wallet.pending === w.uuid ? (
              <span>{t("opening")}</span>
            ) : (
              <Icon name="arrow" />
            )}
          </button>
        ))}
      </div>
      {listed.length === 0 && <p className="notice">{t("noWallet")}</p>}
      {mobile && !listed.length && (
        <div className="mobile-wallet-links">
          {links.map(([name, href]) => (
            <a href={href} key={name}>
              {t("openIn", { wallet: name })}
              <Icon name="external" />
            </a>
          ))}
        </div>
      )}
      {wallet.error && (
        <p className="field-error" role="status">
          {t("connectFailed")}
        </p>
      )}
      <p className="hint wallet-privacy">
        <Icon name="lock" size={16} />
        {t("walletPrivacy")}
      </p>
    </dialog>
  );
}
export default function App() {
  const hash = useHash();
  const [locale, setLocale] = useState<Locale>(() =>
    localStorage.getItem("squeek-locale") === "vi" ? "vi" : "en",
  );
  const [dark, setDark] = useState(() =>
    localStorage.getItem("squeek-theme")
      ? localStorage.getItem("squeek-theme") === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [examples, setExamples] = useState<Token[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [wheel, setWheel] = useState<Wheel>(unknownWheel);
  const [walletOpen, setWalletOpen] = useState(false);
  const wallet = useWallet();
  const [walletIds, setWalletIds] = useState<number[]>([]);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletProgress, setWalletProgress] = useState(0);
  const [walletError, setWalletError] = useState("");
  const [walletCached, setWalletCached] = useState(false);
  const [walletAttempt, setWalletAttempt] = useState(0);
  const t = (key: Key, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);
  const index = useMemo(
    () => (snapshot ? rarityIndex(snapshot) : new Map<string, number>()),
    [snapshot],
  );
  const refreshWheel = () => {
    void loadWheel().then(setWheel);
  };
  useEffect(() => {
    loadExamples()
      .then(setExamples)
      .catch(() => {});
    loadSnapshot().then(setSnapshot);
    refreshWheel();
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    localStorage.setItem("squeek-locale", locale);
  }, [locale]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("squeek-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    let alive = true;
    setWalletIds([]);
    setWalletError("");
    if (!wallet.address) {
      setWalletBusy(false);
      return;
    }
    setWalletBusy(true);
    setWalletProgress(0);
    walletSqueeks(wallet.address, snapshot, (n) => {
      if (alive) setWalletProgress(n);
    })
      .then((r) => {
        if (alive) {
          setWalletIds(r.ids);
          setWalletCached(r.cached);
        }
      })
      .catch((e) => {
        if (alive) setWalletError(messageCode(e, "ownershipFailed"));
      })
      .finally(() => {
        if (alive) setWalletBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [wallet.address, walletAttempt]);
  useEffect(() => {
    window.scrollTo(0, 0);
    requestAnimationFrame(() =>
      document.getElementById("main")?.focus({ preventScroll: true }),
    );
    document.title = hash.startsWith("#/studio")
      ? `${t("studio")} · Squeek Studio`
      : hash.startsWith("#/squeek/")
        ? `Squeek #${hash.split("/")[2]} · Squeek Studio`
        : "Squeek Studio · Small squeek. Big personality.";
  }, [hash]);
  const context: ContextValue = {
    locale,
    t,
    snapshot,
    index,
    examples,
    wheel,
    refreshWheel,
    wallet,
    openWallet: () => setWalletOpen(true),
    walletIds,
    walletBusy,
    walletProgress,
    walletError,
    walletCached,
    refreshWallet: () => setWalletAttempt((n) => n + 1),
  };
  const route = hash.slice(1).split("?")[0];
  const studioMatch = route.match(/^\/studio\/(\d+)$/);
  const publicMatch = route.match(/^\/squeek\/(\d+)$/);
  let page: ReactNode =
    route === "/" || !route ? (
      <Home />
    ) : studioMatch ? (
      <Studio
        id={Number(studioMatch[1])}
        initialFormat={
          new URLSearchParams(hash.split("?")[1] || "").get("format") ||
          undefined
        }
      />
    ) : publicMatch ? (
      <SqueekPage id={Number(publicMatch[1])} />
    ) : route === "/gallery" ? (
      <Gallery />
    ) : route === "/about" ? (
      <About />
    ) : (
      <section className="shell page-section">
        <h1>{t("pageMissing")}</h1>
        <a href="#/" className="button primary">
          {t("returnHome")}
        </a>
      </section>
    );
  return (
    <AppContext.Provider value={context}>
      <a
        href="#main"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        {t("skip")}
      </a>
      <header className="site-header shell">
        <a className="brand" href="#/" aria-label="Squeek Studio">
          <Mark />
          <span>
            Squeek<span className="brand-studio">Studio</span>
          </span>
        </a>
        <nav aria-label={t("brand")}>
          <a href="#/studio/1" aria-current={studioMatch ? "page" : undefined}>
            {t("studio")}
          </a>
          <a
            href="#/gallery"
            aria-current={route === "/gallery" ? "page" : undefined}
          >
            {t("gallery")}
          </a>
          <a
            href="#/about"
            aria-current={route === "/about" ? "page" : undefined}
          >
            {t("about")}
          </a>
        </nav>
        <div className="header-actions">
          <button
            className="icon-button theme-toggle"
            onClick={() => setDark((d) => !d)}
            aria-label={t("theme")}
          >
            <Icon name={dark ? "sun" : "moon"} size={19} />
          </button>
          <button
            className="language-button"
            onClick={() => setLocale((l) => (l === "en" ? "vi" : "en"))}
            aria-label={t("language")}
          >
            {locale === "en" ? "VI" : "EN"}
          </button>
          {wallet.address ? (
            <div className="connected-actions">
              <button
                className="button secondary wallet-button"
                onClick={() =>
                  wallet.chain !== "0xaa36a7"
                    ? void wallet.switchChain()
                    : wallet.disconnect()
                }
              >
                <Icon name="wallet" size={17} />
                <span>
                  {wallet.chain !== "0xaa36a7"
                    ? t("switchNetwork")
                    : short(wallet.address)}
                </span>
              </button>
              {wallet.chain === "0xaa36a7" && (
                <button
                  className="disconnect-button"
                  onClick={wallet.disconnect}
                  aria-label={t("disconnect")}
                  title={t("disconnect")}
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </div>
          ) : (
            <button
              className="button secondary wallet-button"
              onClick={() => setWalletOpen(true)}
            >
              <Icon name="wallet" size={17} />
              <span>{t("connect")}</span>
            </button>
          )}
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {page}
      </main>
      <footer className="site-footer">
        <div className="shell footer-main">
          <a className="brand" href="#/">
            <Mark />
            <span>
              Squeek<span className="brand-studio">Studio</span>
            </span>
          </a>
          <p>{t("footer")}</p>
          <div className="footer-links">
            <button
              className="text-button footer-theme"
              onClick={() => setDark((d) => !d)}
            >
              <Icon name={dark ? "sun" : "moon"} size={16} />
              {t("theme")}
            </button>
            <a href="#/about">{t("about")}</a>
            <a href="./source.zip" download>
              {t("source")}
              <Icon name="external" size={14} />
            </a>
            <a
              href="https://x.com/Truongsonxyz"
              target="_blank"
              rel="noreferrer"
            >
              {t("madeBy")}
              <Icon name="external" size={14} />
            </a>
          </div>
        </div>
        <div className="shell footer-bottom">
          <p>{t("fan")}</p>
          <a
            href="https://squeekchain.com/genesis/e86n3z8y"
            target="_blank"
            rel="noreferrer"
          >
            {t("join")} ↗
          </a>
        </div>
      </footer>
      <WalletDialog open={walletOpen} onClose={() => setWalletOpen(false)} />
    </AppContext.Provider>
  );
}
