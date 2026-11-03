// RealLow v4 tests: local stores config + collector rules + the search engine, on the real files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('local stores: real stores in the frum cities, each with its own website', () => {
  const c = JSON.parse(read('collectors/config/shops.json'));
  const cities = new Set(c.stores.flatMap((s) => s.cities));
  for (const x of ['Williamsburg', 'Boro Park', 'Flatbush', 'Crown Heights', 'Monsey', 'Monroe / Kiryas Joel', 'Lakewood', 'Five Towns', 'Passaic']) assert.ok(cities.has(x), 'no store in ' + x);
  for (const s of c.stores) { assert.match(s.site, /^https:\/\//); assert.ok(['appliances', 'clothing'].includes(s.cat)); assert.ok(['shopify', 'woo', 'none'].includes(s.platform)); }
  assert.ok(c.stores.filter((s) => s.cat === 'appliances').length >= 10);
  assert.ok(c.stores.filter((s) => s.cat === 'clothing').length >= 30);
  assert.ok(!/kj-grocery-prices|monsey-groceries|williamsburg-kosher-groceries/.test(read('collectors/config/shops.json')));
});

test('collector C: polite, public catalogs only, no holiday or immodest items, daily workflow', () => {
  const s = read('collectors/shops.mjs');
  assert.match(s, /politeFetch/);
  assert.match(s, /products\.json\?limit=250&page=/);
  assert.match(s, /christmas/); assert.match(s, /halloween/); assert.match(s, /bikini/);
  const wf = read('.github/workflows/shops.yml');
  assert.match(wf, /cron: "41 9 \* \* \*"/); assert.match(wf, /workflow_dispatch/); assert.match(wf, /actions\/deploy-pages/);
});

function engine() { const ctx = { window: {} }; vm.runInNewContext(read('search.js'), ctx); return ctx.window.RLSearch; }

test('search: typos, plurals, synonyms, word order, ranking', () => {
  const S = engine(); const ix = new S.Index();
  const docs = [
    ['Samsung 28 cu ft French Door Refrigerator', 'Refrigerators', 1899], ['Refrigerator Shelf Liners 2 pack', '', 2.99],
    ['LG Front Load Washer 4.5 cu ft', 'Washing Machines', 899], ['Boys White Dress Shirt', 'Boys', 24], ['Girls Pleated Skirt', 'Girls', 30],
    ['Mens Black Leather Dress Shoe', 'Shoes', 120], ['Kids Canvas Sneaker', 'Shoes', 30], ['Whole Milk 1 Gallon', '', 4.99], ['Milk Chocolate Bar', '', 2.49]
  ];
  docs.forEach((d, i) => ix.add(d[0], d[1], { i, p: d[2] }));
  const top = (q) => ix.search(q).hits.sort((a, b) => b.rank - a.rank || b.score - a.score).map((h) => docs[h.ref.i][0]);
  assert.ok(top('fridge').includes('Samsung 28 cu ft French Door Refrigerator'));
  assert.ok(top('frige').includes('Samsung 28 cu ft French Door Refrigerator'), 'typo');
  assert.ok(top('refrigerators').length >= 2, 'plural');
  assert.equal(top('washing machine')[0], 'LG Front Load Washer 4.5 cu ft');
  assert.equal(top('boys shirt')[0], 'Boys White Dress Shirt');
  assert.equal(top('shirt boys')[0], 'Boys White Dress Shirt', 'word order');
  assert.equal(top('shirts')[0], 'Boys White Dress Shirt', 'plural');
  assert.ok(top('sneakers').includes('Kids Canvas Sneaker'));
  assert.ok(top('shoes').includes('Kids Canvas Sneaker'), 'sneakers ~ shoes');
  assert.equal(top('shabbos shoes')[0], 'Mens Black Leather Dress Shoe');
  assert.ok(top('milk').length === 2);
  assert.equal(top('zzqx').length, 0);
  assert.equal(S.dist('frige', 'fridge', 2), 1);
});

test('site v4: search engine loaded, category + city filters, store photos lazy, Impact tag still in head', () => {
  const html = read('index.html'), js = read('script.js');
  assert.ok(html.indexOf('<script src="search.js"></script>') > -1 && html.indexOf('search.js') < html.indexOf('script.js'));
  assert.ok(html.indexOf("impact-site-verification") < html.indexOf('</head>'));
  assert.match(html, /id="res-cats"/); assert.match(html, /id="local-shops"/);
  assert.match(js, /"Passaic"/); assert.match(js, /data\/shops\/index\.json/); assert.match(js, /im\.loading = "lazy"/);
  assert.match(js, /AMAZON_TAG = "reallow-20"/);
  assert.match(html, /As an Amazon Associate I earn from qualifying purchases/);
});
