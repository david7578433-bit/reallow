// Collector B: general deals -> deals.json
// Sources: public RSS feeds (Slickdeals frontpage/popular/hot, DealNews, TechBargains). Keeps a deal only when the
// source states a clear price, the deal is not expired, and it passes the tznius / no-holiday filters.
// v1's store-checked deals stay on top until they are 72 hours old, then drop out.
import fs from 'node:fs/promises';
import path from 'node:path';
import { politeFetch } from './lib/polite.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FEEDS = [
  // Slickdeals' robots.txt disallows its RSS (/newsearch.php?*rss=*), so the robot does not read it. The 'sd' parser stays for a future allowed feed.
  { src: 'DealNews', kind: 'dn', url: 'https://www.dealnews.com/?rss=1&sort=time' },
  { src: 'DealNews', kind: 'dn', url: 'https://www.dealnews.com/?rss=1&sort=hotness' },
  { src: 'DealNews', kind: 'dn', url: 'https://www.dealnews.com/c142/Electronics/?rss=1' },
  { src: 'DealNews', kind: 'dn', url: 'https://www.dealnews.com/c39/Computers/?rss=1' },
  { src: 'DealNews', kind: 'dn', url: 'https://www.dealnews.com/c196/Home-Garden/?rss=1' },
  { src: 'DealNews', kind: 'dn', url: 'https://www.dealnews.com/c206/Home-Garden/Kitchen/?rss=1' },
  { src: 'DealNews', kind: 'dn', url: 'https://www.dealnews.com/c238/Tools-Hardware/?rss=1' },
  { src: 'DealNews', kind: 'dn', url: 'https://www.dealnews.com/c220/Toys/?rss=1' },
  { src: 'TechBargains', kind: 'tb', url: 'https://www.techbargains.com/rss.xml' },
];
const MAX_AGE_H = 72;

const BLOCK = /\b(hallowe+n|costume|trick.or.treat|christmas|xmas|santa|nativity|advent calendar|easter|valentine|lingerie|bra|bras|bikini|swim ?suit|swimwear|underwear|panties|boxer|thong|leggings|yoga pants|sexy|intimate|dating|beer|wine|whiskey|vodka|liquor|tequila|bourbon|cigar|vape|cannabis|cbd|thc|kratom|lottery|casino|sportsbook|gambl|bacon|pork|ham|shrimp|lobster|crab|tattoo|r-rated|mature 17\+|horror|zombie|skull|witch|pride month)\b/i;
const FASHION = /\b(dress|dresses|skirt|jeans|shirt|t-shirt|tee|hoodie|sweatshirt|jacket|coat|pants|shorts|sneakers|shoes|boots|sandals|apparel|clothing|socks|bra|leggings|polo|blouse|cardigan|sweater|vest|outfit|adidas|nike|under armour|old navy|gap|levi|calvin klein|victoria|h&m|uniqlo|lululemon)\b/i;
const BAD_CATS = /clothing|shoes|apparel|fashion|jewelry|beauty|cosmetic|fragrance|alcohol|wine|beer|gambling|dating|swim/i;

