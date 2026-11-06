import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
const tooling = existsSync("node_modules/playwright")
  ? "node_modules"
  : "test/scratch/node_modules";
const { chromium } = await import(
  pathToFileURL(resolve(tooling, "playwright/index.mjs")).href
);
const run = promisify(execFile);
const root = resolve("dist");
const report = { checks: [], requests: [], errors: [], limitations: [] };
await mkdir("test/scratch/interaction-shots", { recursive: true });
await mkdir("test/scratch/downloads", { recursive: true });
const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://local").pathname);
    if (path === "/preview" || path === "/preview/")
      path = "/preview/index.html";
    if (!path.startsWith("/preview/")) {
      res.writeHead(404);
      res.end();
      return;
    }
    const file = resolve(root, path.slice("/preview/".length));
    if (!file.startsWith(root + "/")) throw Error();
    const body = await readFile(file);
    const types = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
      ".json": "application/json",
      ".zip": "application/zip",
    };
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/preview/`;
let browser;
let active = 0;
const queue = [];
async function bridge(route) {
  if (active >= 2) await new Promise((r) => queue.push(r));
  active++;
  try {
    const req = route.request();
    const args = [
      "-s",
      "--show-error",
      "--max-time",
      "12",
      "-X",
      req.method(),
      req.url(),
    ];
    if (req.postData())
      args.push(
        "-H",
        "content-type: application/json",
        "--data-binary",
        req.postData(),
      );
    const { stdout } = await run("curl", args, { maxBuffer: 16e6 });
    JSON.parse(stdout);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: stdout,
    });
  } catch {
    await route.abort();
  } finally {
    active--;
    queue.shift()?.();
  }
}
function check(name, detail) {
  report.checks.push({ name, passed: true, detail });
  console.log("PASS", name, detail || "");
}
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.SQUEEK_BROWSER_EXECUTABLE
      ? { executablePath: process.env.SQUEEK_BROWSER_EXECUTABLE }
      : {}),
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--renderer-process-limit=2",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    acceptDownloads: true,
  });
  await context.addInitScript(() => {
    localStorage.setItem("squeek-theme", "light");
    localStorage.setItem("squeek-locale", "en");
  });
  await context.route(
    /https:\/\/(api\.squeekchain\.com|ethereum-sepolia-rpc\.publicnode\.com|sepolia\.gateway\.tenderly\.co|1rpc\.io)\//,
    bridge,
  );
  const page = await context.newPage();
  page.on("request", (r) => {
    if (r.url().startsWith("http")) report.requests.push(r.url());
  });
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator(".card-main img").waitFor();
  assert(
    await page
      .getByRole("heading", { name: "Small squeek. Big personality." })
      .isVisible(),
  );
  const box = await page
    .getByRole("button", { name: "Try any Squeek" })
    .boundingBox();
  assert(box.y + box.height < 844);
  check(
    "390 first screen",
    "Product, artwork and primary preview action visible",
  );
  await page.screenshot({
    path: "test/scratch/interaction-shots/home-390.png",
  });
  for (const width of [320, 360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  check(
    "Responsive reflow",
    "320, 360, 390, 768, 1440; no horizontal overflow",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  assert(await page.getByRole("dialog").isVisible());
  assert(
    await page
      .getByText("No browser wallet detected.", { exact: false })
      .isVisible(),
  );
  await page.keyboard.press("Escape");
  assert(!(await page.getByRole("dialog").isVisible()));
  assert.equal(
    await page.evaluate(() => document.activeElement?.textContent),
    "Connect wallet",
  );
  check(
    "Wallet sheet keyboard",
    "No-provider message; Escape closes; focus restored",
  );
  await page.locator("#hero-id").fill("0");
  await page.getByRole("button", { name: "Try any Squeek" }).click();
  assert(
    await page.getByText("Enter a whole token ID greater than 0.").isVisible(),
  );
  await page.locator("#hero-id").fill("1");
  await page.getByRole("button", { name: "Try any Squeek" }).click();
  await page.locator(".canvas-stage img").waitFor();
  await page.getByText("Preview mode", { exact: true }).first().waitFor();
  check("Preview without wallet", "Validation and #/studio/1 navigation");
  await page.getByLabel("Nickname", { exact: true }).fill("Tiny explorer");
  await page.getByLabel("X handle", { exact: true }).fill("@squeek");
  await page.getByRole("button", { name: "Paper cut", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Paper cut", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.getByLabel("Show safe-zone guide", { exact: true }).uncheck();
  assert.equal(await page.locator(".circle-guide").count(), 0);
  check("Studio customization", "Nickname, handle, template and guide update");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test/scratch/interaction-shots/studio-1440.png",
    fullPage: true,
  });
  const formats = [
    ["Profile picture", "pfp", 1000, 1000],
    ["X banner", "banner", 1500, 500],
    ["Phone wallpaper", "phone", 1170, 2532],
    ["Desktop wallpaper", "desktop", 2560, 1440],
    ["Squeek ID card", "id", 1200, 750],
  ];
  for (const [label, key, w, h] of formats) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.locator(`.canvas-stage.${key} img`).waitFor();
    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download PNG", exact: true })
      .click();
    const download = await downloadEvent;
    const file = `test/scratch/downloads/${key}.png`;
    await download.saveAs(file);
    const png = await readFile(file);
    assert.equal(png.readUInt32BE(16), w);
    assert.equal(png.readUInt32BE(20), h);
    check("PNG " + key, `${w} × ${h}; ${png.length} bytes`);
  }
  await page.getByRole("button", { name: "Sticker pack", exact: true }).click();
  await page.locator(".sticker-previews img").last().waitFor();
  const packEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download 6 stickers", exact: true })
    .click();
  await (await packEvent).saveAs("test/scratch/downloads/stickers.zip");
  check("Sticker pack", "Downloaded ZIP from the six-pose preview");
  await page.getByRole("button", { name: "Copy image", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: /copied|Clipboard/ })
    .waitFor();
  const clipboardNotice = await page
    .getByRole("status")
    .filter({ hasText: /copied|Clipboard/ })
    .first()
    .textContent();
  check("Clipboard response", clipboardNotice);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: ({ files }) => files.length > 0,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async ({ files }) => {
        window.__sharedTypes = files.map((f) => ({
          type: f.type,
          size: f.size,
        }));
      },
    });
  });
  await page.getByRole("button", { name: "Share file", exact: true }).click();
  await page.waitForFunction(() => window.__sharedTypes?.length === 6);
  const shared = await page.evaluate(() => window.__sharedTypes);
  assert(shared.every((f) => f.type === "image/png" && f.size > 0));
  check(
    "Native share API wiring",
    "Six real PNG File objects passed to a browser-only share stub; no files uploaded",
  );
  await page.goto(base + "#/squeek/1", { waitUntil: "networkidle" });
  await page.locator(".trait-row").last().waitFor();
  assert.equal(await page.locator(".trait-row:not(.trait-head)").count(), 11);
  await page.getByText("Level", { exact: true }).waitFor();
  check("Public Squeek page", "11 real traits, on-chain custody and API level");
  await page
    .getByRole("link", { name: "Gallery", exact: true })
    .first()
    .click();
  await page.locator(".gallery-item").first().waitFor({ timeout: 60000 });
  await page
    .getByLabel("Filter by trait", { exact: true })
    .selectOption("Palette");
  await page.getByLabel("Value", { exact: true }).selectOption({ index: 1 });
  const filter = await page.getByLabel("Value", { exact: true }).inputValue();
  const cards = await page.locator(".gallery-item .hint").allTextContents();
  assert(cards.every((v) => v === filter));
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Filter by trait", { exact: true }).inputValue(),
    "",
  );
  check(
    "Gallery trait filters",
    "Transfer-based gallery and value filter, then clear",
  );
  await page.goto(base + "#/about", { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "Switch language", exact: true })
    .click();
  assert.equal(await page.locator("html").getAttribute("lang"), "vi");
  assert(
    await page
      .getByRole("heading", { name: "Studio nhỏ. Bánh xe thật." })
      .isVisible(),
  );
  check("Vietnamese", "Translated page and document language");
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "test/scratch/interaction-shots/about-vi-390.png",
  });
  await page
    .getByRole("button", { name: "Đổi giao diện sáng tối", exact: true })
    .click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  check("Dark mode on mobile", "Footer theme switch remains reachable");
  await page.getByRole("button", { name: "Đổi ngôn ngữ", exact: true }).click();
  await page.goto(base + "#/studio/1", { waitUntil: "networkidle" });
  await page.locator(".canvas-stage img").waitFor();
  await context.route(/https:\/\//, (r) => r.abort());
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".canvas-stage img").waitFor();
  assert(
    await page.getByText("Preview mode", { exact: true }).first().isVisible(),
  );
  await page
    .getByText("Showing cached data.", { exact: false })
    .first()
    .waitFor();
  check("Offline cached preview", "Reload studio #1 with RPC and API blocked");
  await page.goto(base + "#/studio/999999", { waitUntil: "networkidle" });
  await page.getByRole("alert").waitFor();
  assert(
    await page.getByRole("button", { name: "Retry", exact: true }).isVisible(),
  );
  check("Unavailable token", "Clear error, retry and token input");
  const allowed = new Set([
    new URL(base).host,
    "api.squeekchain.com",
    "ethereum-sepolia-rpc.publicnode.com",
    "sepolia.gateway.tenderly.co",
    "1rpc.io",
  ]);
  const unexpected = report.requests.filter(
    (u) => !allowed.has(new URL(u).host),
  );
  assert.deepEqual(unexpected, []);
  check("Network boundary", "Only static assets plus allowed RPC/API hosts");
  assert.deepEqual(report.errors, []);
  check("JavaScript errors", "None during primary interactions");
  await context.close();
} catch (e) {
  report.checks.push({
    name: "interaction run",
    passed: false,
    detail: e.stack,
  });
  console.error(e.stack);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
  await writeFile(
    "test/scratch/interaction-results.json",
    JSON.stringify(report, null, 2),
  );
}
