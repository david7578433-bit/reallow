// RealLow browser collector: reads the Mobilezuz-type kosher stores' own product JSON from inside a real browser page.
// One browser session, one store at a time, one request every ~0.8 s. Writes out/<storeId>.json per store.
// Usage: node collect.mjs [storeId ...]   (no ids = every store in stores.json)
import Browserbase from "@browserbasehq/sdk"; import { chromium } from "playwright-core";
import fs from "node:fs"; import path from "node:path";
const DIR = path.dirname(new URL(import.meta.url).pathname);
const CFG = JSON.parse(fs.readFileSync(path.join(DIR, "stores.json"), "utf8"));
// Outside Tab: set BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID (see .env.example). 
const V = !process.env.BROWSERBASE_API_KEY && process.env.TAB_VENDOR_FILE ? JSON.parse(fs.readFileSync(process.env.TAB_VENDOR_FILE, "utf8")) : null;
const PROJECT = process.env.BROWSERBASE_PROJECT_ID || "YOUR_BROWSERBASE_PROJECT_ID";
const DELAY = Number(process.env.RL_DELAY_MS || 800);
const only = process.argv.slice(2);
const stores = CFG.stores.filter((s) => !only.length || only.includes(s.id));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const H = { pathname: "/", accept: "application/json, text/plain, */*" };

const bb = V ? new Browserbase({ apiKey: V.token, baseURL: V.base_url + "/browserbase" }) : new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
async function openSession() {
  const s = await bb.sessions.create({ projectId: PROJECT, proxy: process.env.RL_PROXY || "rotating", timeout: 5400, region: "us-east-1",
    userMetadata: { task: process.env.TAB_TASK_ID || "reallow-collector", site: "reallow-kosher-stores", knobs: "rotating-residential" },
    browserSettings: { recordSession: false, logSession: false } });
  const browser = await chromium.connectOverCDP(s.connectUrl, { timeout: 45000 });
  const ctx = browser.contexts()[0]; const page = ctx.pages()[0] || await ctx.newPage();
  return { s, browser, page };
}
async function closeSession(x) { if (!x) return; await x.browser.close().catch(() => {}); await bb.sessions.update(x.s.id, { projectId: PROJECT, status: "REQUEST_RELEASE" }).catch(() => {}); }

