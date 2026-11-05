# RealLow online deals: daily refresh (for a Tab turn)

Site section: "🛍️ Online deals" tab on https://reallow.sites.tab.bot/#online and https://david7578433-bit.github.io/reallow/#online.
Data: `data/online-deals.json` in repo david7578433-bit/reallow (working copy here: `online-deals.json`). Each deal:
`id, title, store, price, was, was_label, pct_off, image, url, checked_at, cats, sold_by, product_title`.
Online deals also appear in the site's main search results ("online deal · price when checked …").

## Rules (David)
- Every price must be READ ON THE STORE'S OWN PRODUCT PAGE today (check.mjs does it in a real browser). No invented numbers.
- Find deals only on the stores' own pages: Amazon Today's Deals / Amazon search with the Today's Deals filter, Walmart Rollbacks, Target deals.
  NEVER copy from deal/price sites: Yazory, Williamsburg View, Monsey View, Kasho Of Simchos, Scanovator, Simcha Card, kj-grocery-prices,
  monsey-groceries, williamsburg-kosher-groceries, Save Crazy Deals, DealNews, Slickdeals, or any other aggregator.
- Items frum families in Monroe/KJ/Monsey buy: paper goods, diapers/wipes, cleaning, laundry, baby, kitchen, disposables, groceries.
  No holiday-themed junk, nothing immodest.
- Tznius: no images of women. Look at every new main image (contact sheet + attach_image). If a woman shows, leave `image` empty.
- Amazon links: `https://www.amazon.com/dp/<ASIN>?tag=reallow-20`. Walmart/Target: plain product link (affiliate approval pending).
- No WhatsApp/social links on the site except the existing share buttons. GoatCounter only. No secrets in the repo.
- No deals on Shabbos (no Friday-evening/Saturday runs). Don't message David from a worker.

## Daily steps (about 20-30 min)
Run everything from a Tab turn (TAB_TASK_ID set), with /usr/bin/node (Node 22).
1. Re-check prices and drop expired deals:
   `python3 /home/user/tab/files/reallow-online-deals/refresh.py recheck`
   Opens every current deal on its store page; updates price / crossed price / % off / checked_at; drops a deal when the page shows
   no buyable price (e.g. Amazon "See All Buying Options"), or it is under 15% off now.
2. Add new deals until there are 15-25:
   a. Amazon candidates: search pages with the Today's Deals filter, e.g.
      `https://www.amazon.com/s?k=pampers+diapers&rh=p_n_deal_type%3A23566065011` (plain HTTP works for search pages;
      parse `div[data-component-type="s-search-result"]`: price `span.a-price:not(.a-text-price) .a-offscreen`,
      crossed `span.a-price.a-text-price[data-a-strike="true"] .a-offscreen`; skip Sponsored). Queries used Nov 5: kleenex tissues,
      bounty, charmin, pampers, huggies, wipes, tide pods, dawn, cascade, finish, ziploc, glad/hefty trash bags, reynolds, clorox, lysol,
      swiffer, oxiclean, baby bottles, pacifier, food storage, cheerios, quaker, folgers, downy, gain, puffs, paper plates, desitin, johnson baby,
      colgate, crest, band-aid, tylenol, mr clean. Prefer "Sold/Ships by Amazon.com" and >=20% off.
   b. Walmart candidates: `node listing.mjs <list.json> <out.json> '{"browserSettings":{"os":"mobile"}}'` on
      `https://www.walmart.com/search?q=<item>&facet=special_offers%3ARollback` (card text "Rollback ... Price Now $X Was $Y";
      prefer "Sold and shipped by Walmart.com", skip "+ $shipping").
   c. Target: plain HTTP is blocked (PerimeterX); the Top Deals page is mostly gift-card promos. Use the browser (listing.mjs, store "Target")
      on target.com search pages and only list real price cuts ("reg $X").
   d. Write candidates `[{store, id, url, title, cats, image, image_ok:true}]` (title = short clean name; cats from:
      home, kitchen, kids, cleaning, health, food) and verify+add: `python3 refresh.py add candidates.json`
      (image only when `image_ok` is true, i.e. you looked at it). Amazon images: `..._AC_SL300_.jpg`; Walmart: `odnHeight=300&odnWidth=300`.
3. Regenerate the WhatsApp post: `python3 refresh.py post` -> /home/user/tab/files/reallow-daily-post.txt
   (header, 10 best deals one line each with *bold price* and ~crossed price~, store, link; ends with the site link). Read it before handing it over.
4. Push + republish: `python3 refresh.py push` (Git Data API blob -> tree -> commit -> PATCH ref on a freshly read main head; only
   data/online-deals.json, so the collector's data files are never touched). The push deploys GitHub Pages on its own (robots.yml on push).
   The tab.bot copy reads data from Pages first; `push` also republishes `publish-copy/` there. The publish step has said ENOENT
   while the site did update: check https://reallow.sites.tab.bot/data/online-deals.json before retrying.
5. Verify: both URLs' `#online` tab shows the deals (screenshot phone 390px + desktop if site code changed).

## Files
- check.mjs: opens product pages (Amazon/Walmart/Target) in a Browserbase browser, writes one JSON line per page (price, crossed price, label, seller, availability, image, screenshot).
- listing.mjs: reads a store's listing/deals page in the browser, every product link with its card text.
- refresh.py: recheck / add / post / push.
- Known: Amazon's first page in a fresh browser session can bounce to the home page (refresh.py opens amazon.com first).
  Plain HTTP product pages show no price (no delivery location) and start showing a captcha after ~30 requests; use the browser.