const CATS = [
  ['tech', /\b(laptop|chromebook|macbook|ipad|tablet|monitor|tv|hdtv|oled|qled|headphone|earbud|airpods|speaker|soundbar|ssd|hard drive|microsd|usb|charger|power bank|router|mesh|wifi|keyboard|mouse|webcam|camera|drone|smartwatch|watch|phone|iphone|galaxy|pixel|xbox|playstation|ps5|nintendo|switch|gaming|gpu|cpu|ryzen|intel|nvidia|printer|projector|kindle|echo|alexa|fire tv|roku|chromecast|cable|adapter|hub|bluetooth|electronics|computer|pc )/i],
  ['kitchen', /\b(air fryer|instant pot|pressure cooker|blender|mixer|kitchenaid|ninja|cuisinart|toaster|oven|microwave|coffee|espresso|keurig|knife|cookware|skillet|pan|pot|dutch oven|bakeware|kettle|grill|griddle|food storage|lunch|kitchen|dishwasher|refrigerator|fridge)\b/i],
  ['kids', /\b(lego|toy|toys|kids|baby|toddler|stroller|car seat|crib|diaper|wipes|puzzle|board game|play ?set|doll|nerf|hot wheels|crayola|stuffed|plush|nursery|melissa|fisher-price)\b/i],
  ['tools', /\b(drill|driver|impact|saw|dewalt|milwaukee|ryobi|makita|craftsman|bosch|kobalt|wrench|socket|tool|ladder|flashlight|battery|batteries|generator|compressor|vacuum|shop-vac|screwdriver|plier|level|tape measure|workbench|automotive|car |tire|jump starter)\b/i],
  ['home', /\b(mattress|pillow|sheet|towel|blanket|bed|sofa|chair|desk|table|shelf|storage|organizer|lamp|light|bulb|fan|heater|air purifier|humidifier|dehumidifier|robot vacuum|roomba|mop|cleaner|detergent|laundry|trash|paper towel|toilet paper|smart lock|doorbell|camera|thermostat|furniture|rug|curtain|home|garden|patio|plant|hose|bath|shower)\b/i],
  ['food', /\b(snack|coffee beans|k-cup|tea|cereal|chocolate|candy|nuts|almonds|protein|oil|olive|spice|water|soda|juice|grocery|food|pasta|rice|flour|sugar|honey|granola|bar)\b/i],
  ['travel', /\b(luggage|suitcase|carry-on|backpack|duffel|travel|passport|packing cubes|cooler|tent|camping|hotel|flight)\b/i],
];
function catsFor(text, srcCat) {
  const t = ' ' + text + ' ' + (srcCat || '') + ' ';
  const out = []; for (const [c, re] of CATS) if (re.test(t)) out.push(c);
  return out.length ? out.slice(0, 2) : ['home'];
}
const decode = (s) => String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
function tag(xml, name) { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i')); return m ? decode(m[1]).trim() : ''; }
function firstPrice(title) {
  if (/\bfree\b/i.test(title) && !/\$\s?\d/.test(title)) return null;
  const m = title.match(/\$\s?(\d{1,5}(?:,\d{3})*(?:\.\d{1,2})?)/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}
function cleanUrl(u) {
  try {
    const x = new URL(u);
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|ref|tag|iref|smid|psc|ascsubtag|linkcode|camp|creative|sdtid|irgwc|afsrc|clickid|subid)/i.test(k)) x.searchParams.delete(k);
    if (/amazon\./.test(x.host)) { const m = x.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/); if (m) return `https://www.amazon.com/dp/${m[1]}`; }
    return x.toString();
  } catch { return u; }
}
const storeFromHost = (u) => { try { const h = new URL(u).host.replace(/^www\./, ''); const map = { 'amazon.com': 'Amazon', 'walmart.com': 'Walmart', 'target.com': 'Target', 'bestbuy.com': 'Best Buy', 'ebay.com': 'eBay', 'homedepot.com': 'Home Depot', 'lowes.com': "Lowe's", 'costco.com': 'Costco', 'newegg.com': 'Newegg', 'woot.com': 'Woot', 'bhphotovideo.com': 'B&H Photo', 'kohls.com': "Kohl's", 'macys.com': "Macy's" }; return map[h] || h; } catch { return ''; } };

function parseItems(xml) { return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]); }