async function openStore(page, site) {
  await page.goto(site, { waitUntil: "domcontentloaded", timeout: 60000 });
  for (let i = 0; i < 20; i++) { await page.waitForTimeout(2500); const t = await page.title().catch(() => ""); if (t && !/just a moment|attention required|cloudflare/i.test(t)) return t; }
  throw Object.assign(new Error("bot check did not clear on the home page"), { blocked: true });
}
async function api(page, p) {
  const r = await page.evaluate(async ([u, h]) => { try { const r = await fetch(u, { headers: h }); const t = await r.text(); return { s: r.status, t }; } catch (e) { return { s: 0, t: String(e) }; } }, [p, H]);
  if (r.s === 200 && /^\s*[\[{]/.test(r.t)) return JSON.parse(r.t);
  const e = new Error(`HTTP ${r.s} ${/Just a moment/.test(r.t) ? "(bot check)" : r.t.slice(0, 120)}`); e.status = r.s; e.blocked = /Just a moment/.test(r.t); throw e;
}
const filt = (cat) => encodeURIComponent(JSON.stringify({ must: { exists: ["family.id", "family.categoriesPaths.id", "branch.regularPrice"], term: Object.assign({ "branch.isActive": true, "branch.isVisible": true }, cat ? { "family.categoriesPaths.id": cat } : {}) }, mustNot: { term: { "branch.regularPrice": 0, "branch.isOutOfStock": true } } }));

function norm(p, st, checked) {
  const b = p.branch || {}; const reg = Number(b.regularPrice);
  if (!(reg > 0 && reg < 2000)) return null;
  let sale = null, saleText = null;
  if (Number(b.salePrice) > 0 && Number(b.salePrice) < reg) sale = Number(b.salePrice);
  for (const sp of b.specials || []) {
    const nm = sp.names && sp.names["2"] && sp.names["2"].name; if (nm && !saleText) saleText = nm;
    const fl = sp.firstLevel || {};
    if (!sale && !sp.isCoupon && sp.hasOneProduct && fl.type === 2 && fl.firstPurchaseTotal === 1 && fl.firstGift && Number(fl.firstGift.total) > 0 && Number(fl.firstGift.total) < reg) sale = Number(fl.firstGift.total);
  }
  const nm = (p.names && p.names["2"] && (p.names["2"].long || p.names["2"].short)) || p.localName || "";
  const brand = p.brand && p.brand.names && p.brand.names["2"] || null;
  const uom = p.unitOfMeasure && p.unitOfMeasure.names && p.unitOfMeasure.names["2"] || "";
  const size = p.weight ? `${p.weight} ${uom}`.trim() : null;
  const img = p.image && p.image.url ? p.image.url.replace("{{size}}", "medium").replace(/\{\{extension[^}]*\}\}/, "jpg") : null;
  const cat = p.family && p.family.categoriesPaths && p.family.categoriesPaths[0] ? p.family.categoriesPaths[0].map((c) => c.names && c.names["2"]).filter(Boolean).join(" > ") : null;
  return { name: nm.replace(/\s+/g, " ").trim(), brand, size, price: reg, sale, saleText, weighable: !!p.isWeighable, unit: p.isWeighable ? (uom || 'lb').toLowerCase() : '',
    barcode: p.barcode || p.localBarcode || null, productId: p.productId, id: p.id, category: cat,
    url: `${st.site}/?catalogProduct=${p.productId}`, image: img, checked };
}

async function collectStore(page, st) {
  const t0 = Date.now();
  const title = await openStore(page, st.site); log(st.id, "page open:", title);
  const base = `/v2/retailers/${st.retailerId}/branches/${st.branchId}`;
  try { const br = await api(page, `/v2/retailers/${st.retailerId}/branches?appId=4`); log(st.id, "branches:", (br.branches || []).map((b) => `${b.id}=${b.name}/${b.city}`).join("; ")); if (!(br.branches || []).some((b) => b.id === st.branchId)) log(st.id, "WARNING branch", st.branchId, "not in the store's branch list"); } catch (e) { log(st.id, "branches err", e.message); }
  await sleep(DELAY);
  const tree = await api(page, `/v2/retailers/${st.retailerId}/tree?appId=4`);
  const items = new Map(); let requests = 0;
  async function pageCat(cat, label, depth) {
    let from = 0, total = null;
    while (true) {
      await sleep(DELAY);
      const j = await api(page, `${base}/products?appId=4&from=${from}&size=100&languageId=2&filters=${filt(cat)}`); requests++;
      if (total === null) total = j.total;
      if (total >= 10000 && depth < 3 && cat !== null) return "split";
      for (const p of j.products || []) { const x = norm(p, st, new Date().toISOString()); if (x && !items.has(x.id)) items.set(x.id, x); }
      from += 100; if (!(j.products || []).length || from >= Math.min(total, 10000)) break;
    }
    log(st.id, `${label}: ${total} listed, ${items.size} unique so far`);
  }
  async function walk(c, depth) {
    const label = (c.names && c.names["2"]) || c.id;
    const r = await pageCat(c.id, label, depth);
    if (r === "split") for (const k of c.categories || []) await walk(k, depth + 1);
  }
  for (const c of tree.categories || []) {
    try { await walk(c, 0); } catch (e) { if (e.blocked) { log(st.id, "bot check mid-run, reopening page"); await openStore(page, st.site); await walk(c, 0); } else log(st.id, "category err", c.id, e.message); }
  }
  // Fallback only when the store has no category tree: page the whole list (the store's search caps this at 10000).
  if (!(tree.categories || []).length) try { const before = items.size; await pageCat(null, "all (no category)", 9); log(st.id, `uncategorised pass added ${items.size - before}`); } catch (e) { log(st.id, "all-pass err", e.message); }
  return { items: [...items.values()], requests, secs: Math.round((Date.now() - t0) / 1000) };
}

const summary = {}; let sess = null;
try {
  sess = await openSession(); log("browser session open");
  for (const st of stores) {
    let res = null, err = null;
    for (let attempt = 1; attempt <= 2 && !res; attempt++) {
      try { res = await collectStore(sess.page, st); }
      catch (e) { err = e; log(st.id, `attempt ${attempt} failed: ${e.message}`); if (attempt === 1) { await closeSession(sess); sess = await openSession(); log("fresh browser session (new address)"); } }
    }
    const rec = res ? { id: st.id, status: "ok", checked: new Date().toISOString(), count: res.items.length, requests: res.requests, secs: res.secs, items: res.items }
                    : { id: st.id, status: err && err.blocked ? "blocked" : "error", note: err ? err.message : "unknown", checked: new Date().toISOString(), count: 0, items: [] };
    if (res && res.items.length < 50) { rec.status = "error"; rec.note = `only ${res.items.length} items came back`; }
    fs.writeFileSync(path.join(DIR, "out", `${st.id}.json`), JSON.stringify(rec));
    summary[st.id] = { status: rec.status, count: rec.count, secs: rec.secs || null, note: rec.note || null };
    log(st.id, "=>", JSON.stringify(summary[st.id]));
    await sleep(3000);
  }
} finally { await closeSession(sess); fs.writeFileSync(path.join(DIR, "out", "_summary.json"), JSON.stringify({ at: new Date().toISOString(), summary }, null, 1)); log("done", JSON.stringify(summary)); }
