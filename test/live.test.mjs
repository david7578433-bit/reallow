// Live online prices (Nov 11 2026): data/api-prices.json shape, clean titles, no secrets, page wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
test('live prices file: real https links, positive prices, checked times, clean titles', () => {
  const a = JSON.parse(read('data/api-prices.json'));
  for (const k of ['offers', 'top_deals', 'matches']) for (const o of a[k] || []) {
    assert.ok(o.price > 0 && /^https:\/\//.test(o.url) && !isNaN(new Date(o.checked)), k + ' ' + o.title);
    assert.ok(!/hallowe+n|christmas|lingerie|bikini|refurbished|for parts/i.test(o.title), o.title);
  }
  for (const o of a.top_deals || []) assert.ok(o.was > o.price && o.pct_off >= 15, o.title);
});
test('live deals wired into the page, keys only from secrets', () => {
  const html = read('index.html');
  assert.ok(html.includes('<script src="live-deals.js"></script>'));
  for (const id of ['live-deals', 'live-deals-online', 'live-matches']) assert.ok(html.includes(`id="${id}"`), id);
  const wf = read('.github/workflows/online-prices.yml');
  assert.match(wf, /EBAY_CLIENT_SECRET: \$\{\{ secrets\.EBAY_CLIENT_SECRET \}\}/);
  for (const f of ['live-deals.js', 'collectors/adapters/ebay.mjs', 'collectors/adapters/aliexpress.mjs', 'collectors/config/ebay.json', '.github/workflows/online-prices.yml'])
    assert.ok(!/(DavidKla-|PRD-[0-9a-f]{8}|-----BEGIN|client_secret\s*[:=]\s*['"][A-Za-z0-9-]{12})/.test(read(f)), f);
});
