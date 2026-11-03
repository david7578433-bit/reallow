# RealLow — only real low prices

Live: https://reallow.sites.tab.bot/  (also GitHub Pages: https://david7578433-bit.github.io/reallow/)

- **Top deals**: every deal checked on the store's own page (price + was/list price), biggest real savings on top, 🔥 HOT = 40%+ off.
- **Search**: one box, one tap to Amazon, Walmart, Target, eBay, AliExpress, Best Buy, Costco, Home Depot, or Google Shopping (compare all).
- **Categories**, **Share to WhatsApp** on every deal, and a **Post of the day** ready to paste in a group.
- **Kosher Groceries** tab: stores by city (Monroe/KJ, Monsey, Williamsburg, Boro Park, Flatbush, Crown Heights, Lakewood, Five Towns), area search, cheapest staples.

Static site, no build step, no trackers (GoatCounter optional: set `GOATCOUNTER_CODE` in `script.js`).

## Refresh the deals
1. Edit `deals.json` (and `groceries.json`).
2. `node tools/build-deals.mjs` (rewrites `deals.js` / `groceries.js`).
3. `node --test test/` to check.
