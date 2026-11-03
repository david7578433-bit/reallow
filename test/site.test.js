// RealLow v1 tests: read the real built files and check the core of the request.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const SITE = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(SITE, f), "utf8");

test("index has title, viewport, landmarks and local assets only", () => {
  const html = read("index.html");
  assert.match(html, /<title>RealLow[^<]*<\/title>/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1/);
  assert.match(html, /<main/); assert.match(html, /<header/); assert.match(html, /<footer/);
  for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    const ref = m[1];
    if (/^https?:/.test(ref)) assert.fail("remote asset in index.html: " + ref);
    assert.ok(fs.existsSync(path.join(SITE, ref)), "missing local file " + ref);
  }
  assert.doesNotMatch(html, /lorem|TODO|placeholder text|\{\{/i);
});

test("deals.json and deals.js carry the same verified deals", () => {
  const data = JSON.parse(read("deals.json"));
  const js = read("deals.js");
  const fromJs = JSON.parse(js.replace(/^[^=]+=\s*/, "").replace(/;\s*$/, ""));
  assert.deepStrictEqual(fromJs, data);
  assert.ok(data.deals.length >= 15, "at least 15 deals, got " + data.deals.length);
  const ids = new Set();
  for (const d of data.deals) {
    assert.ok(!ids.has(d.id), "duplicate id " + d.id); ids.add(d.id);
    assert.ok(d.title && d.store, "title/store " + d.id);
    assert.ok(typeof d.price === "number" && d.price > 0, "price " + d.id);
    if (d.was != null) assert.ok(d.was > d.price, "was > price " + d.id);
    assert.match(d.url, /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\//, "url " + d.id);
    assert.doesNotMatch(d.url, /slickdeals|clickid|tag=|affiliate/i, "clean store url " + d.id);
    assert.ok(/2026/.test(d.checked), "checked date " + d.id);
    assert.ok(Array.isArray(d.cats) && d.cats.length, "cats " + d.id);
    if (d.image) assert.ok(fs.existsSync(path.join(SITE, d.image)), "image file " + d.image);
    if (d.hot) assert.ok(d.was && (1 - d.price / d.was) >= 0.3, "hot means 30%+ off " + d.id);
    assert.doesNotMatch(d.title, /halloween|christmas|xmas|costume|lingerie|swim/i, "clean deal " + d.id);
  }
  assert.ok(data.deals.some((d) => d.id === data.post_of_the_day), "post of the day points at a deal");
});

test("search covers every requested store with real search URL patterns", () => {
  const js = read("script.js");
  for (const u of ["https://www.amazon.com/s?k=", "https://www.walmart.com/search?q=", "https://www.target.com/s?searchTerm=",
    "https://www.ebay.com/sch/i.html?_nkw=", "https://www.aliexpress.us/w/wholesale-", "https://www.bestbuy.com/site/searchpage.jsp?st=",
    "https://www.costco.com/CatalogSearch", "https://www.homedepot.com/s/", "https://www.google.com/search?udm=28&q="]) {
    assert.ok(js.includes(u), "missing store search " + u);
  }
  assert.match(js, /https:\/\/wa\.me\/\?text=/);
});

test("no third-party trackers, GoatCounter only and off by default", () => {
  const all = ["index.html", "script.js", "styles.css"].map(read).join("\n");
  assert.doesNotMatch(all, /googletagmanager|google-analytics|gtag\(|facebook\.net|hotjar|clarity\.ms|fonts\.googleapis/i);
  assert.match(read("script.js"), /GOATCOUNTER_CODE = ""/);
});

test("groceries tab data is well formed when present", () => {
  const p = path.join(SITE, "groceries.js");
  if (!fs.existsSync(p)) return;
  const g = JSON.parse(read("groceries.js").replace(/^[^=]+=\s*/, "").replace(/;\s*$/, ""));
  if (g === null) return;
  assert.ok(Array.isArray(g.cities));
  for (const c of g.cities) for (const s of c.stores) assert.match(s.website || s.order_online || s.specials_url, /^https:\/\//);
});
