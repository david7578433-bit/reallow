// RealLow online deals: open each product page on the STORE'S OWN SITE in a real browser and read the price shown.
// usage: TAB_TASK_ID=... /usr/bin/node check.mjs <urls.json> <out.jsonl> [shotsDir] [knobs-json]
// urls.json: [{store:"Amazon"|"Target"|"Walmart", id, url}]
import fs from "node:fs"; import Browserbase from "@browserbasehq/sdk"; import { chromium } from "playwright-core";
const [, , IN, OUT, SHOTS = "", KNOBS = "{}"] = process.argv;
const V = JSON.parse(fs.readFileSync("/home/user/tab/.vendor-capability.json", "utf8"));
const bb = new Browserbase({ apiKey: V.token, baseURL: `${V.base_url}/browserbase` });
const list = JSON.parse(fs.readFileSync(IN, "utf8"));
const knobs = { proxies: [{ type: "browserbase", geolocation: { city: "NEW YORK", state: "NY", country: "US" } }], region: "us-east-1", ...JSON.parse(KNOBS) };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const session = await bb.sessions.create({ projectId: "f2ae15a0-a894-4419-977f-d52f52483f0c", keepAlive: false, userMetadata: { site: "reallow-deals", task: process.env.TAB_TASK_ID || "none" }, ...knobs });
log("session", session.id);
const browser = await chromium.connectOverCDP(session.connectUrl);
const ctx = browser.contexts()[0]; const page = ctx.pages()[0] || await ctx.newPage();
const EX = {
  Amazon: () => {
    const q = (s) => document.querySelector(s); const t = (s) => (q(s)?.innerText || "").trim();
    const core = q("#corePriceDisplay_desktop_feature_div") || q("#corePrice_feature_div") || q("#apex_desktop") || document;
    const pr = core.querySelector(".priceToPay .a-offscreen, .apexPriceToPay .a-offscreen, .a-price .a-offscreen");
    let price = pr ? pr.textContent.trim() : ""; if (!price) { const w = core.querySelector(".priceToPay"); price = w ? w.innerText.replace(/\s+/g, "") : ""; }
    const bp = core.querySelector(".basisPrice"); const bo = bp && bp.querySelector(".a-offscreen");
    const img = q("#landingImage"); let image = img ? (img.getAttribute("data-old-hires") || "") : "";
    if (!image && img && img.getAttribute("data-a-dynamic-image")) { try { const d = JSON.parse(img.getAttribute("data-a-dynamic-image")); image = Object.keys(d).sort((a, b) => d[b][0] - d[a][0])[0]; } catch {} }
    return { title: t("#productTitle"), price, basis: bo ? bo.textContent.trim() : "", basis_label: bp ? bp.innerText.split(":")[0].replace(/\s+/g, " ").trim() : "",
      savings: (core.querySelector(".savingsPercentage")?.textContent || "").trim(), deal: t("#dealBadge_feature_div").slice(0, 80),
      coupon: (t("#promoPriceBlockMessage_feature_div") + " " + t("#couponBadge")).trim().slice(0, 120), avail: t("#availability").slice(0, 80),
      seller: (t("#merchantInfoFeature_feature_div") || t("#tabular-buybox")).replace(/\s+/g, " ").slice(0, 120), image: image || (img ? img.src : ""),
      location: t("#glow-ingress-line2"), captcha: !!q("form[action*='validateCaptcha']") };
  },
  Target: () => {
    const q = (s) => document.querySelector(s); const t = (s) => (q(s)?.innerText || "").trim();
    const img = q('[data-test="product-image"] img, [data-test="image-gallery-item-0"] img, picture img');
    return { title: t('h1[data-test="product-title"]') || t("h1"), price: t('[data-test="product-price"]'), basis: t('[data-test="product-regular-price"]'),
      savings: t('[data-test="product-price-reg"]') || t('[data-test="product-savings"]'), deal: t('[data-test="promotion"], [data-test="product-promotion"]').slice(0, 120),
      avail: (t('[data-test="fulfillment-cell-shipping"]') + " | " + t('[data-test="shippingButton"]')).slice(0, 120), image: img ? (img.currentSrc || img.src) : "" };
  },
  Walmart: () => {
    const q = (s) => document.querySelector(s); const t = (s) => (q(s)?.innerText || "").trim();
    const img = q('[data-testid="hero-image"] img, [data-testid="media-thumbnail"] img, img[data-testid="hero-image"]');
    return { title: t("h1"), price: t('[itemprop="price"]') || t('[data-testid="price-wrap"]'), basis: t('[data-testid="price-wrap"] .strike, [data-testid="price-wrap"] span.strike, .strike'),
      deal: t('[data-testid="price-wrap"]').slice(0, 160), seller: t('[data-testid="product-seller-info"]').slice(0, 120), avail: t('[data-testid="add-to-cart-section"]').slice(0, 80) || t('[data-testid="ip-out-of-stock"]').slice(0, 80),
      image: img ? (img.currentSrc || img.src) : "", blocked: /Robot or human/i.test(document.title) };
  },
};
const out = fs.createWriteStream(OUT, { flags: "a" });
let n = 0;
for (const it of list) {
  n++; const rec = { ...it, checked_at: new Date().toISOString() };
  try {
    const r = await page.goto(it.url, { waitUntil: "domcontentloaded", timeout: 45000 }); rec.http = r?.status();
    const sel = { Amazon: "#productTitle, form[action*='validateCaptcha']", Target: 'h1[data-test="product-title"], h1', Walmart: "h1" }[it.store];
    await page.waitForSelector(sel, { timeout: 25000 }).catch(() => {});
    if (it.store !== "Amazon") await page.waitForTimeout(2500); else await page.waitForSelector("#corePriceDisplay_desktop_feature_div .a-offscreen, #corePrice_feature_div .a-offscreen, #availability", { timeout: 8000 }).catch(() => {});
    Object.assign(rec, await page.evaluate(EX[it.store]));
    rec.final_url = page.url(); rec.checked_at = new Date().toISOString();
    if (SHOTS) { const f = `${SHOTS}/${it.store}-${it.id}.jpg`; await page.screenshot({ path: f, type: "jpeg", quality: 55 }); rec.shot = f; }
  } catch (e) { rec.error = String(e).slice(0, 200); }
  out.write(JSON.stringify(rec) + "\n"); log(n, it.store, it.id, rec.price || "-", rec.basis || "", rec.error || "");
}
out.end(); await browser.close().catch(() => {});
await bb.sessions.update(session.id, { projectId: "f2ae15a0-a894-4419-977f-d52f52483f0c", status: "REQUEST_RELEASE" }).catch(() => {});
log("done");
