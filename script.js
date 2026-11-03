/* RealLow v4 — static site. v4: local appliance + clothing stores (data/shops/), typo-tolerant search (search.js).
   RealLow v2 — static site. Prices come from the robots (GitHub Actions, every 4 hours).
   Data: deals.json + data/groceries.json (+ data/api-prices.json once store APIs have keys).
   Fallback copies ship as deals.js / groceries.js / stores.js so the page works offline. No trackers. */
(function () {
  "use strict";
  var GOATCOUNTER_CODE = ""; // set to the GoatCounter code to turn the counter on. Empty = no counter at all.
  var SITE_URL = "https://reallow.sites.tab.bot/";
  var PAGES = "https://david7578433-bit.github.io/reallow/";
  // Amazon Associates tag (e.g. "reallow-20"). Blank = plain Amazon links with no tag.
  var AMAZON_TAG = "reallow-20";
  function amazonUrl(q) { return "https://www.amazon.com/s?k=" + encodeURIComponent(String(q).slice(0, 120)).replace(/%20/g, "+") + (AMAZON_TAG ? "&tag=" + encodeURIComponent(AMAZON_TAG) : ""); }
  function tagAmazon(u) { if (!AMAZON_TAG || !/^https:\/\/(www\.)?amazon\.com\//.test(u) || /[?&]tag=/.test(u)) return u; return u + (u.indexOf("?") > -1 ? "&" : "?") + "tag=" + encodeURIComponent(AMAZON_TAG); }
  function amazonBtn(q, cls) { var a = ext(el("a", cls || "btn btn-amz", "See it on Amazon"), amazonUrl(q)); a.setAttribute("aria-label", "See " + q + " on Amazon"); return a; }
  var BASES = /github\.io$/.test(location.hostname) ? ["./"] : [PAGES, "./"];

  var DATA = window.REALLOW_DEALS || { deals: [], feed: [] };
  var GV1 = window.REALLOW_GROCERIES || { cities: [] }; // store directory (addresses, links) from v1 research
  var DIR = window.REALLOW_STORES || { groups: [] };
  var G = null; // robot grocery catalog
  var API = null; // store API offers

  var CATS = [["all", "All"], ["tech", "Tech"], ["home", "Home"], ["kitchen", "Kitchen"], ["kids", "Kids & Baby"], ["tools", "Tools"], ["cleaning", "Cleaning"], ["health", "Health"], ["travel", "Travel"], ["food", "Food"], ["gifts", "Gifts"]];
  var CITY_ORDER = ["Monroe / Kiryas Joel", "Monsey", "Williamsburg", "Boro Park", "Flatbush", "Crown Heights", "Lakewood", "Five Towns", "Passaic"];

  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function ext(a, href) { a.href = href; a.target = "_blank"; a.rel = "noopener"; return a; }
  var money = function (n) { return "$" + Number(n).toFixed(2); };
  var pct = function (d) { return d.was ? Math.round((1 - d.price / d.was) * 100) : 0; };
  function when(iso) {
    if (!iso) return "";
    var d = new Date(iso); if (isNaN(d)) return String(iso);
    var now = new Date(), t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (d.toDateString() === now.toDateString()) return t;
    var y = new Date(now - 864e5); if (d.toDateString() === y.toDateString()) return "yesterday " + t;
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + t;
  }
  function ago(iso) { var m = Math.round((Date.now() - new Date(iso)) / 60000); if (isNaN(m)) return ""; if (m < 60) return m + " min ago"; var h = Math.round(m / 60); return h < 48 ? h + " h ago" : Math.round(h / 24) + " days ago"; }
  function norm(s) { return String(s || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
  function tokens(q) { return norm(q).split(" ").filter(function (t) { return t.length > 0; }); }

  function getJSON(path, cb) {
    var i = 0, bust = "?v=" + Math.floor(Date.now() / 6e5);
    (function next() {
      if (i >= BASES.length || !window.fetch) return cb(null);
      var url = BASES[i++] + path + bust;
      fetch(url).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(cb, next);
    })();
  }

  /* ---------- store directory (search buttons) ---------- */
  function storeUrl(s, q) {
    return s.url.replace("{q}", encodeURIComponent(q).replace(/%20/g, "+"))
      .replace("{dash}", encodeURIComponent(q.trim().replace(/\s+/g, "-")))
      .replace("{path}", encodeURIComponent(q));
  }
  function storeGrid(stores, q) {
    var g = el("div", "stores" + (q ? "" : " off"));
    stores.forEach(function (s) {
      var a = el("a", "store" + (s.all ? " all" : ""), s.name);
      if (s.noq) ext(a, s.url); else if (q) ext(a, storeUrl(s, q)); else { a.href = "#"; a.setAttribute("aria-disabled", "true"); a.tabIndex = -1; }
      if (s.sub) a.appendChild(el("small", null, s.sub));
      g.appendChild(a);
    });
    return g;
  }
  function renderDirectory(container, q, compact) {
    container.innerHTML = "";
    var total = 0;
    DIR.groups.forEach(function (grp, gi) {
      total += grp.stores.length;
      var d = el("details", "dgroup"); if (gi === 0 || !compact) d.open = gi === 0 || !!q;
      var sm = el("summary", null, grp.icon + " " + grp.name); sm.appendChild(el("span", "n", String(grp.stores.length)));
      d.appendChild(sm); d.appendChild(storeGrid(grp.stores, q));
      container.appendChild(d);
    });
    return total;
  }

  /* ---------- search over everything ---------- */
  var qEl = $("q"), city = localStorage.getItem("rl-city") || "all";
  function matchFn(q) {
    var toks = tokens(q); if (!toks.length) return null;
    var res = toks.map(function (t) { return new RegExp("(^| )" + t.replace(/[^a-z0-9]/g, "")); });
    return function (name) { var n = " " + name; for (var i = 0; i < res.length; i++) if (!res[i].test(n.slice(1))) return false; return true; };
  }
  var GN = null; // normalized grocery names
  var sortMode = localStorage.getItem("rl-sort") || "match";
  function sortToggle(after) {
    var w = el("div", "sortbar"); w.appendChild(el("span", null, "Sort:"));
    [["match", "Best match"], ["cheap", "Cheapest"]].forEach(function (m) {
      var b = el("button", "chip", m[1]); b.type = "button"; b.setAttribute("aria-pressed", String(sortMode === m[0]));
      b.addEventListener("click", function () { sortMode = m[0]; localStorage.setItem("rl-sort", sortMode); after(); });
      w.appendChild(b);
    });
    return w;
  }
  function oldGroceryHits(q, onlyCity, limit) {
    if (!G) return null;
    var m = matchFn(q); if (!m) return [];
    if (!GN) GN = G.items.map(function (it) { return norm(it[0]); });
    var out = [];
    for (var i = 0; i < G.items.length; i++) {
      if (!m(GN[i])) continue;
      var it = G.items[i];
      var offers = it[2].filter(function (o) { var s = G.stores[o[0]]; return onlyCity === "all" || s.city === onlyCity; });
      if (!offers.length) continue;
      out.push({ name: it[0], unit: it[1], offers: offers, best: offers[0][1], barcode: it[3] || 0 });
    }
    var toks = tokens(q), phrase = new RegExp("(^| )" + toks.join(" ") + "( |$)");
    var whole = toks.map(function (t) { return new RegExp("(^| )" + t.replace(/[^a-z0-9]/g, "") + "( |$)"); });
    out.forEach(function (h) {
      var n = norm(h.name), w = whole.every(function (r) { return r.test(n); });
      h.score = (phrase.test(n) ? 4 : 0) + (w ? 2 : 0) + Math.min(h.offers.length, 6) * 0.6 - n.split(" ").length * 0.15;
    });
    if (sortMode === "cheap") out.sort(function (a, b) { return (b.score >= 4) - (a.score >= 4) || a.best - b.best; });
    else out.sort(function (a, b) { return b.score - a.score || a.best - b.best; });
    return out.slice(0, limit || 30).concat(out.length > (limit || 30) ? [{ more: out.length - (limit || 30) }] : []);
  }
  function groceryRow(h) {
    var li = el("li", "gitem");
    var top = el("div", "gi-top");
    top.appendChild(el("span", "gi-name", h.name));
    top.appendChild(el("span", "gi-best", money(h.best) + (h.unit ? "/" + h.unit : "")));
    var k = itemKey(h.name, h.barcode); top.appendChild(starBtn(k, { kind: "g", n: h.name, p: h.best, q: h.name }));
    li.appendChild(top);
    var ul = el("ul", "gi-offers");
    h.offers.slice(0, 6).forEach(function (o, i) {
      var s = G.stores[o[0]];
      var row = el("li", i === 0 && h.offers.length > 1 ? "cheapest" : null);
      var a = ext(el("a", null, s.name), s.product ? s.product.replace("{id}", o[3]) : s.base + "/product/" + o[3]);
      row.appendChild(a);
      row.appendChild(el("span", "gi-city", " · " + s.city.replace(" / Kiryas Joel", "/KJ")));
      if (o[4]) { var nm = el("span", "gi-city", " · name match"); nm.title = "Matched by name and size (this store lists no barcode): " + (o[5] || ""); row.appendChild(nm); }
      var p = el("span", "gi-p", money(o[1]) + (h.unit ? "/" + h.unit : "")); row.appendChild(p);
      if (o[2]) row.appendChild(el("s", "gi-was", money(o[2])));
      ul.appendChild(row);
    });
    if (h.offers.length > 6) ul.appendChild(el("li", "gi-moreoffers", "+" + (h.offers.length - 6) + " more stores"));
    li.appendChild(ul);
    var st = G.stores[h.offers[0][0]];
    li.appendChild(el("p", "gi-checked", "checked " + when(st.checked)));
    return li;
  }
  function oldDealHits(q) {
    var m = matchFn(q); if (!m) return [];
    var all = (DATA.deals || []).map(function (d) { return { d: d, v: true }; }).concat((DATA.feed || []).map(function (d) { return { d: d }; }))
      .concat(API && API.offers ? API.offers.map(function (d) { return { d: d, api: true }; }) : []);
    return all.filter(function (x) { return m(norm(x.d.title + " " + (x.d.store || ""))); }).sort(function (a, b) { return a.d.price - b.d.price; });
  }
  /* ---------- v4 search: one typo-tolerant index (search.js) over groceries + local stores; small ones for deals and store names ---------- */
  var IX = window.RLSearch ? new RLSearch.Index() : null, gIx = false, gIxStarted = false;
  var ACC = /\b(liners?|filters?|parts?|shel(f|ves)|bins?|covers?|mats?|organizers?|kits?|knobs?|handles?|brackets?|laces?|protectors?|cleaners?|magnets?|bulbs?|gaskets?|hoses?|trays?|deodorizers?|thermometers?|locks?|fender|screws?|bolts?|nuts?|inserts?|insoles?|polish|brush(es)?|sprays?|stickers?|decals?|pads?|cords?|plugs?|adapters?|balloons?|napkins?|foil|pans?|chips|coins|soap|detergent|pods|tablets|accessor(y|ies)|replacement|refills?|caps?|toys?|dolls?|books?|puzzles?|shaped|magnets?|hangers?|keychains?|stencils?|cookie cutters?|molds?|liner|latch(es)?|fresheners?|holders?|bags?|box(es)?|horns?|dividers?|openers?|tapes?|flat washers?|lock washers?|fender washers?|wipes|stain|whiteners?|tabs|installation|install|service|warranty|haul away|pedestals?|stacking|fenders?|hillman|finish washers)\b/;
  function accessory(title, words) {
    var m = norm(title).match(ACC); if (!m) return false;
    var w = RLSearch.stem(m[0].split(" ")[0]); return words.indexOf(w) < 0 && words.indexOf(m[0]) < 0;
  }
  function relevance(h, title, nOffers, words) {
    var n = norm(title), first = RLSearch.stem(n.split(" ")[0] || "");
    return h.score - n.split(" ").length * 0.06 + Math.min(nOffers || 1, 6) * 0.25 + (words.indexOf(first) > -1 ? 0.3 : 0) - (h.acc ? 2.5 : 0);
  }
  // exact words > starts-with > typo matches; parts and accessories after the real thing; then cheapest first
  // (groceries in "Best match" also weigh how many stores carry the item, like before)
  function sortHits(out, grocery) {
    if (grocery && sortMode !== "cheap") out.sort(function (a, b) { return b.rank - a.rank || b.rel - a.rel || a.best - b.best; });
    else if (sortMode === "cheap") out.sort(function (a, b) { return b.rank - a.rank || (a.acc ? 1 : 0) - (b.acc ? 1 : 0) || a.best - b.best; });
    else out.sort(function (a, b) { return b.rank - a.rank || (a.acc ? 1 : 0) - (b.acc ? 1 : 0) || Math.floor(b.score * 2 + 0.01) - Math.floor(a.score * 2 + 0.01) || a.best - b.best; });
  }
  function ixGroceries() {
    if (!IX || !G || gIxStarted) return; gIxStarted = true;
    var i = 0, items = G.items;
    (function chunk() {
      var end = Math.min(items.length, i + 6000);
      for (; i < end; i++) IX.add(items[i][0], "", { k: "g", i: i });
      if (i < items.length) setTimeout(chunk, 0); else { gIx = true; if (qEl.value.trim()) renderResults(); if ($("gq").value.trim()) renderGroResults(); }
    })();
  }
  function groceryHits(q, onlyCity, limit) {
    if (!G) return null;
    ixGroceries();
    if (!gIx) return oldGroceryHits(q, onlyCity, limit); // the index is still being built (first second or two)
    var r = IX.search(q, function (ref) { return ref.k === "g"; }), out = [];
    r.hits.forEach(function (h) {
      var it = G.items[h.ref.i];
      var offers = it[2].filter(function (o) { var s = G.stores[o[0]]; return onlyCity === "all" || s.city === onlyCity; });
      if (!offers.length) return;
      var x = { name: it[0], unit: it[1], offers: offers, best: offers[0][1], barcode: it[3] || 0, rank: h.rank, acc: accessory(it[0], r.words), score: h.score };
      x.rel = relevance(x, it[0], offers.length, r.words); out.push(x);
    });
    sortHits(out, true);
    limit = limit || 30;
    return out.slice(0, limit).concat(out.length > limit ? [{ more: out.length - limit }] : []);
  }
  var dIx = null, dIxFor = null;
  function dealHits(q) {
    if (!IX) return oldDealHits(q);
    var key = (DATA.deals || []).length + ":" + (DATA.feed || []).length + ":" + (DATA.updated || "") + ":" + (API && API.offers ? API.offers.length : 0);
    if (dIxFor !== key) {
      dIx = new RLSearch.Index(); dIxFor = key;
      (DATA.deals || []).forEach(function (d) { dIx.add(d.title, d.store || "", { d: d, v: true }); });
      (DATA.feed || []).forEach(function (d) { dIx.add(d.title, d.store || "", { d: d }); });
      if (API && API.offers) API.offers.forEach(function (d) { dIx.add(d.title, d.store || "", { d: d, api: true }); });
    }
    var r = dIx.search(q, null, true), out = r.hits.map(function (h) { var x = h.ref; x.rank = h.rank; x.best = x.d.price; x.acc = accessory(x.d.title, r.words); x.score = h.score; x.rel = relevance(x, x.d.title, 1, r.words); return x; });
    sortHits(out);
    return out;
  }
  function dealRow(x) {
    var d = x.d, li = el("li", "frow");
    var row = el("div", "f-top");
    var a = ext(el("a", "f-title", d.title), tagAmazon(d.url));
    row.appendChild(a); if (d.id) row.appendChild(starBtn("d" + d.id, { kind: "d", n: d.title, p: d.price })); li.appendChild(row);
    var meta = el("div", "f-meta");
    meta.appendChild(el("b", "f-price", money(d.price)));
    if (d.was && d.was > d.price) meta.appendChild(el("s", "f-was", money(d.was)));
    meta.appendChild(el("span", "f-store", d.store || ""));
    meta.appendChild(el("span", "f-when", x.v ? "store-checked " + (d.checked || "") : (x.api ? "store price, checked " : "via " + d.src + ", checked ") + (x.v ? "" : when(d.checked))));
    li.appendChild(meta);
    return li;
  }
  var allStores = function () { var a = []; DIR.groups.forEach(function (g) { a = a.concat(g.stores); }); return a; };

  function renderResults() {
    var q = qEl.value.trim();
    $("results").hidden = !q; $("home-blocks").hidden = !!q;
    if (!q) return;
    loadShops();
    $("res-h").textContent = "Prices for \u201C" + q + "\u201D";
    var ab = $("res-amz"); ab.innerHTML = ""; ab.appendChild(amazonBtn(q, "btn btn-amz wide"));
    var gh = groceryHits(q, city, rcat === "groceries" ? 40 : 12);
    var ah = shopHits(q, "appliances"), ch = shopHits(q, "clothing"), dh = dealHits(q), sh = storeHits(q);
    var gcount = gh ? gh.filter(function (h) { return !h.more; }).length + (gh.length && gh[gh.length - 1].more ? gh[gh.length - 1].more : 0) : null;
    renderCats({ groceries: gcount, appliances: ah ? ah.length : null, clothing: ch ? ch.length : null, deals: dh.length, stores: sh.length });
    var box = $("res-groceries"); box.innerHTML = ""; $("res-deals").innerHTML = ""; var sx = $("res-shops"); if (sx) sx.innerHTML = "";
    var cards = [];
    function topRank(list) { return list && list.length ? Math.max.apply(null, list.slice(0, 30).map(function (h) { return h.rank || 0; })) : -1; }
    // groceries
    if (rcat === "all" || rcat === "groceries") {
      var c;
      if (gh === null) { c = el("div", "card"); c.appendChild(el("p", "hint", "Loading grocery prices\u2026")); cards.push([c, 0, 0]); }
      else if (gh.length) {
        c = el("div", "card"); c.appendChild(el("h3", "res-sub", "\uD83D\uDED2 Kosher grocery prices" + (city === "all" ? "" : " in " + city)));
        c.appendChild(sortToggle(renderResults));
        var ol = el("ol", "glist"); gh.forEach(function (h) { if (h.more) { var mo = el("li", "gi-more"); var b = el("a", null, h.more + " more grocery matches \u2192"); b.href = "#groceries"; b.addEventListener("click", function () { $("gq").value = q; }); mo.appendChild(b); ol.appendChild(mo); } else ol.appendChild(groceryRow(h)); });
        c.appendChild(ol); cards.push([c, topRank(gh), gcount]);
      } else if (rcat === "groceries") { c = el("div", "card"); c.appendChild(el("p", "hint", "No grocery price for \u201C" + q + "\u201D" + (city === "all" ? "" : " in " + city) + " yet.")); cards.push([c, 0, 0]); }
    }
    if (rcat === "all" || rcat === "appliances") { if (rcat === "appliances" || ah === null || ah.length) cards.push([shopCard("appliances", q, ah, "\uD83D\uDD0C Local appliance stores"), topRank(ah), ah ? ah.length : 0]); }
    if (rcat === "all" || rcat === "clothing") { if (rcat === "clothing" || (ch && ch.length)) cards.push([shopCard("clothing", q, ch, "\uD83D\uDC54 Local clothing & shoe stores"), topRank(ch), ch ? ch.length : 0]); }
    if ((rcat === "all" || rcat === "deals") && (dh.length || rcat === "deals")) {
      var c2 = el("div", "card"); c2.appendChild(el("h3", "res-sub", "\uD83D\uDD25 Deals & store prices, cheapest first"));
      if (dh.length) { var ol2 = el("ol", "feed"); dh.slice(0, 25).forEach(function (x) { ol2.appendChild(dealRow(x)); }); c2.appendChild(ol2); }
      else c2.appendChild(el("p", "hint", "No deal for \u201C" + q + "\u201D right now."));
      cards.push([c2, topRank(dh), dh.length]);
    }
    if ((rcat === "all" || rcat === "stores") && sh.length) cards.push([storeHitCard(q, sh), rcat === "stores" || sh.some(function (x) { return x.byName; }) ? 9 : -0.5, sh.length]);
    // best answer first: the card whose top results match the words best, then the one with more results
    if (rcat === "all") cards.sort(function (a, b) { return b[1] - a[1] || b[2] - a[2]; });
    cards.forEach(function (x) { box.appendChild(x[0]); });
    var none = gh !== null && !gh.length && !(ah && ah.length) && !(ch && ch.length) && !dh.length;
    $("res-stores-h").textContent = none ? "No price for \u201C" + q + "\u201D yet \u2014 tap a store to see it there" : "Search \u201C" + q + "\u201D on any store";
    var sbox = $("res-stores"); sbox.innerHTML = "";
    var top = allStores().filter(function (s) { return s.top; });
    sbox.appendChild(storeGrid(top, q));
    if (none && SH) { var lw = el("details", "dgroup inres"); lw.open = true; lw.appendChild(el("summary", null, "Local appliance & clothing stores" + (city === "all" ? "" : " in " + city))); lw.appendChild(localStoreButtons("appliances", q)); lw.appendChild(localStoreButtons("clothing", q)); sbox.appendChild(lw); }
    var more = el("details", "dgroup inres"); more.appendChild(el("summary", null, "All " + allStores().length + " online stores"));
    var inner = el("div"); renderDirectory(inner, q, true); more.appendChild(inner); sbox.appendChild(more);
  }
  var deb;
  qEl.addEventListener("input", function () { clearTimeout(deb); deb = setTimeout(renderResults, 140); });
  $("search-form").addEventListener("submit", function (e) { e.preventDefault(); qEl.blur(); renderResults(); noteSearch(qEl.value); });
  function renderCitySelect() {
    var s = $("res-city"); s.innerHTML = "";
    [["all", "All areas"]].concat(CITY_ORDER.map(function (c) { return [c, c]; })).forEach(function (c) { var o = el("option", null, c[1]); o.value = c[0]; if (c[0] === city) o.selected = true; s.appendChild(o); });
  }
  $("res-city").addEventListener("change", function () { city = this.value; localStorage.setItem("rl-city", city); renderResults(); });

  /* ---------- deals ---------- */
  var deals = [], feedShown = 20, current = "all";
  function waText(d) {
    var lines = [(d.hot ? "\uD83D\uDD25 " : "") + d.title, money(d.price) + (d.was ? " (was " + money(d.was) + ", " + pct(d) + "% off)" : "") + " at " + d.store];
    if (d.note) lines.push(d.note);
    lines.push(d.url, "", "Checked " + (d.verified_at ? d.checked : when(d.checked)) + ". Prices change fast.", "More real deals: " + SITE_URL);
    return lines.join("\n");
  }
  function waLink(text) { return "https://wa.me/?text=" + encodeURIComponent(text); }
  function card(d) {
    var li = el("li", "deal" + (d.hot ? " hot" : ""));
    var th = el("div", "thumb");
    if (d.image) {
      var img = document.createElement("img"); img.src = d.image; img.alt = ""; img.loading = "lazy"; img.decoding = "async"; img.width = 110; img.height = 110;
      img.onerror = function () { th.innerHTML = '<span class="noimg" aria-hidden="true">\uD83C\uDFF7\uFE0F</span>'; };
      th.appendChild(img);
    } else th.innerHTML = '<span class="noimg" aria-hidden="true">\uD83C\uDFF7\uFE0F</span>';
    var body = el("div", "d-body");
    var badges = el("div", "badges");
    if (d.hot) badges.appendChild(el("span", "b b-hot", "\uD83D\uDD25 HOT"));
    if (d.was) badges.appendChild(el("span", "b b-off", pct(d) + "% OFF"));
    badges.appendChild(el("span", "b b-store", d.store));
    var sb = starBtn("d" + d.id, { kind: "d", n: d.title, p: d.price }); sb.classList.add("star-card"); li.appendChild(sb);
    body.appendChild(badges); body.appendChild(el("h3", "d-title", d.title));
    var pr = el("div", "prices"); pr.appendChild(el("span", "now", money(d.price)));
    if (d.was) { pr.appendChild(el("span", "was", money(d.was))); pr.appendChild(el("span", "save", "save " + money(d.was - d.price))); }
    body.appendChild(pr);
    body.appendChild(el("p", "note", (d.note ? d.note + " \u00B7 " : "") + "Checked on the store page " + d.checked));
    var act = el("div", "d-actions");
    var go = ext(el("a", "btn btn-deal", "Go to deal \u2192"), tagAmazon(d.url));
    var wa = ext(el("a", "btn btn-wa", "Share"), waLink(waText(d))); wa.setAttribute("aria-label", "Share on WhatsApp: " + d.title);
    act.appendChild(go); act.appendChild(wa);
    act.appendChild(amazonBtn(d.title, "btn btn-amz sm"));
    li.appendChild(th); li.appendChild(body); li.appendChild(act);
    return li;
  }
  function inCat(d) { return current === "all" || (d.cats || []).indexOf(current) > -1; }
  function renderDeals() {
    var list = $("deals"); list.innerHTML = "";
    var shown = deals.filter(inCat); shown.forEach(function (d) { list.appendChild(card(d)); });
    var feed = (DATA.feed || []).filter(inCat);
    $("empty").hidden = shown.length + feed.length > 0;
    $("feed-wrap").hidden = !feed.length;
    var fl = $("feed"); fl.innerHTML = "";
    feed.slice(0, feedShown).forEach(function (d) {
      var li = dealRow({ d: d });
      var wa = ext(el("a", "f-share", "Share"), waLink(waText(d))); wa.setAttribute("aria-label", "Share on WhatsApp: " + d.title);
      li.querySelector(".f-meta").appendChild(ext(el("a", "f-amz", "See it on Amazon"), amazonUrl(d.title)));
      li.querySelector(".f-meta").appendChild(wa);
      fl.appendChild(li);
    });
    $("feed-more").hidden = feed.length <= feedShown;
    $("feed-line").textContent = feed.length + " deals \u00B7 robot checked " + when(DATA.updated);
  }
  $("feed-more").addEventListener("click", function () { feedShown += 40; renderDeals(); });
  function renderChips() {
    var el0 = $("chips"); el0.innerHTML = "";
    var everything = deals.concat(DATA.feed || []);
    CATS.forEach(function (c) {
      var n = c[0] === "all" ? everything.length : everything.filter(function (d) { return (d.cats || []).indexOf(c[0]) > -1; }).length;
      if (!n) return;
      var b = el("button", "chip"); b.type = "button"; b.setAttribute("aria-pressed", String(c[0] === current));
      b.appendChild(el("span", null, c[1])); b.appendChild(el("span", "n", String(n)));
      b.addEventListener("click", function () { current = c[0]; feedShown = 20; renderChips(); renderDeals(); });
      el0.appendChild(b);
    });
  }
  var potdText = "";
  function renderPotd() {
    var pick = deals.filter(function (d) { return d.id === DATA.post_of_the_day; })[0] || deals[0];
    if (!pick) { $("potd").hidden = true; return; }
    potdText = waText(pick);
    $("potd-text").textContent = potdText; $("potd-wa").href = waLink(potdText); $("potd").hidden = false;
  }
  $("potd-copy").addEventListener("click", function () {
    var done = function () { toast("Copied. Paste it in your group \uD83D\uDC4D"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(potdText).then(done, function () { fallbackCopy(potdText); done(); });
    else { fallbackCopy(potdText); done(); }
  });
  function fallbackCopy(t) { var ta = document.createElement("textarea"); ta.value = t; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} document.body.removeChild(ta); }
  var tt; function toast(msg) { var t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(function () { t.classList.remove("show"); }, 2200); }
  function applyDeals(d) {
    if (d) DATA = d;
    deals = (DATA.deals || []).slice().sort(function (a, b) { return (b.hot ? 1 : 0) - (a.hot ? 1 : 0) || pct(b) - pct(a); });
    $("checked-line").textContent = deals.length ? deals.length + " checked on the store page" : "";
    renderChips(); renderDeals(); renderPotd(); robotLine();
  }

  /* ---------- groceries tab ---------- */
  var gcity = localStorage.getItem("rl-gcity") || CITY_ORDER[0];
  function cityStoresV1(c) { var x = (GV1.cities || []).filter(function (k) { return k.city === c || (c === "Flatbush" && /Flatbush/.test(k.city)); })[0]; return x ? x.stores : []; }
  function robotStoresIn(c) { return G ? G.stores.filter(function (s) { return s.city === c; }) : []; }
  function renderGroceries() {
    var chips = $("city-chips"); chips.innerHTML = "";
    CITY_ORDER.forEach(function (c) {
      var n = cityStoresV1(c).length || robotStoresIn(c).length;
      var b = el("button", "chip"); b.type = "button"; b.setAttribute("aria-pressed", String(c === gcity));
      b.appendChild(el("span", null, c)); if (n) b.appendChild(el("span", "n", String(n)));
      b.addEventListener("click", function () { gcity = c; localStorage.setItem("rl-gcity", c); renderGroceries(); });
      chips.appendChild(b);
    });
    var rs = robotStoresIn(gcity);
    $("gro-checked").textContent = G ? G.stats.items.toLocaleString() + " items \u00B7 robot checked " + when(G.updated) : "Loading prices\u2026";
    renderGroResults();
    var list = $("gro-list"); list.innerHTML = "";
    var v1 = cityStoresV1(gcity), seen = {};
    function robotFor(name) { return rs.filter(function (s) { return norm(s.name).split(" ")[0] === norm(name).split(" ")[0]; })[0]; }
    v1.forEach(function (s) {
      var li = el("li", "gstore"); li.appendChild(el("h3", null, s.name));
      var meta = el("p", "gmeta", [s.area, s.address].filter(Boolean).join(" \u00B7 "));
      if (s.phone) { meta.appendChild(document.createTextNode(meta.textContent ? " \u00B7 " : "")); var t = el("a", null, s.phone); t.href = "tel:" + s.phone.replace(/[^\d+]/g, ""); meta.appendChild(t); }
      li.appendChild(meta);
      var r = robotFor(s.name); if (r) seen[r.id] = 1;
      var badge = el("p", "gbadge" + (r && r.status === "ok" ? " ok" : ""));
      if (r && r.status === "ok") badge.textContent = "\uD83E\uDD16 " + (r.count || 0).toLocaleString() + " prices \u00B7 checked " + when(r.checked) + (r.stale ? " (last good run)" : "");
      else if (r) badge.textContent = "\uD83D\uDEAB Blocks price robots \u2014 search on store";
      else badge.textContent = "No online prices \u2014 call or visit";
      li.appendChild(badge);
      var links = el("div", "glinks");
      if (s.website) links.appendChild(ext(el("a", "btn btn-light", "Website"), s.website));
      if (s.order_online && s.order_online !== s.website) links.appendChild(ext(el("a", "btn btn-deal", "Order online"), s.order_online));
      if (s.specials_url && s.specials_url !== s.website) links.appendChild(ext(el("a", "btn btn-wa", "Weekly specials"), s.specials_url));
      li.appendChild(links);
      list.appendChild(li);
    });
    rs.forEach(function (s) {
      if (seen[s.id]) return;
      var li = el("li", "gstore"); li.appendChild(el("h3", null, s.name));
      li.appendChild(el("p", "gbadge" + (s.status === "ok" ? " ok" : ""), s.status === "ok" ? "\uD83E\uDD16 " + s.count.toLocaleString() + " prices \u00B7 checked " + when(s.checked) : "\uD83D\uDEAB Blocks price robots \u2014 search on store"));
      var links = el("div", "glinks"); links.appendChild(ext(el("a", "btn btn-light", "Website"), s.base)); li.appendChild(links);
      list.appendChild(li);
    });
    var on = GV1.online || [];
    $("gro-online-wrap").hidden = !on.length;
    var ol = $("gro-online"); ol.innerHTML = "";
    on.forEach(function (o) { var li = el("li"); li.appendChild(ext(el("a", null, o.name), o.url)); if (o.serves) li.appendChild(el("span", null, o.serves)); ol.appendChild(li); });
  }
  function renderGroResults() {
    var box = $("gro-results"); box.innerHTML = ""; var q = $("gq").value.trim();
    if (!q) return;
    var hits = groceryHits(q, gcity, 40);
    if (hits === null) { box.appendChild(el("p", "hint", "Loading grocery prices\u2026")); return; }
    if (hits.length) { box.appendChild(sortToggle(renderGroResults)); var ol = el("ol", "glist"); hits.forEach(function (h) { if (h.more) ol.appendChild(el("li", "gi-more", "+" + h.more + " more matches \u2014 add a word to narrow it")); else ol.appendChild(groceryRow(h)); }); box.appendChild(ol); }
    else box.appendChild(el("p", "hint", "No robot price for \u201C" + q + "\u201D in " + gcity + " yet."));
    var blocked = robotStoresIn(gcity).filter(function (s) { return s.status !== "ok"; });
    var withSearch = robotStoresIn(gcity).filter(function (s) { return s.search; });
    if (withSearch.length || blocked.length) {
      box.appendChild(el("p", "hint", "Check it on the store:"));
      box.appendChild(storeGrid(withSearch.map(function (s) { return { name: s.name, url: s.search }; }).concat(blocked.map(function (s) { return { name: s.name, url: s.base, sub: "search on store" }; })), q));
    }
  }
  var gdeb;
  $("gq").addEventListener("input", function () { clearTimeout(gdeb); gdeb = setTimeout(renderGroResults, 140); });
  $("gro-search-form").addEventListener("submit", function (e) { e.preventDefault(); $("gq").blur(); renderGroResults(); noteSearch($("gq").value); });

  /* ---------- stores tab ---------- */
  function renderDir() { loadShops(); renderLocalShops(); var n = renderDirectory($("dir"), $("dq").value.trim(), false); $("dir-count").textContent = n + " online stores"; }
  $("dq").addEventListener("input", renderDir);
  $("dir-form").addEventListener("submit", function (e) { e.preventDefault(); $("dq").blur(); });

  /* ---------- robot status ---------- */
  function robotLine() {
    var parts = [];
    if (G) parts.push(G.stats.items.toLocaleString() + " grocery prices");
    var nf = (DATA.feed || []).length + (DATA.deals || []).length; if (nf) parts.push(nf + " deals");
    var t = G ? G.updated : DATA.updated;
    $("robot-line").textContent = parts.length ? "\uD83E\uDD16 " + parts.join(" \u00B7 ") + (t ? " \u00B7 checked " + when(t) : "") : "";
  }
  function renderStatus(s) {
    var box = $("robots-status"); box.innerHTML = "";
    if (!s) { box.textContent = "Robot status not available right now."; return; }
    var ul = el("ul");
    if (s.groceries) {
      ul.appendChild(el("li", null, "Grocery robot: " + s.groceries.items.toLocaleString() + " items from " + s.groceries.stores_ok + " stores, checked " + when(s.groceries.updated) + "."));
      s.groceries.stores.forEach(function (x) { ul.appendChild(el("li", "sub", x.name + " (" + x.city + "): " + (x.status === "ok" ? x.count.toLocaleString() + " prices" + (x.stale ? ", from the last good run" : "") : "blocks robots, search on store"))); });
    }
    if (s.deals) ul.appendChild(el("li", null, "Deals robot: " + s.deals.feed + " feed deals + " + s.deals.verified + " store-checked, " + when(s.deals.updated) + "."));
    if (s.store_apis) ul.appendChild(el("li", null, "Store APIs: " + s.store_apis.map(function (a) { return a.name + " (" + a.state + ")"; }).join(", ") + "."));
    ul.appendChild(el("li", null, "Schedule: every 4 hours. Last run " + when(s.run_at) + " (" + ago(s.run_at) + ")."));
    box.appendChild(ul);
  }


  /* ---------- For you: remembered on this phone only (localStorage). Nothing leaves the device. ---------- */
  var ME_KEY = "rl-me";
  function me() { try { var m = JSON.parse(localStorage.getItem(ME_KEY) || "null"); if (m && m.s && m.q) return m; } catch (e) {} return { s: {}, q: {}, seen: 0 }; }
  function saveMe(m) { try { localStorage.setItem(ME_KEY, JSON.stringify(m)); } catch (e) {} }
  function noteSearch(q) {
    q = norm(q); if (q.length < 3) return;
    var m = me(), r = m.q[q] || { n: 0, t: [] };
    var last = r.t[r.t.length - 1] || 0;
    if (Date.now() - last < 30 * 60000) return; // one look-up per half hour counts once
    r.n++; r.t.push(Date.now()); r.t = r.t.slice(-8); m.q[q] = r;
    var keys = Object.keys(m.q); if (keys.length > 60) { keys.sort(function (a, b) { return m.q[a].t[m.q[a].t.length - 1] - m.q[b].t[m.q[b].t.length - 1]; }); delete m.q[keys[0]]; }
    saveMe(m);
  }
  function itemKey(name, barcode) { return barcode ? "b" + barcode : "n" + norm(name); }
  function isStarred(k) { return !!me().s[k]; }
  function toggleStar(k, info, btn) {
    var m = me();
    if (m.s[k]) { delete m.s[k]; toast("Removed from My list"); }
    else { m.s[k] = info; info.t = Date.now(); toast("\u2B50 Saved to My list"); }
    saveMe(m); if (btn) setStar(btn, !!m.s[k]); renderForYou();
  }
  function setStar(btn, on) { btn.textContent = on ? "\u2605" : "\u2606"; btn.setAttribute("aria-pressed", String(on)); btn.setAttribute("aria-label", on ? "Remove from My list" : "Save to My list"); }
  function starBtn(k, info) {
    var b = el("button", "star"); b.type = "button"; setStar(b, isStarred(k));
    b.addEventListener("click", function (e) { e.preventDefault(); toggleStar(k, info, b); });
    return b;
  }
  function currentGrocery(k) {
    if (!G) return null;
    for (var i = 0; i < G.items.length; i++) { var it = G.items[i]; if (itemKey(it[0], it[3]) === k) return it; }
    return null;
  }
  function renderForYou() {
    var box = $("foryou"); if (!box) return;
    var m = me(), keys = Object.keys(m.s), qs = Object.keys(m.q);
    box.hidden = !keys.length && !qs.length;
    if (box.hidden) return;
    var list = $("foryou-list"); list.innerHTML = "";
    keys.sort(function (a, b) { return m.s[b].t - m.s[a].t; }).slice(0, 12).forEach(function (k) {
      var info = m.s[k], li = el("li", "fy-item");
      var now = null, where = "";
      if (info.kind === "g") {
        var it = currentGrocery(k);
        if (it) { var offers = it[2].filter(function (o) { return city === "all" || G.stores[o[0]].city === city; }); if (!offers.length) offers = it[2]; now = offers[0][1]; where = G.stores[offers[0][0]].name; }
      } else if (info.kind === "s") {
        var si = shopItemByKey(k, info); if (si) { now = si.price; where = si.store.name; } else loadShops();
      } else {
        var d = (DATA.deals || []).concat(DATA.feed || []).filter(function (x) { return "d" + x.id === k; })[0];
        if (d) { now = d.price; where = d.store; }
      }
      var a = el("a", "fy-name", info.n); a.href = "#"; a.addEventListener("click", function (e) { e.preventDefault(); location.hash = "#deals"; qEl.value = info.q || info.n; renderResults(); qEl.scrollIntoView({ block: "start" }); });
      li.appendChild(a);
      var p = el("span", "fy-p");
      if (now == null) p.textContent = (info.kind === "s" ? shDone >= shTotal && SH : G || info.kind !== "g") ? "not in today's prices" : "\u2026";
      else {
        p.textContent = money(now) + " at " + where;
        if (info.p && now < info.p - 0.009) p.appendChild(el("b", "fy-drop", " \u25BC " + money(info.p - now) + " since you saved it"));
      }
      li.appendChild(p);
      li.appendChild(starBtn(k, info));
      list.appendChild(li);
    });
    $("foryou-saved").hidden = !keys.length;
    // usual look-ups + "running low?" nudges
    var usual = $("foryou-usual"); usual.innerHTML = "";
    var nudges = $("foryou-nudge"); nudges.innerHTML = "";
    qs.filter(function (q) { return m.q[q].n >= 2; }).sort(function (a, b) { return m.q[b].n - m.q[a].n; }).slice(0, 8).forEach(function (q) {
      var r = m.q[q], b = el("button", "chip", q); b.type = "button";
      b.addEventListener("click", function () { qEl.value = q; renderResults(); qEl.scrollIntoView({ block: "start" }); });
      usual.appendChild(b);
      if (r.n >= 3 && r.t.length >= 3) {
        var gaps = []; for (var i = 1; i < r.t.length; i++) gaps.push(r.t[i] - r.t[i - 1]);
        var avg = gaps.reduce(function (s, g) { return s + g; }, 0) / gaps.length, since = Date.now() - r.t[r.t.length - 1];
        if (avg > 864e5 && since > avg * 0.9) nudges.appendChild(el("li", null, "You usually look up \u201C" + q + "\u201D every " + Math.round(avg / 864e5) + " days. Running low?"));
      }
    });
    $("foryou-usual-wrap").hidden = !usual.children.length;
  }
  $("foryou-reset").addEventListener("click", function (e) { e.preventDefault(); localStorage.removeItem(ME_KEY); renderForYou(); toast("Your saved items and history are cleared"); });
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("#results a, #gro-results a");
    if (a) { var q = (a.closest("#gro-results") ? $("gq") : qEl).value; if (q) noteSearch(q); }
  });

  /* ---------- v4: local appliance + clothing stores (collectors/shops.mjs, daily) ---------- */
  var SH = null, shLoading = false, shDone = 0, shTotal = 0, shRows = 0, shopById = {};
  var rcat = localStorage.getItem("rl-rcat") || "all";
  var RCATS = [["all", "All"], ["groceries", "\uD83D\uDED2 Groceries"], ["appliances", "\uD83D\uDD0C Appliances"], ["clothing", "\uD83D\uDC54 Clothing"], ["deals", "\uD83D\uDD25 Deals"], ["stores", "\uD83C\uDFEC Stores"]];
  function shortCity(c) { return String(c).replace(" / Kiryas Joel", "/KJ"); }
  function inCity(st) { return city === "all" || (st.cities || []).indexOf(city) > -1; }
  function loadShops() {
    if (shLoading) return; shLoading = true;
    getJSON("data/shops/index.json", function (ix) {
      SH = ix || { stores: [] };
      SH.stores.forEach(function (s) { shopById[s.id] = s; });
      renderLocalShops();
      var live = SH.stores.filter(function (s) { return s.live; }); shTotal = live.length;
      var queue = live.slice(), running = 0, pend = [];
      function pump() {
        while (running < 6 && queue.length) {
          (function (s) {
            running++;
            getJSON("data/shops/" + s.id + ".json", function (f) { running--; if (f && f.rows) pend.push([s, f]); else shDone++; work(); pump(); });
          })(queue.shift());
        }
      }
      var busy = false;
      function work() {
        if (busy || !pend.length) return; busy = true;
        var job = pend[0], s = job[0], f = job[1]; f.pos = f.pos || 0;
        if (!s.file) { s.file = f; }
        var end = Math.min(f.rows.length, f.pos + 4000);
        for (var i = f.pos; i < end; i++) { var r = f.rows[i]; IX.add(r[0], r[5] + " " + s.sub + " " + s.name, { k: "s", s: s, r: r }); }
        f.pos = end;
        if (f.pos >= f.rows.length) { pend.shift(); shDone++; refreshSoon(); }
        busy = false;
        if (pend.length) setTimeout(work, 0);
      }
      pump();
    });
  }
  var rtm; function refreshSoon() { clearTimeout(rtm); rtm = setTimeout(function () { if (qEl.value.trim()) renderResults(); }, 350); }
  function shopUrl(s, r) { return s.file && s.file.base ? s.file.base + r[3] : r[3]; }
  function shopImg(s, r) {
    if (!r[4]) return "";
    var u = /^https?:/.test(r[4]) ? r[4] : (s.file.img || "") + r[4];
    return /cdn\.shopify\.com|\/cdn\/shop\//.test(u) ? u + "?width=160" : u;
  }
  function modelKey(m) { m = String(m || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); return m.length >= 5 && /\d/.test(m) && /[A-Z]/.test(m) ? m : ""; }
  // shop hits for one category, grouped by model number across stores (appliances)
  function shopHits(q, cat) {
    if (!SH || !IX) return null;
    var r = IX.search(q, function (ref) { return ref.k === "s" && ref.s.cat === cat && inCity(ref.s); });
    var groups = {}, out = [];
    r.hits.forEach(function (h) {
      var s = h.ref.s, row = h.ref.r;
      var o = { s: s, r: row, price: row[1], was: row[2], hi: row[7] };
      var mk = cat === "appliances" ? modelKey(row[6]) : "";
      if (mk && groups[mk]) { var g = groups[mk]; if (!g.offers.some(function (x) { return x.s === s; })) g.offers.push(o); return; }
      var x = { title: row[0], offers: [o], rank: h.rank, score: h.score, acc: accessory(row[0], r.words) };
      if (mk) groups[mk] = x;
      out.push(x);
    });
    out.forEach(function (x) { x.offers.sort(function (a, b) { return a.price - b.price; }); x.best = x.offers[0].price; x.rel = relevance(x, x.title, x.offers.length, r.words); });
    sortHits(out);
    return out;
  }
  function shopRow(x) {
    var o = x.offers[0], s = o.s, li = el("li", "sitem");
    var img = shopImg(s, o.r);
    var th = el("a", "s-th"); ext(th, shopUrl(s, o.r)); th.setAttribute("aria-hidden", "true"); th.tabIndex = -1;
    if (img) { var im = el("img"); im.loading = "lazy"; im.decoding = "async"; im.alt = ""; im.width = 72; im.height = 72; im.src = img; im.onerror = function () { th.classList.add("noimg"); im.remove(); }; th.appendChild(im); } else th.classList.add("noimg");
    li.appendChild(th);
    var body = el("div", "s-body");
    var top = el("div", "s-top");
    top.appendChild(ext(el("a", "s-name", x.title), shopUrl(s, o.r)));
    var k = "s" + s.id + ":" + (o.r[3] || "").slice(-60);
    top.appendChild(starBtn(k, { kind: "s", n: x.title, p: o.price, q: x.title, st: s.id, h: o.r[3] }));
    body.appendChild(top);
    var meta = el("div", "s-meta");
    meta.appendChild(el("b", "s-p", money(o.price) + (o.hi ? "+" : "")));
    if (o.was) meta.appendChild(el("s", "s-was", money(o.was)));
    meta.appendChild(el("span", "s-store", s.name + " \u00B7 " + s.cities.map(shortCity).join(", ")));
    body.appendChild(meta);
    if (x.offers.length > 1) {
      var ul = el("ul", "s-offers");
      x.offers.slice(1, 5).forEach(function (p) { var li2 = el("li"); li2.appendChild(ext(el("a", null, p.s.name), shopUrl(p.s, p.r))); li2.appendChild(el("span", "gi-city", " \u00B7 " + p.s.cities.map(shortCity).join(", "))); li2.appendChild(el("span", "gi-p", money(p.price))); ul.appendChild(li2); });
      body.insertBefore(el("p", "s-cmp", "Same model at " + x.offers.length + " stores, cheapest first"), meta.nextSibling);
      body.appendChild(ul);
    }
    body.appendChild(el("p", "gi-checked", "checked " + when(s.checked) + (o.hi ? " \u00B7 price depends on size" : "")));
    li.appendChild(body);
    return li;
  }
  function localStoresFor(cat) { return SH ? SH.stores.filter(function (s) { return s.cat === cat && inCity(s); }) : []; }
  function localStoreButtons(cat, q) {
    var list = localStoresFor(cat);
    return storeGrid(list.map(function (s) {
      if (s.live && s.search) return { name: s.name, url: s.search, sub: s.cities.map(shortCity).join(", ") };
      return { name: s.name, noq: true, url: s.phone ? "tel:" + s.phone.replace(/[^0-9]/g, "") : s.site, sub: (s.phone ? "call " + s.phone : "visit") + " \u00B7 " + s.cities.map(shortCity).join(", ") };
    }), q);
  }
  var shopLimit = { appliances: 12, clothing: 12 };
  function shopCard(cat, q, hits, title) {
    var c = el("div", "card"); c.appendChild(el("h3", "res-sub", title + (city === "all" ? "" : " in " + city)));
    if (hits === null) { c.appendChild(el("p", "hint", "Loading local store prices\u2026")); return c; }
    if (shDone < shTotal) c.appendChild(el("p", "hint", "Still loading stores (" + shDone + " of " + shTotal + ")\u2026"));
    if (hits.length) {
      c.appendChild(sortToggle(renderResults));
      var ol = el("ol", "slist"); hits.slice(0, shopLimit[cat]).forEach(function (x) { ol.appendChild(shopRow(x)); }); c.appendChild(ol);
      if (hits.length > shopLimit[cat]) { var b = el("button", "btn btn-light more", "Show more (" + (hits.length - shopLimit[cat]) + ")"); b.type = "button"; b.addEventListener("click", function () { shopLimit[cat] += 24; renderResults(); }); c.appendChild(b); }
    } else c.appendChild(el("p", "hint", "No online price for \u201C" + q + "\u201D at these stores yet."));
    var st = localStoresFor(cat);
    if (st.length) { var d = el("details", "dgroup inres"); if (!hits.length) d.open = true; d.appendChild(el("summary", null, "Check it at a local " + (cat === "appliances" ? "appliance" : "clothing") + " store (" + st.length + ")")); d.appendChild(localStoreButtons(cat, q)); c.appendChild(d); }
    return c;
  }
  var sIx = null, sIxFor = "";
  function storeHits(q) {
    var key = (SH ? SH.stores.length : 0) + ":" + (G ? G.stores.length : 0);
    if (sIxFor !== key || !sIx) {
      sIx = new RLSearch.Index(); sIxFor = key;
      allStores().forEach(function (s) { sIx.add(s.name, (s.sub || "") + " online", { t: "o", s: s }); });
      if (SH) SH.stores.forEach(function (s) { sIx.add(s.name, s.sub + " " + s.cat + " " + s.cities.join(" ") + " " + (s.cat === "appliances" ? "appliance electronics" : "clothing clothes shoes"), { t: "l", s: s }); });
      if (G) G.stores.forEach(function (s) { sIx.add(s.name, "grocery supermarket food kosher " + s.city, { t: "g", s: s }); });
    }
    var r = sIx.search(q, true && function (ref) { return ref.t === "o" || ref.t === "g" ? (city === "all" || ref.t === "o" || ref.s.city === city) : inCity(ref.s); }, true);
    var strong = r.words.length * 3 - 0.01;
    r.hits.sort(function (a, b) { return b.rank - a.rank || b.score - a.score; });
    var out = r.hits.map(function (h) { h.ref.byName = h.score >= strong; return h.ref; });
    return rcat === "stores" ? out : out.filter(function (x) { return x.byName; }); // in "All": only stores whose name matches
  }
  function storeHitCard(q, hits) {
    var c = el("div", "card"); c.appendChild(el("h3", "res-sub", "\uD83C\uDFEC Stores"));
    var list = hits.slice(0, 24).map(function (ref) {
      var s = ref.s;
      if (ref.t === "o") { var home = s.url; try { home = new URL(s.url.replace(/\{[a-z]+\}/g, "x")).origin; } catch (e) {} return { name: s.name, url: home, noq: true, sub: s.sub || "online" }; }
      if (ref.t === "g") return { name: s.name, url: s.base || s.search || "#", noq: true, sub: "groceries \u00B7 " + shortCity(s.city) };
      return { name: s.name, url: s.site, noq: true, sub: s.sub + " \u00B7 " + s.cities.map(shortCity).join(", ") + (s.phone ? " \u00B7 " + s.phone : "") };
    });
    c.appendChild(storeGrid(list, ""));
    return c;
  }
  function renderCats(counts) {
    var w = $("res-cats"); if (!w) return; w.innerHTML = "";
    RCATS.forEach(function (c) {
      var b = el("button", "chip", c[1] + (c[0] !== "all" && counts[c[0]] != null ? " " + (counts[c[0]] > 999 ? "999+" : counts[c[0]]) : ""));
      b.type = "button"; b.setAttribute("aria-pressed", String(rcat === c[0]));
      b.addEventListener("click", function () { rcat = c[0]; localStorage.setItem("rl-rcat", rcat); renderResults(); });
      w.appendChild(b);
    });
  }
  function renderLocalShops() {
    var box = $("local-shops"); if (!box || !SH) return; box.innerHTML = "";
    var c = el("section", "card"); c.appendChild(el("h2", null, "\uD83D\uDCCD Local appliance & clothing stores"));
    var sel = el("select"); sel.id = "ls-city"; sel.setAttribute("aria-label", "Area");
    var lc = localStorage.getItem("rl-lscity") || (city !== "all" ? city : CITY_ORDER[0]);
    CITY_ORDER.forEach(function (x) { var o = el("option", null, x); o.value = x; if (x === lc) o.selected = true; sel.appendChild(o); });
    sel.addEventListener("change", function () { localStorage.setItem("rl-lscity", sel.value); renderLocalShops(); });
    c.appendChild(sel);
    [["appliances", "\uD83D\uDD0C Appliances & home"], ["clothing", "\uD83D\uDC54 Clothing & shoes"]].forEach(function (cat) {
      var st = SH.stores.filter(function (s) { return s.cat === cat[0] && s.cities.indexOf(lc) > -1; });
      c.appendChild(el("h3", "res-sub", cat[1] + " (" + st.length + ")"));
      var ul = el("ul", "lshops");
      st.forEach(function (s) {
        var li = el("li"); var a = ext(el("a", "ls-name", s.name), s.site); li.appendChild(a);
        li.appendChild(el("span", "ls-sub", " " + s.sub + (s.live ? " \u00B7 " + s.n.toLocaleString() + " prices" : "")));
        if (s.address) li.appendChild(el("span", "ls-addr", s.address));
        var acts = el("span", "ls-acts");
        if (s.phone) { var t = el("a", "chip", "\uD83D\uDCDE " + s.phone); t.href = "tel:" + s.phone.replace(/[^0-9]/g, ""); acts.appendChild(t); }
        if (!s.live) acts.appendChild(el("span", "ls-note", s.status === "directory" ? "no online prices: call or visit" : "search on store"));
        li.appendChild(acts); ul.appendChild(li);
      });
      if (!st.length) ul.appendChild(el("li", "hint", "None found here yet."));
      c.appendChild(ul);
    });
    box.appendChild(c);
  }
  function shopItemByKey(k, info) {
    var s = info && info.st && shopById[info.st]; if (!s || !s.file) return null;
    for (var i = 0; i < s.file.rows.length; i++) if (s.file.rows[i][3] === info.h) return { price: s.file.rows[i][1], store: s };
    return null;
  }

  /* ---------- routing ---------- */
  function route() {
    var h = location.hash.replace("#", "") || "deals";
    if (["deals", "groceries", "stores"].indexOf(h) < 0) h = "deals";
    ["deals", "groceries", "stores"].forEach(function (k) { $("view-" + k).hidden = k !== h; var t = $("tab-" + k); if (k === h) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current"); });
    if (h === "groceries") { renderGroceries(); }
    if (h === "stores") renderDir();
  }
  window.addEventListener("hashchange", function () { route(); window.scrollTo(0, 0); });

  renderCitySelect(); applyDeals(); route();
  getJSON("deals.json", function (d) { if (d && d.updated && (!DATA.updated || d.updated >= DATA.updated)) applyDeals(d); });
  var gLoading = false;
  function loadGroceries() {
    if (gLoading) return; gLoading = true;
    getJSON("data/groceries.json", function (g) { G = g || { stores: [], items: [], stats: { items: 0, stores_ok: 0 }, updated: null }; GN = null; robotLine(); renderForYou(); if (!$("view-groceries").hidden) renderGroceries(); if (qEl.value.trim()) renderResults(); if ($("gq").value.trim()) renderGroResults(); });
  }
  ["focus", "input"].forEach(function (ev) { qEl.addEventListener(ev, loadShops); });
  ["focus", "input"].forEach(function (ev) { qEl.addEventListener(ev, loadGroceries); $("gq").addEventListener(ev, loadGroceries); });
  window.addEventListener("hashchange", function () { if (location.hash === "#groceries") loadGroceries(); });
  if (location.hash === "#groceries" || Object.keys(me().s).length) loadGroceries(); else setTimeout(loadGroceries, 2500);
  renderForYou();
  getJSON("data/api-prices.json", function (a) { API = a; });
  getJSON("data/status.json", renderStatus);

  if (GOATCOUNTER_CODE) {
    var s = document.createElement("script"); s.async = true; s.src = "https://gc.zgo.at/count.js";
    s.setAttribute("data-goatcounter", "https://" + GOATCOUNTER_CODE + ".goatcounter.com/count");
    document.body.appendChild(s);
  }
})();
