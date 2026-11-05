// Online deals tab (added Nov 5 2026): data shape and wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('online deals: every deal has a real price, a store link, a check time', () => {
  const j = JSON.parse(read('data/online-deals.json'));
  assert.ok(Array.isArray(j.deals) && j.deals.length >= 1);
  const ids = new Set();
  for (const d of j.deals) {
    assert.ok(d.id && !ids.has(d.id), 'unique id ' + d.id); ids.add(d.id);
    assert.ok(d.title && d.store && d.price > 0, d.id);
    assert.match(d.url, /^https:\/\/(www\.)?(amazon|walmart|target)\.com\//, d.id);
    if (/amazon\.com/.test(d.url)) assert.match(d.url, /[?&]tag=reallow-20(&|$)/, 'Amazon link carries the tag: ' + d.id);
    assert.ok(!isNaN(Date.parse(d.checked_at)), 'checked_at ' + d.id);
    if (d.was != null) { assert.ok(d.was > d.price, d.id); assert.equal(d.pct_off, Math.round((1 - d.price / d.was) * 100), d.id); }
    if (d.image) assert.match(d.image, /^https:\/\//);
    assert.ok(!/yazory|williamsburg ?view|monsey ?view|kasho|scanovator|simcha ?card|save ?crazy|dealnews|slickdeals/i.test(JSON.stringify(d)), 'no aggregator source ' + d.id);
  }
});

test('online deals: tab, view and loader are wired; other tabs still there', () => {
  const html = read('index.html'), js = read('script.js');
  for (const id of ['tab-deals', 'tab-groceries', 'tab-stores', 'tab-online', 'view-online', 'on-list', 'on-chips', 'on-time', 'potd-wa']) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /Price when checked <span id="on-time">/);
  assert.match(html, /may change/);
  assert.ok(js.includes('getJSON("data/online-deals.json", applyOnline)'));
  assert.ok(js.includes('["deals", "groceries", "stores", "online"]'));
  assert.ok(js.includes('dIx.add(d.title, d.store || "", { d: d, on: true })'), 'online deals in search');
});
