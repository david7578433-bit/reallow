/* RealLow v2 — static site. Prices come from the robots (GitHub Actions, every 4 hours).
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
  var CITY_ORDER = ["Monroe / Kiryas Joel", "Monsey", "Williamsburg", "Boro Park", "Flatbush", "Crown Heights", "Lakewood", "Five Towns"];

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
  function groceryHits(q, onlyCity, limit) {
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
  function dealHits(q) {
    var m = matchFn(q); if (!m) return [];
    var all = (DATA.deals || []).map(function (d) { return { d: d, v: true }; }).concat((DATA.feed || []).map(function (d) { return { d: d }; }))
      .concat(API && API.offers ? API.offers.map(function (d) { return { d: d, api: true }; }) : []);
    return all.filter(function (x) { return m(norm(x.d.title + " " + (x.d.store || ""))); }).sort(function (a, b) { return a.d.price - b.d.price; });
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
    $("res-h").textContent = "Prices for \u201C" + q + "\u201D";
    var ab = $("res-amz"); ab.innerHTML = ""; ab.appendChild(amazonBtn(q, "btn btn-amz wide"));
    // grocery
    var gbox = $("res-groceries"); gbox.innerHTML = "";
    var gh = groceryHits(q, city, 12);
    if (gh === null) gbox.appendChild(el("p", "hint", "Loading grocery prices\u2026"));
    else if (gh.length) {
      var c = el("div", "card"); c.appendChild(el("h3", "res-sub", "\uD83D\uDED2 Kosher grocery prices" + (city === "all" ? "" : " in " + city)));
      c.appendChild(sortToggle(renderResults));
      var ol = el("ol", "glist"); gh.forEach(function (h) { if (h.more) { var mo = el("li", "gi-more"); var b = el("a", null, h.more + " more grocery matches \u2192"); b.href = "#groceries"; b.addEventListener("click", function () { $("gq").value = q; }); mo.appendChild(b); ol.appendChild(mo); } else ol.appendChild(groceryRow(h)); });
      c.appendChild(ol); gbox.appendChild(c);
    }
    // deals + store APIs
    var dbox = $("res-deals"); dbox.innerHTML = "";
    var dh = dealHits(q);
    if (dh.length) {
      var c2 = el("div", "card"); c2.appendChild(el("h3", "res-sub", "\uD83D\uDD25 Deals & store prices, cheapest first"));
      var ol2 = el("ol", "feed"); dh.slice(0, 25).forEach(function (x) { ol2.appendChild(dealRow(x)); }); c2.appendChild(ol2); dbox.appendChild(c2);
    }
    // Put whichever answers the search better on top: groceries for food, deals/store prices for everything else.
    var gcount = gh ? gh.filter(function (h) { return !h.more; }).length : 0;
    if (dh.length && (gcount < 5 || dh.length >= gcount)) gbox.parentNode.insertBefore(dbox, gbox); else gbox.parentNode.insertBefore(gbox, dbox);
    var none = gh !== null && !gh.length && !dh.length;
    $("res-stores-h").textContent = none ? "No robot price for \u201C" + q + "\u201D yet \u2014 tap a store to see it there" : "Search \u201C" + q + "\u201D on any store";
    var sbox = $("res-stores"); sbox.innerHTML = "";
    var top = allStores().filter(function (s) { return s.top; });
    sbox.appendChild(storeGrid(top, q));
    var more = el("details", "dgroup inres"); more.appendChild(el("summary", null, "All " + allStores().length + " stores"));
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
  function renderDir() { var n = renderDirectory($("dir"), $("dq").value.trim(), false); $("dir-count").textContent = n + " online stores"; }
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
      } else {
        var d = (DATA.deals || []).concat(DATA.feed || []).filter(function (x) { return "d" + x.id === k; })[0];
        if (d) { now = d.price; where = d.store; }
      }
      var a = el("a", "fy-name", info.n); a.href = "#"; a.addEventListener("click", function (e) { e.preventDefault(); location.hash = "#deals"; qEl.value = info.q || info.n; renderResults(); qEl.scrollIntoView({ block: "start" }); });
      li.appendChild(a);
      var p = el("span", "fy-p");
      if (now == null) p.textContent = G || info.kind !== "g" ? "not in today's prices" : "\u2026";
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
