// RealLow v2 tests: read the real final files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('page basics: title, viewport, Impact verification tag, local assets exist', () => {
  const html = read('index.html');
  assert.match(html, /<title>RealLow[^<]+<\/title>/);
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1/);
  assert.ok(html.includes("<meta name='impact-site-verification' value='8d3a682e-0a66-4728-bd6b-7e1029d7a392'>"));
  for (const m of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) assert.ok(fs.existsSync(path.join(ROOT, m[1])), 'missing asset ' + m[1]);
  assert.ok(!/lorem|TODO|\{\{/i.test(html));
  assert.ok(!/googletagmanager|google-analytics|facebook\.net|hotjar/i.test(html + read('script.js')), 'no trackers');
});

test('robots workflow: every 4 hours + manual, deploys Pages, keys only from secrets', () => {
  const wf = read('.github/workflows/robots.yml');
  assert.match(wf, /cron: "17 \*\/4 \* \* \*"/);
  assert.match(wf, /workflow_dispatch/);
  assert.match(wf, /actions\/deploy-pages/);
  for (const k of ['EBAY_CLIENT_ID', 'IMPACT_AUTH_TOKEN', 'CJ_PERSONAL_TOKEN', 'RAKUTEN_CLIENT_SECRET', 'AMAZON_CREATORS_CREDENTIAL_SECRET']) assert.match(wf, new RegExp(`${k}: \\$\\{\\{ secrets\\.${k} \\}\\}`));
});

test('collectors: polite User-Agent and robots.txt check', () => {
  const p = read('collectors/lib/polite.mjs');
  assert.match(p, /RealLowBot\/1\.0/);
  assert.match(p, /robots\.txt/);
  assert.match(p, /class Blocked/);
  const g = read('collectors/config/grocery-stores.json');
  assert.ok(!/kj-grocery-prices\.sites|monsey-groceries\.sites|williamsburg-kosher-groceries\.sites/.test(g.replace(/"note"[^\n]*\n/, '')), 'never scrape other people\'s sites');
});

test('grocery data: thousands of real prices with store timestamps', () => {
  const g = JSON.parse(read('data/groceries.json'));
  assert.ok(g.items.length >= 5000, 'items ' + g.items.length);
  assert.ok(g.stores.filter((s) => s.status === 'ok').length >= 8);
  for (const s of g.stores.filter((x) => x.status === 'ok')) assert.ok(!isNaN(new Date(s.checked)), 'checked time for ' + s.name);
  for (const it of g.items.slice(0, 500)) { assert.equal(typeof it[0], 'string'); for (const o of it[2]) assert.ok(o[1] > 0 && Number.isInteger(o[3])); }
});

test('deals data: robot feed + store-checked deals, no holiday/immodest words', () => {
  const d = JSON.parse(read('deals.json'));
  assert.ok(d.feed.length >= 100, 'feed ' + d.feed.length);
  for (const x of d.feed) { assert.ok(x.price > 0 && /^https:\/\//.test(x.url) && x.checked); assert.ok(!/hallowe+n|christmas|lingerie|bikini/i.test(x.title), x.title); }
  const js = read('deals.js'); const ctx = { window: {} }; vm.runInNewContext(js, ctx); assert.ok(ctx.window.REALLOW_DEALS.feed.length === d.feed.length);
});

test('store directory: 40+ stores, grouped, every link has the query slot', () => {
  const ctx = { window: {} }; vm.runInNewContext(read('stores.js'), ctx);
  const groups = ctx.window.REALLOW_STORES.groups; const all = groups.flatMap((g) => g.stores);
  assert.ok(groups.length >= 6); assert.ok(all.length >= 40, 'stores ' + all.length);
  for (const s of all) assert.match(s.url, s.noq ? /^https:\/\/\S+$/ : /^https:\/\/[^ ]+\{(q|dash|path)\}/, s.name);
  for (const n of ["BJ's", 'TJ Maxx', 'IKEA', "Lowe's", 'Dollar Tree', 'Amazon', 'Walmart']) assert.ok(all.some((s) => s.name === n), n);
});

test('no secrets committed', () => {
  const files = ['script.js', 'collectors/adapters/ebay.mjs', 'collectors/adapters/impact.mjs', 'collectors/adapters/cj.mjs', 'collectors/adapters/rakuten.mjs', 'collectors/adapters/amazon.mjs', '.github/workflows/robots.yml'];
  for (const f of files) assert.ok(!/(sk_live|AKIA[0-9A-Z]{12}|-----BEGIN|client_secret\s*[:=]\s*['"][A-Za-z0-9]{12})/.test(read(f)), f);
});