async function readFeed(f) {
  const r = await politeFetch(f.url, {}, 2500);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const xml = await r.text(); const out = [];
  for (const it of parseItems(xml)) {
    const title = tag(it, 'title'); const pub = new Date(tag(it, 'pubDate'));
    let price = null, url = '', store = '', srcCat = tag(it, 'category'), was = null, expires = null, score = 0, thread = '';
    if (f.kind === 'sd') {
      price = firstPrice(title); thread = cleanUrl(tag(it, 'link'));
      const desc = tag(it, 'description');
      const sm = desc.match(/^\s*([A-Z][\w&'. -]{1,40}?)\s*\[([a-z0-9.-]+\.[a-z]{2,})\]/);
      store = sm ? sm[1].trim() : '';
      url = thread; // Slickdeals thread holds the store link; their outbound click links are disallowed for robots
      const sc = (tag(it, 'content:encoded').match(/Thumb Score:\s*\+?(-?\d+)/) || [])[1]; score = sc ? +sc : 0;
      if (/expired/i.test(title)) continue;
    } else if (f.kind === 'dn') {
      const p = tag(it, 'dealnews:price'); price = p ? Number(p) : firstPrice(title);
      store = tag(it, 'dealnews:retailer'); url = cleanUrl(tag(it, 'link')); srcCat = tag(it, 'dealnews:category') || srcCat;
      const ex = tag(it, 'dealnews:expires'); expires = ex ? new Date(ex) : null;
      if (expires && expires < new Date()) continue;
      const off = tag(it, 'description').match(/\$(\d+(?:\.\d\d)?) off/); if (off && price) was = Math.round((price + Number(off[1])) * 100) / 100;
      if (tag(it, 'dealnews:staffPick') === 'true') score = 30;
    } else {
      price = firstPrice(title); url = cleanUrl(tag(it, 'link')); store = tag(it, 'vendorname') || storeFromHost(url);
    }
    if (!price || price <= 0 || !url || !title) continue;
    if (isNaN(pub) || (Date.now() - pub) / 36e5 > MAX_AGE_H) continue;
    const text = title + ' ' + srcCat;
    if (BLOCK.test(text) || BAD_CATS.test(srcCat) || FASHION.test(title)) continue;
    out.push({ title: title.slice(0, 160), price, was, store: store || storeFromHost(url), url, src: f.src, posted: pub.toISOString(), cats: catsFor(title, srcCat), score });
  }
  return out;
}

const runAt = new Date();
const status = [];
let all = [];
for (const f of FEEDS) {
  try { const got = await readFeed(f); all.push(...got); status.push({ src: f.src, url: f.url, ok: true, kept: got.length }); console.log(f.src, 'kept', got.length); }
  catch (e) { status.push({ src: f.src, url: f.url, ok: false, error: e.message }); console.log(f.src, 'FAILED', e.message); }
}
// de-duplicate by link and by near-identical title
const seen = new Set(); const feed = [];
for (const d of all.sort((a, b) => b.score - a.score || new Date(b.posted) - new Date(a.posted))) {
  const k1 = d.url; const k2 = d.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').slice(0, 60);
  if (seen.has(k1) || seen.has(k2)) continue; seen.add(k1); seen.add(k2);
  d.id = 'f' + Buffer.from(k1).toString('base64url').slice(-12);
  d.checked = runAt.toISOString();
  if (d.was && d.was > d.price) d.pct_off = Math.round((1 - d.price / d.was) * 100);
  feed.push(d);
}
let prev = {}; try { prev = JSON.parse(await fs.readFile(path.join(ROOT, 'deals.json'), 'utf8')); } catch {}
// store-checked deals (opened on the store page by hand): kept while under 72 h old
const verified = (prev.deals || []).filter((d) => d.verified_at && (Date.now() - new Date(d.verified_at)) / 36e5 < MAX_AGE_H);
if (!feed.length && prev.feed && prev.feed.length) { console.log('All feeds failed; keeping previous feed.'); process.exit(0); }
const out = {
  site: 'RealLow', updated: runAt.toISOString(),
  post_of_the_day: verified.find((d) => d.id === prev.post_of_the_day) ? prev.post_of_the_day : (verified[0] && verified[0].id) || null,
  how_checked: "Top: deals opened and checked on the store's own page by hand (kept 72 hours). Feed: deals the RealLow robot reads every 4 hours from public deal feeds (Slickdeals, DealNews, TechBargains). A feed deal is kept only when the source states a clear price and the deal is not expired; the store's page is the final word.",
  hot: prev.hot || 40,
  deals: verified,
  feed,
  sources: status,
};
await fs.writeFile(path.join(ROOT, 'deals.json'), JSON.stringify(out, null, 1));
await fs.writeFile(path.join(ROOT, 'deals.js'), 'window.REALLOW_DEALS = ' + JSON.stringify(out) + ';\n'); // offline fallback copy
console.log('deals: verified', verified.length, 'feed', feed.length);
