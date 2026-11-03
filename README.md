# RealLow — only real low prices

Live: https://reallow.sites.tab.bot/  ·  GitHub Pages: https://david7578433-bit.github.io/reallow/

Search any item and see every store's price, cheapest first.

## The robots (GitHub Actions, every 4 hours)
`.github/workflows/robots.yml` runs at 00:17, 04:17, 08:17, 12:17, 16:17 and 20:17 UTC (and on demand from the Actions tab: "Run workflow"). It commits fresh data and publishes the site on GitHub Pages.

| Robot | File | What it reads | Writes |
|---|---|---|---|
| A: kosher groceries | `collectors/groceries.mjs` | each store's own public online catalog (My Cloud Grocer stores), all pages | `data/groceries.json` |
| B: deals | `collectors/deals.mjs` | public deal RSS feeds (DealNews, TechBargains) | `deals.json`, `deals.js` |
| Store APIs | `collectors/store-apis.mjs` + `collectors/adapters/*` | eBay Browse API, Impact (Walmart/Target), CJ, Rakuten, Amazon Creators API — **only when keys exist** | `data/api-prices.json` |
| Summary | `collectors/status.mjs` | — | `data/status.json` |

Polite by design (`collectors/lib/polite.mjs`): honest User-Agent `RealLowBot/1.0`, robots.txt respected, 1.5 s+ between requests per site, stops on any block (bot check, 403/429/503). If a store blocks robots, the site says "search on store" instead of guessing. Every price on the site carries the time it was checked.

Stores behind a bot check: Refresh, Shlomie's, Evergreen (Monsey + Lakewood), Wesley, Hatzlacha, Kahan's (Cloudflare). Simple robots get blocked, so these are read in a real browser twice a day (off GitHub, one store at a time, slow). That run commits `data/browser/*.json` and starts the `browser-merge` workflow, which merges them into `data/groceries.json` without re-reading the other stores; the 4-hourly robot run also includes them. These stores list no barcodes: items are joined across those six stores by the shared catalog id, and to barcode stores only when name + size match exactly (shown on the site as "name match"). If a store's browser data is more than 3 days old the site still shows it with its own "checked" time. Slickdeals' robots.txt disallows its RSS, so it is not read.

## Turning on store APIs (keys go in GitHub secrets, never in this repo)
Repo → Settings → Secrets and variables → Actions → New repository secret:
- eBay: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` (optional `EBAY_CAMPAIGN_ID` for eBay Partner Network links)
- Impact (Walmart, Target): `IMPACT_ACCOUNT_SID`, `IMPACT_AUTH_TOKEN` (optional `IMPACT_CATALOG_IDS`)
- CJ Affiliate: `CJ_PERSONAL_TOKEN`, `CJ_COMPANY_ID`, `CJ_WEBSITE_ID`
- Rakuten: `RAKUTEN_CLIENT_ID`, `RAKUTEN_CLIENT_SECRET`, `RAKUTEN_SID`
- Amazon Creators API: `AMAZON_CREATORS_CREDENTIAL_ID`, `AMAZON_CREATORS_CREDENTIAL_SECRET`, `AMAZON_PARTNER_TAG`
Search terms the APIs are asked about: `collectors/config/api-terms.json`.

Amazon Associates tag for the "See it on Amazon" buttons and Amazon deal links: `AMAZON_TAG` at the top of `script.js` (now `reallow-20`; blank = no tag). The footer carries the Amazon Associate disclosure.

## Site
Static: `index.html`, `styles.css`, `script.js`, `stores.js` (store directory, grouped), `groceries.js` (store addresses/links by city). No trackers (GoatCounter optional: `GOATCOUNTER_CODE` in `script.js`). "For you" / My list is saved on the visitor's phone only (localStorage) and has a Reset link.

## Check
`node --test test/site.test.mjs`

## v4: local appliance + clothing stores, and a smarter search
Robot C (`collectors/shops.mjs`, `.github/workflows/shops.yml`, daily at 09:41 UTC and on demand) reads the **public online catalogs** of local appliance and clothing/shoe stores in Williamsburg, Boro Park, Flatbush, Crown Heights, Monsey, Monroe/KJ, Lakewood, Five Towns and Passaic: Shopify's public `/products.json` (250 per page) and WooCommerce's public Store API. Same polite rules (robots.txt, 1.5 s between requests per store, stops on a block). It keeps in-stock items with a real price only, skips holiday items (Christmas, Halloween…), gift cards and immodest items, and writes one compact file per store in `data/shops/` plus `data/shops/index.json`. Product photos are the store's own (small, lazy-loaded thumbnails, not copied). A store that fails keeps its last good file with its older "checked" time. Stores with no online catalog are listed with call / visit buttons.

The store list (name, city, address, phone, platform) is `collectors/config/shops.json` — each store was checked on its own website. To add a Shopify store: add a line with `"platform": "shopify"` and its domain; it is read on the next run.

Search (`search.js`, no libraries): one index in the browser over groceries + local store products, built in small steps as files load. Typos are OK ("frige"), plurals ("shirts"), word order ("shirt boys"), synonyms (fridge = refrigerator, washing machine = washer, sneakers ~ shoes, shabbos shoes ~ dress shoes, kippah = yarmulke…). Ranking: exact word > starts-with > typo; parts/accessories after the real thing; then cheapest first. Filters: All / Groceries / Appliances / Clothing / Deals / Stores, plus the area. A search with no price still shows store buttons. Same-model appliances at several stores are shown together, cheapest first.
