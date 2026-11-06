import QRCode from "qrcode";
import { decoration, extractColors, layout, svgText, short } from "./core";
import { translate, messages } from "../i18n";
import type { RenderPayload, Token } from "./types";
type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Dot = { path: string; color: string; x: number; y: number; alpha: number };
const parsed = new Map<
  string,
  { dots: Dot[]; size: number; colors: string[] }
>();
const attrs = (s: string) =>
  Object.fromEntries(
    [...s.matchAll(/([\w:-]+)=["']([^"']*)["']/g)].map((m) => [m[1], m[2]]),
  );
/** Reconstruct the immutable SVG glyph grid without SVG decoding or external resources. */
export function parseGrid(token: Token) {
  if (parsed.has(token.image)) return parsed.get(token.image)!;
  const svg = svgText(token.image);
  const paths = new Map<string, string>();
  const dots: Dot[] = [];
  const stack: { color: string; alpha: number }[] = [
    { color: "#ffffff", alpha: 1 },
  ];
  for (const m of svg.matchAll(/<(\/?)(g|path|use)\b([^>]*?)(\/?)>/g)) {
    const a = attrs(m[3]);
    if (m[2] === "path" && a.id && a.d) paths.set(a.id, a.d);
    if (m[2] === "g") {
      if (m[1]) {
        if (stack.length > 1) stack.pop();
      } else {
        const p = stack.at(-1)!;
        stack.push({
          color: a.color || a.fill || p.color,
          alpha: p.alpha * (a.opacity ? Number(a.opacity) : 1),
        });
      }
    }
    if (m[2] === "use") {
      const path = paths.get((a.href || a["xlink:href"] || "").slice(1));
      if (path) {
        const p = stack.at(-1)!;
        dots.push({
          path,
          color: a.color || a.fill || p.color,
          x: Number(a.x) || 0,
          y: Number(a.y) || 0,
          alpha: p.alpha * (a.opacity ? Number(a.opacity) : 1),
        });
      }
    }
  }
  const view = svg
    .match(/viewBox=["']([^"']+)/)?.[1]
    .split(/\s+/)
    .map(Number);
  const grid = { dots, size: view?.[2] || 25088, colors: extractColors(svg) };
  parsed.set(token.image, grid);
  return grid;
}
export function tokenPalette(token: Token) {
  const colors = extractColors(svgText(token.image)).filter((c) =>
    /^#[\da-f]{6}$/i.test(c),
  );
  return colors
    .filter((c) => {
      const n = parseInt(c.slice(1), 16);
      const r = n >> 16,
        g = (n >> 8) & 255,
        b = n & 255;
      return (
        Math.max(r, g, b) - Math.min(r, g, b) > 25 && Math.max(r, g, b) > 90
      );
    })
    .slice(0, 5);
}
function art(
  ctx: Context,
  token: Token,
  x: number,
  y: number,
  size: number,
  pose = 0,
) {
  const g = parseGrid(token);
  const scale = size / g.size;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(scale, scale);
  const paths = new Map<string, Path2D>();
  for (const dot of g.dots) {
    if (dot.alpha < 0.3) continue;
    let dx = dot.x,
      dy = dot.y;
    let color = dot.color;
    if (
      pose === 1 &&
      dy < g.size * 0.43 &&
      dx > g.size * 0.28 &&
      dx < g.size * 0.7
    )
      dy = Math.round(dy / 1100) * 1100;
    if (pose === 2 || pose === 5) {
      dx += (dy - g.size * 0.5) * 0.12;
      dy += Math.sin(dx / 800) * (pose === 5 ? 280 : 140);
    }
    if (pose === 3 && dot.alpha < 0.7) color = "#ffc85a";
    if (pose === 4 && dy > g.size * 0.55) dx += Math.sin(dy / 1000) * 220;
    if (pose === 0 && dy > g.size * 0.42 && dy < g.size * 0.52) dy += 80;
    ctx.save();
    ctx.translate(dx, dy);
    ctx.scale(16, pose === 1 && dot.color.toLowerCase() === "#ffffff" ? 5 : 16);
    ctx.globalAlpha = dot.alpha;
    ctx.fillStyle = color;
    let p = paths.get(dot.path);
    if (!p) {
      p = new Path2D(dot.path);
      paths.set(dot.path, p);
    }
    ctx.fill(p);
    ctx.restore();
  }
  ctx.restore();
}
export function templateBackground(
  token: Token,
  template: RenderPayload["options"]["template"],
  custom = "",
) {
  if (custom) return custom;
  const accent = tokenPalette(token)[0] || "#b4a2e5";
  const dark = ["noir", "signal", "original"].includes(template);
  return dark
    ? mix(accent, "#111812", 0.12)
    : template === "paper"
      ? mix(accent, "#f4ead5", 0.08)
      : template === "bloom"
        ? mix(accent, "#e2e7dd", 0.16)
        : template === "postcard"
          ? mix(accent, "#ead3c8", 0.1)
          : mix(accent, "#e4e2ef", 0.15);
}
function text(
  ctx: Context,
  value: string,
  x: number,
  y: number,
  size: number,
  color: string,
  weight = 600,
  align: CanvasTextAlign = "left",
  maxWidth?: number,
) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, x, y, maxWidth);
}
function readableInk(color: string) {
  const n = parseInt(color.replace("#", ""), 16);
  const linear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const lum = (hex: number) =>
    0.2126 * linear((hex >> 16) / 255) +
    0.7152 * linear(((hex >> 8) & 255) / 255) +
    0.0722 * linear((hex & 255) / 255);
  const l = lum(n);
  const contrast = (other: number) =>
    (Math.max(l, other) + 0.05) / (Math.min(l, other) + 0.05);
  const dark = contrast(lum(0x191d15)),
    light = contrast(lum(0xf9f7ef));
  if (dark >= 4.5 && dark >= light) return "#191d15";
  if (light >= 4.5) return "#f9f7ef";
  return contrast(0) > contrast(1) ? "#000000" : "#ffffff";
}
function mix(color: string, base: string, ratio: number) {
  const a = parseInt(color.replace("#", ""), 16),
    b = parseInt(base.replace("#", ""), 16);
  return (
    "#" +
    [16, 8, 0]
      .map((shift) =>
        Math.round(
          ((a >> shift) & 255) * ratio + ((b >> shift) & 255) * (1 - ratio),
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
function rect(
  ctx: Context,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  r = 0,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
function circle(ctx: Context, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
export async function paint(ctx: Context, p: RenderPayload) {
  const { token, options: o, facts, wheel } = p;
  const { width: w, height: h } = layout(o.format);
  const t = (
    key: Parameters<typeof translate>[1],
    v: Record<string, string | number> = {},
  ) => translate(o.locale, key, v);
  const palette = tokenPalette(token);
  const accent = palette[0] || "#b4a2e5";
  const second = palette[1] || "#efb96a";
  const bg = templateBackground(token, o.template, o.background);
  const ink = readableInk(bg);
  const dark = ink === "#f9f7ef" || ink === "#ffffff";
  const pad = Math.round(Math.min(w, h) * 0.06);
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;
  const sticker = o.format === "stickers";
  const pose = p.stickers ?? 0;
  if (!sticker) {
    rect(ctx, 0, 0, w, h, bg);
    ctx.save();
    ctx.globalAlpha = dark ? 0.17 : 0.22;
    const trait =
      token.attributes.find((a) => a.trait_type === "Background")?.value || "";
    if (o.template === "grid" || /grid|dot|cross/i.test(trait)) {
      const spacing = Math.max(
        16,
        Math.round(
          w / (/wide/i.test(trait) ? 12 : /micro/i.test(trait) ? 48 : 24),
        ),
      );
      for (let x = spacing; x < w; x += spacing)
        for (let y = spacing; y < h; y += spacing) {
          if (/cross/i.test(trait)) {
            rect(ctx, x - 3, y - 1, 6, 2, accent);
            rect(ctx, x - 1, y - 3, 2, 6, accent);
          } else circle(ctx, x, y, /micro/i.test(trait) ? 1 : 2, accent);
        }
    }
    if (/scanline/i.test(trait)) {
      for (let y = 12; y < h; y += 18) rect(ctx, 0, y, w, 2, accent);
    }
    if (o.template === "orbit") {
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(2, w / 500);
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.ellipse(
          w * 0.6,
          h * 0.5,
          w * 0.2 * i,
          h * 0.2,
          Math.PI / 5,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    }
    if (o.template === "bloom") {
      circle(ctx, w * 0.05, h * 0.2, w * 0.45, accent);
      circle(ctx, w * 0.9, h * 0.8, w * 0.35, second);
    }
    if (o.template === "paper") {
      ctx.translate(w * 0.7, h * 0.3);
      ctx.rotate(-0.35);
      rect(ctx, -w * 0.5, -h * 0.5, w * 0.8, h * 2, accent);
    }
    if (o.template === "signal") {
      for (let y = 0; y < h; y += 14) rect(ctx, 0, y, w, 2, accent);
    }
    if (o.template === "postcard") {
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
    }
    ctx.restore();
  }
  let artSize = Math.min(w, h) * 0.8 * o.scale;
  let artX = (w - artSize) / 2,
    artY = (h - artSize) / 2 - (o.showName ? h * 0.05 : 0);
  if (o.format === "banner") {
    artSize = h * 0.72 * o.scale;
    artX = w * 0.42;
    artY = (h - artSize) / 2;
  }
  if (o.format === "phone") {
    artSize = w * 0.93 * o.scale;
    artX = (w - artSize) / 2;
    artY = h * 0.35;
  }
  if (o.format === "desktop") {
    artSize = h * 0.78 * o.scale;
    artX = (w - artSize) / 2;
    artY = (h - artSize) / 2;
  }
  if (o.format === "id") {
    artSize = 440 * o.scale;
    artX = 20;
    artY = 120;
  }
  if (sticker) {
    artSize = 450 * o.scale;
    artX = (512 - artSize) / 2;
    artY = 5;
  }
  if (!sticker && !dark && !(o.format === "banner" && p.team.length > 1)) {
    circle(
      ctx,
      artX + artSize / 2,
      artY + artSize / 2,
      artSize * 0.43,
      mix(accent, "#141b18", 0.08),
    );
  }
  if (o.format === "banner" && p.team.length > 1) {
    const team = p.team.slice(0, 5);
    const s = Math.min(280, 780 / team.length) * Math.min(o.scale, 1);
    team.forEach((tok, i) => {
      const x = 650 + i * (780 / team.length);
      if (!dark)
        circle(
          ctx,
          x + s / 2,
          120 + s / 2,
          s * 0.43,
          mix(accent, "#141b18", 0.08),
        );
      art(ctx, tok, x, 120, s);
    });
  } else art(ctx, token, artX, artY, artSize, sticker ? pose : -1);
  if (o.showName && !sticker && o.format !== "id") {
    const name = o.nickname || token.name;
    const size = Math.round(Math.min(w, h) * 0.065);
    if (o.format === "banner") {
      const teamed = p.team.length > 1;
      text(
        ctx,
        name,
        teamed ? 650 : w * 0.72,
        teamed ? 80 : h * 0.4,
        size,
        ink,
        600,
        "left",
        teamed ? 520 : w * 0.24,
      );
      if (o.handle)
        text(
          ctx,
          o.handle,
          teamed ? 1000 : w * 0.72,
          teamed ? 460 : h * 0.53,
          size * 0.6,
          ink,
          400,
          "left",
          teamed ? 450 : w * 0.24,
        );
    } else {
      text(
        ctx,
        name,
        w * 0.5,
        o.format === "phone"
          ? h * 0.83
          : o.format === "pfp"
            ? h * 0.82
            : h * 0.88,
        size,
        ink,
        600,
        "center",
        o.format === "pfp" ? w * 0.62 : w * 0.8,
      );
      if (o.handle)
        text(
          ctx,
          o.handle,
          w * 0.5,
          o.format === "phone"
            ? h * 0.87
            : o.format === "pfp"
              ? h * 0.87
              : h * 0.94,
          size * 0.55,
          ink,
          400,
          "center",
          o.format === "pfp" ? w * 0.5 : w * 0.8,
        );
    }
  }
  const rarest = p.rarity.length
    ? Math.min(...p.rarity.map((a) => a.share))
    : undefined;
  const deco = decoration(facts, rarest);
  if (o.decor && !sticker) {
    const frameColors = {
      bronze: "#b78558",
      silver: "#c3cbd1",
      gold: "#d8ae48",
      neon: "#a9f08c",
    };
    if (deco.frame) {
      ctx.strokeStyle = frameColors[deco.frame];
      ctx.lineWidth = Math.max(4, Math.min(w, h) * 0.012);
      ctx.strokeRect(pad * 0.4, pad * 0.4, w - pad * 0.8, h - pad * 0.8);
    }
    if (deco.foil) {
      ctx.save();
      ctx.globalAlpha = 0.75;
      const foil = ctx.createLinearGradient(0, 0, w, h);
      foil.addColorStop(0, accent);
      foil.addColorStop(0.3, "#d8f5d8");
      foil.addColorStop(0.55, second);
      foil.addColorStop(0.75, "#d9caff");
      foil.addColorStop(1, accent);
      ctx.strokeStyle = foil;
      ctx.lineWidth = 6;
      for (let i = 0; i < 3; i++)
        ctx.strokeRect(
          pad * 0.7 + i * 9,
          pad * 0.7 + i * 9,
          w - pad * 1.4 - i * 18,
          h - pad * 1.4 - i * 18,
        );
      ctx.restore();
      const rareX =
        o.format === "banner"
          ? w * 0.8
          : o.format === "pfp"
            ? w * 0.65
            : w - pad - 135;
      const rareY =
        o.format === "banner"
          ? 75
          : o.format === "pfp"
            ? 190
            : o.format === "id"
              ? 100
              : pad;
      rect(ctx, rareX, rareY, 135, 42, accent, 10);
      text(
        ctx,
        t("rare"),
        rareX + 67,
        rareY + 29,
        22,
        readableInk(accent),
        600,
        "center",
      );
    }
    if (deco.ribbon) {
      const x =
        o.format === "banner" ? w * 0.43 : o.format === "pfp" ? w * 0.335 : pad;
      const y =
        o.format === "pfp" ? h * 0.71 : o.format === "id" ? 520 : h - pad - 45;
      const ribbonColor =
        deco.ribbon >= 90
          ? "#e5ca79"
          : deco.ribbon >= 30
            ? "#d3e0e5"
            : "#e8dbb6";
      rect(ctx, x, y, Math.min(w * 0.4, 330), 45, ribbonColor, 8);
      text(
        ctx,
        t("staker", { n: facts.stakedDays! }),
        x + 15,
        y + 30,
        22,
        "#292b22",
      );
    }
    if (wheel.state === "ACTIVE") {
      ctx.save();
      ctx.shadowColor = accent;
      ctx.shadowBlur = 20;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.strokeRect(pad * 0.2, pad * 0.2, w - pad * 0.4, h - pad * 0.4);
      ctx.restore();
      const x =
        o.format === "banner"
          ? 650
          : o.format === "pfp"
            ? 300
            : o.format === "id"
              ? 480
              : pad;
      const y = o.format === "pfp" ? 150 : o.format === "id" ? 610 : pad;
      rect(ctx, x, y, Math.min(w * 0.4, 440), 35, "#d8efb4", 7);
      text(
        ctx,
        `${t("wheelLive")} · ${wheel.at ? new Date(wheel.at).toISOString().slice(0, 19).replace("T", " ") : ""} UTC`,
        x + 12,
        y + 24,
        18,
        "#202b1c",
        600,
        "left",
        Math.min(w * 0.4, 440) - 24,
      );
    }
  }
  if (o.format === "id") {
    const left = 480;
    const name = o.nickname || token.name;
    text(ctx, t("id"), pad, 70, 24, ink);
    text(ctx, name, left, 90, 40, ink, 600, "left", 500);
    if (o.handle) text(ctx, o.handle, left, 126, 21, ink, 400);
    let yy = 174;
    const sorted = token.attributes;
    const min = rarest;
    sorted.forEach((a, i) => {
      const stat = p.rarity.find((r) => r.trait_type === a.trait_type);
      const y = yy + i * 32;
      const highlight = stat && stat.share === min;
      if (highlight)
        rect(ctx, left - 8, y - 22, 620, 30, dark ? "#383a30" : "#d8ddc5", 4);
      text(
        ctx,
        messages[o.locale].traitNames[
          a.trait_type as keyof typeof messages.en.traitNames
        ] || a.trait_type,
        left,
        y,
        18,
        ink,
        400,
      );
      text(ctx, a.value, left + 180, y, 18, ink, 600, "left", 340);
      if (stat)
        text(
          ctx,
          `${(stat.share * 100).toFixed(2)}%`,
          1110,
          y,
          18,
          ink,
          400,
          "right",
        );
    });
    text(
      ctx,
      `${t("level")}: ${facts.level ?? t("unknown")}  ·  ${t("custody")}: ${t(facts.custody)}`,
      pad,
      590,
      22,
      ink,
    );
    text(
      ctx,
      `${t("stakeAge")}: ${facts.custody === "wallet" ? t("notStaked") : facts.stakedDays === null ? t("unknown") : t("days", { n: facts.stakedDays })}`,
      pad,
      625,
      21,
      ink,
      400,
    );
    text(
      ctx,
      `${t("owner")}: ${facts.holder ? short(facts.holder) : t("unknown")}`,
      pad,
      660,
      21,
      ink,
      400,
    );
    if (p.snapshotBlock)
      text(
        ctx,
        t("rarityAsOf", { block: p.snapshotBlock }),
        480,
        590,
        18,
        ink,
        400,
      );
    const qr = QRCode.create(p.pageUrl, { errorCorrectionLevel: "M" });
    const qrSize = 132;
    const cell = Math.max(1, Math.floor(qrSize / (qr.modules.size + 8)));
    const edge = cell * (qr.modules.size + 8);
    const qx = 1090 - edge,
      qy = 608;
    rect(ctx, qx, qy, edge, edge, "#ffffff");
    for (let y = 0; y < qr.modules.size; y++)
      for (let x = 0; x < qr.modules.size; x++)
        if (qr.modules.get(y, x))
          rect(
            ctx,
            qx + (x + 4) * cell,
            qy + (y + 4) * cell,
            cell,
            cell,
            "#12140f",
          );
  }
  if (sticker) {
    const keys = [
      "happy",
      "sleepy",
      "running",
      "gm",
      "wenMerge",
      "zoomies",
    ] as const;
    const label = t(keys[pose]);
    rect(ctx, 70, 416, 372, 60, "#f6eedc", 22);
    text(ctx, label, 256, 458, 34, "#272a21", 600, "center");
    if (pose === 2 || pose === 5) {
      for (let i = 0; i < 3; i++)
        rect(ctx, 20, 180 + i * 28, 50 + i * 15, 7, accent, 3);
    }
  }
  if (o.verified && !o.preview) {
    const isPfp = o.format === "pfp";
    const x =
      o.format === "banner"
        ? 1050
        : isPfp
          ? 320
          : o.format === "id"
            ? 480
            : sticker
              ? 100
              : pad;
    const y =
      o.format === "banner"
        ? 405
        : isPfp
          ? 890
          : o.format === "id"
            ? 660
            : sticker
              ? 480
              : h - pad - 32;
    rect(
      ctx,
      x,
      y,
      isPfp ? 360 : sticker ? 312 : Math.min(w * 0.6, 430),
      sticker ? 24 : 32,
      "#e4edcf",
      6,
    );
    text(
      ctx,
      `${t("verified")} · ${o.verified}`,
      x + (isPfp ? 180 : 10),
      y + 22,
      sticker ? 12 : Math.min(18, w * 0.025),
      "#29351d",
      600,
      isPfp ? "center" : "left",
      isPfp ? 340 : 410,
    );
  }
  if (o.preview) {
    const size = sticker
      ? 17
      : Math.max(17, Math.round(Math.min(w, h) * 0.022));
    const tagW = sticker ? 130 : Math.min(w * 0.25, 240);
    rect(ctx, w - tagW - 12, 12, tagW, size * 1.8, "#f4eedf", 6);
    text(
      ctx,
      t("preview"),
      w - tagW / 2 - 12,
      12 + size * 1.28,
      size,
      "#32362b",
      600,
      "center",
    );
  }
}
