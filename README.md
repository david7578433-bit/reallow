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

Stores that block robots today: Refresh, Shlomie's, Evergreen (Monsey + Lakewood), Wesley, Hatzlacha, Kahan's (Cloudflare bot check). Slickdeals' robots.txt disallows its RSS, so it is not read.

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
