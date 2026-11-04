# RealLow browser collector

Reads the kosher stores that put a bot check in front of simple robots (Refresh, Shlomie's, Evergreen Monsey + Lakewood,
Wesley, Hatzlacha, Kahan's, Foodoo) from inside a real browser page, then pushes their prices into David Klar's RealLow repo.

Run (from a Tab turn, so TAB_TASK_ID is set — the GitHub writes go through the connected account and the request files
must sit in that turn's task directory):

    node /home/user/tab/files/reallow-browser-collector/run.mjs            # all stores
    node /home/user/tab/files/reallow-browser-collector/run.mjs refresh    # some stores

Steps: collect.mjs (one browser session, residential exit, one store at a time, ~0.8 s between requests, every category
of the store's own catalog) -> export.mjs (compact files, 3000 rows each) -> push.mjs (ONE commit to data/browser/ in
david7578433-bit/reallow, then the `browser-merge` workflow merges into data/groceries.json and republishes Pages)
-> live check of https://david7578433-bit.github.io/reallow/data/groceries.json.

Log: logs/run-<UTC>.log and logs/latest.log; summary logs/last-run.json (exit code 0 = the live site shows it).
A store that fails keeps its last good prices (with their older "checked" time). Nothing secret is written to the repo:
the browser and GitHub credentials stay with Tab's doors. stores.json holds the retailer/branch ids.

Added Nov 3 2026: Foodoo Kosher (Williamsburg, retailer 1527 / branch 2899), ~10,200 items, ~3 min.
Rosemary (My Cloud Grocer) and Chestnut (LocalExpress, platform "lx") are read by the GitHub robots every 4 hours, not here.

Added Nov 3 2026 (Monroe/KJ): Grand Food Market (grandfoodmarket.com, platform "algolia" = the store's own public product search, ~17,500 items with UPCs) is read by the GitHub robots every 4 hours, not here. Canopy Kosher (canopykosher.com) had an expired certificate and no working catalog; Island Supermarket (shopisland.com) is "opening soon". Both are in the site's store directory as call/visit.


## Without Tab (backup notes, Nov 4 2026)

This folder is a backup copy of the collector that runs on Tab twice a day. Only code is here: no keys, no logs, no collected data
(the data it produces lives in `../data/browser/` and `../data/groceries.json`).

What it needs to run anywhere else:
- Node 18+ and `npm i @browserbasehq/sdk playwright-core`
- A Browserbase account (a hosted real browser with residential IPs; the stores' bot check blocks plain robots).
  Copy `.env.example` to `.env` and fill `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`. (Any other real-browser setup works
  too if you change `openSession()` in `collect.mjs` to Playwright's own `chromium.launch()`.)
- Run `node collect.mjs` then `node export.mjs`. That leaves the price files in `export/`.
- Push: `push.mjs` writes to GitHub through Tab's connected account. Without Tab, do it by hand: copy `export/*.json` into this
  repo's `data/browser/`, commit and push, then in GitHub > Actions run the `browser-merge` workflow. It merges the prices into
  `data/groceries.json` and republishes the site.
