// Read a store's own listing/deals page in a real browser: every product link with its card text.
// usage: /usr/bin/node listing.mjs <urls.json [{store,url}]> <out.json> [knobs-json]
import fs from "node:fs"; import Browserbase from "@browserbasehq/sdk"; import { chromium } from "playwright-core";
const [, , IN, OUT, KNOBS = "{}"] = process.argv;
const V = JSON.parse(fs.readFileSync("/home/user/tab/.vendor-capability.json", "utf8"));
const bb = new Browserbase({ apiKey: V.token, baseURL: `${V.base_url}/browserbase` });
const knobs = { proxies: [{ type: "browserbase", geolocation: { city: "NEW YORK", state: "NY", country: "US" } }], region: "us-east-1", ...JSON.parse(KNOBS) };
const session = await bb.sessions.create({ projectId: "f2ae15a0-a894-4419-977f-d52f52483f0c", keepAlive: false, userMetadata: { site: "reallow-listing", task: process.env.TAB_TASK_ID || "none" }, ...knobs });
console.log("session", session.id);
const browser = await chromium.connectOverCDP(session.connectUrl);
const ctx = browser.contexts()[0]; const page = ctx.pages()[0] || await ctx.newPage();
const res = [];
for (const it of JSON.parse(fs.readFileSync(IN, "utf8"))) {
  try {
    await page.goto(it.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(4000);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 2500); await page.waitForTimeout(900); }
    const pat = it.store === "Target" ? "/p/" : "/ip/";
    const cards = await page.evaluate((pat) => {
      const seen = new Set(), out = [];
      for (const a of document.querySelectorAll(`a[href*="${pat}"]`)) {
        const href = a.href.split("#")[0]; const key = href.split("?")[0]; if (seen.has(key)) continue;
        let el = a; for (let k = 0; k < 8 && el.parentElement; k++) { el = el.parentElement; if (/\$\d/.test(el.innerText) && el.innerText.length > 40) break; }
        const txt = el.innerText.replace(/\s+/g, " ").trim(); if (!/\$\d/.test(txt)) continue; seen.add(key);
        const img = el.querySelector("img"); out.push({ href, text: txt.slice(0, 400), img: img ? (img.currentSrc || img.src) : "" });
      }
      return out;
    }, pat);
    res.push({ ...it, title: await page.title(), n: cards.length, cards });
    console.log(it.url, cards.length, await page.title());
  } catch (e) { res.push({ ...it, error: String(e).slice(0, 200) }); console.log(it.url, "ERR", String(e).slice(0, 120)); }
}
fs.writeFileSync(OUT, JSON.stringify(res));
await browser.close().catch(() => {});
await bb.sessions.update(session.id, { projectId: "f2ae15a0-a894-4419-977f-d52f52483f0c", status: "REQUEST_RELEASE" }).catch(() => {});
console.log("done");
