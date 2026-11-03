/* RealLow v1 — static, no trackers. Deals come from deals.js (built from deals.json). */
(function () {
  "use strict";
  var DATA = window.REALLOW_DEALS || { deals: [], checked: "" };
  // Optional analytics: set to your GoatCounter code (e.g. "reallow") once the free account exists. Empty = no counter at all.
  var GOATCOUNTER_CODE = "";
  var SITE_URL = "https://reallow.sites.tab.bot/";

  var STORES = [
    { name: "Amazon", url: "https://www.amazon.com/s?k={q}" },
    { name: "Walmart", url: "https://www.walmart.com/search?q={q}" },
    { name: "Target", url: "https://www.target.com/s?searchTerm={q}" },
    { name: "eBay", url: "https://www.ebay.com/sch/i.html?_nkw={q}" },
    { name: "AliExpress", url: "https://www.aliexpress.us/w/wholesale-{dash}.html" },
    { name: "Best Buy", url: "https://www.bestbuy.com/site/searchpage.jsp?st={q}" },
    { name: "Costco", url: "https://www.costco.com/CatalogSearch?dept=All&keyword={q}" },
    { name: "Home Depot", url: "https://www.homedepot.com/s/{path}" },
    { name: "Google Shopping", url: "https://www.google.com/search?udm=28&q={q}", sub: "compare all stores", all: true }
  ];

  var CATS = [
    ["all", "All"], ["tech", "Tech"], ["home", "Home"], ["kitchen", "Kitchen"], ["kids", "Kids & Baby"],
    ["tools", "Tools"], ["cleaning", "Cleaning"], ["health", "Health"], ["travel", "Travel"], ["food", "Food"], ["gifts", "Gifts"]
  ];

  var $ = function (id) { return document.getElementById(id); };
  var money = function (n) { return "$" + Number(n).toFixed(2).replace(/\.00$/, ""); };
  var pct = function (d) { return d.was ? Math.round((1 - d.price / d.was) * 100) : 0; };

  function storeUrl(s, q) {
    return s.url
      .replace("{q}", encodeURIComponent(q).replace(/%20/g, "+"))
      .replace("{dash}", encodeURIComponent(q.trim().replace(/\s+/g, "-")))
      .replace("{path}", encodeURIComponent(q));
  }

  /* ---------- search ---------- */
  var storesEl = $("stores"), qEl = $("q");
  function renderStores() {
    var q = qEl.value.trim();
    storesEl.innerHTML = "";
    storesEl.classList.toggle("off", !q);
    STORES.forEach(function (s) {
      var a = document.createElement("a");
      a.className = "store" + (s.all ? " all" : "");
      a.target = "_blank"; a.rel = "noopener";
      a.href = q ? storeUrl(s, q) : "#";
      a.textContent = s.name;
      if (s.sub) { var sm = document.createElement("small"); sm.textContent = s.sub; a.appendChild(sm); }
      if (!q) { a.setAttribute("aria-disabled", "true"); a.tabIndex = -1; }
      storesEl.appendChild(a);
    });
    $("search-hint").textContent = q ? "Tap a store to see \u201C" + q + "\u201D there. Yellow = compare every store at once." : "Type anything, then tap a store. Each opens that store's own search.";
  }
  qEl.addEventListener("input", renderStores);
  $("search-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var q = qEl.value.trim();
    if (!q) { qEl.focus(); return; }
    qEl.blur();
    window.open(storeUrl(STORES[STORES.length - 1], q), "_blank", "noopener");
  });
  renderStores();

  /* ---------- deals ---------- */
  var deals = (DATA.deals || []).slice().sort(function (a, b) {
    return (b.hot ? 1 : 0) - (a.hot ? 1 : 0) || pct(b) - pct(a) || (b.was - b.price) - (a.was - a.price);
  });
  var current = "all";

  function waText(d) {
    var lines = [(d.hot ? "\uD83D\uDD25 " : "") + d.title, money(d.price) + (d.was ? " (was " + money(d.was) + ", " + pct(d) + "% off)" : "") + " at " + d.store];
    if (d.note) lines.push(d.note);
    lines.push(d.url, "", "Checked " + d.checked + ". Prices change fast.", "More real deals: " + SITE_URL);
    return lines.join("\n");
  }
  function waLink(text) { return "https://wa.me/?text=" + encodeURIComponent(text); }

  function card(d) {
    var li = document.createElement("li");
    li.className = "deal" + (d.hot ? " hot" : "");
    var th = document.createElement("div"); th.className = "thumb";
    if (d.image) {
      var img = document.createElement("img");
      img.src = d.image; img.alt = ""; img.loading = "lazy"; img.decoding = "async"; img.width = 110; img.height = 110;
      img.onerror = function () { th.innerHTML = '<span class="noimg" aria-hidden="true">\uD83C\uDFF7\uFE0F</span>'; };
      th.appendChild(img);
    } else { th.innerHTML = '<span class="noimg" aria-hidden="true">\uD83C\uDFF7\uFE0F</span>'; }
    var body = document.createElement("div"); body.className = "d-body";
    var badges = '<div class="badges">' + (d.hot ? '<span class="b b-hot">\uD83D\uDD25 HOT</span>' : "") +
      (d.was ? '<span class="b b-off">' + pct(d) + '% OFF</span>' : "") + '<span class="b b-store"></span></div>';
    body.innerHTML = badges + '<h3 class="d-title"></h3><div class="prices"><span class="now"></span>' +
      (d.was ? '<span class="was"></span><span class="save"></span>' : "") + '</div><p class="note"></p>';
    body.querySelector(".b-store").textContent = d.store;
    body.querySelector(".d-title").textContent = d.title;
    body.querySelector(".now").textContent = money(d.price);
    if (d.was) {
      body.querySelector(".was").textContent = money(d.was);
      body.querySelector(".save").textContent = "save " + money(d.was - d.price);
    }
    body.querySelector(".note").textContent = (d.note ? d.note + " · " : "") + "Checked " + d.checked;
    var act = document.createElement("div"); act.className = "d-actions";
    var go = document.createElement("a"); go.className = "btn btn-deal"; go.href = d.url; go.target = "_blank"; go.rel = "noopener";
    go.textContent = "Go to deal \u2192";
    var wa = document.createElement("a"); wa.className = "btn btn-wa"; wa.href = waLink(waText(d)); wa.target = "_blank"; wa.rel = "noopener";
    wa.textContent = "Share"; wa.setAttribute("aria-label", "Share on WhatsApp: " + d.title);
    act.appendChild(go); act.appendChild(wa);
    li.appendChild(th); li.appendChild(body); li.appendChild(act);
    return li;
  }

  function renderDeals() {
    var list = $("deals"); list.innerHTML = "";
    var shown = deals.filter(function (d) { return current === "all" || (d.cats || []).indexOf(current) > -1; });
    shown.forEach(function (d) { list.appendChild(card(d)); });
    $("empty").hidden = shown.length > 0;
  }

  function renderChips() {
    var el = $("chips"); el.innerHTML = "";
    CATS.forEach(function (c) {
      var n = c[0] === "all" ? deals.length : deals.filter(function (d) { return (d.cats || []).indexOf(c[0]) > -1; }).length;
      if (!n) return;
      var b = document.createElement("button");
      b.type = "button"; b.className = "chip"; b.setAttribute("aria-pressed", String(c[0] === current));
      b.innerHTML = '<span></span><span class="n">' + n + "</span>";
      b.firstChild.textContent = c[1];
      b.addEventListener("click", function () { current = c[0]; renderChips(); renderDeals(); });
      el.appendChild(b);
    });
  }

  /* ---------- post of the day ---------- */
  function renderPotd() {
    var pick = deals.filter(function (d) { return d.id === DATA.post_of_the_day; })[0] || deals[0];
    if (!pick) return;
    var text = waText(pick);
    $("potd-text").textContent = text;
    $("potd-wa").href = waLink(text);
    $("potd").hidden = false;
    $("potd-copy").addEventListener("click", function () {
      var done = function () { toast("Copied. Paste it in your group \uD83D\uDC4D"); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
      } else { fallbackCopy(text); done(); }
    });
  }
  function fallbackCopy(t) {
    var ta = document.createElement("textarea"); ta.value = t; ta.setAttribute("readonly", "");
    ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {} document.body.removeChild(ta);
  }
  var tt;
  function toast(msg) { var t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(function () { t.classList.remove("show"); }, 2200); }

  $("checked-line").textContent = DATA.checked ? deals.length + " deals · all checked " + DATA.checked : "";
  $("foot-date").textContent = DATA.checked ? "deals checked " + DATA.checked : "";
  renderChips(); renderDeals(); renderPotd();


  /* ---------- kosher groceries tab ---------- */
  var G = window.REALLOW_GROCERIES || null;
  var city = null;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function linkBtn(href, label, cls) { var a = el("a", "btn " + cls, label); a.href = href; a.target = "_blank"; a.rel = "noopener"; return a; }
  function renderGroceries() {
    var cities = (G && G.cities || []).filter(function (c) { return c.stores && c.stores.length; });
    $("gro-empty").hidden = cities.length > 0;
    if (!cities.length) return;
    if (!city) city = cities[0].city;
    $("gro-checked").textContent = "Checked " + (G.checked_label || G.checked || "");
    var chips = $("city-chips"); chips.innerHTML = "";
    cities.forEach(function (c) {
      var b = el("button", "chip"); b.type = "button"; b.setAttribute("aria-pressed", String(c.city === city));
      b.appendChild(el("span", null, c.city)); b.appendChild(el("span", "n", String(c.stores.length)));
      b.addEventListener("click", function () { city = c.city; renderGroceries(); });
      chips.appendChild(b);
    });
    var list = $("gro-list"); list.innerHTML = "";
    var cur = cities.filter(function (c) { return c.city === city; })[0];
    cur.stores.forEach(function (s) {
      var li = el("li", "gstore");
      li.appendChild(el("h3", null, s.name));
      var meta = el("p", "gmeta", [s.area, s.address].filter(Boolean).join(" · "));
      if (s.phone) { meta.appendChild(document.createTextNode(meta.textContent ? " · " : "")); var t = el("a", null, s.phone); t.href = "tel:" + s.phone.replace(/[^\d+]/g, ""); meta.appendChild(t); }
      li.appendChild(meta);
      var links = el("div", "glinks");
      if (s.website) links.appendChild(linkBtn(s.website, "Website", "btn-light"));
      if (s.order_online && s.order_online !== s.website) links.appendChild(linkBtn(s.order_online, "Order online", "btn-deal"));
      if (s.specials_url && s.specials_url !== s.website) links.appendChild(linkBtn(s.specials_url, "Weekly specials", "btn-wa"));
      li.appendChild(links);
      if (s.specials && s.specials.length) {
        var sp = el("div", "specials"); sp.appendChild(el("b", null, "On special (seen on their site " + (G.checked_label || G.checked) + ")"));
        var ul = el("ul"); s.specials.slice(0, 3).forEach(function (x) { ul.appendChild(el("li", null, x.item + (x.price ? " — " + x.price : "") + (x.was ? " (was " + x.was + ")" : ""))); });
        sp.appendChild(ul); li.appendChild(sp);
      }
      list.appendChild(li);
    });
    renderGroSearch(cur); renderStaples(cur);
    var on = (G.online || []);
    $("gro-online-wrap").hidden = !on.length;
    var ol = $("gro-online"); ol.innerHTML = "";
    on.forEach(function (o) { var li = el("li"); var a = el("a", null, o.name); a.href = o.url; a.target = "_blank"; a.rel = "noopener"; li.appendChild(a); if (o.serves) li.appendChild(el("span", null, o.serves)); ol.appendChild(li); });
  }
  function num(p) { var m = String(p || "").match(/\$\s?(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : Infinity; }
  function renderGroSearch(cur) {
    var box = $("gro-search-stores"), q = $("gq").value.trim();
    var withSearch = cur.stores.filter(function (s) { return s.search_url_pattern; });
    $("gro-search").hidden = !withSearch.length;
    $("gq").placeholder = "Search " + cur.city + " stores: cream cheese, challah\u2026";
    box.innerHTML = ""; box.classList.toggle("off", !q);
    withSearch.forEach(function (s) {
      var a = el("a", "store", s.name); a.target = "_blank"; a.rel = "noopener";
      a.href = q ? s.search_url_pattern.replace("{term}", encodeURIComponent(q)) : "#";
      if (!q) { a.setAttribute("aria-disabled", "true"); a.tabIndex = -1; }
      box.appendChild(a);
    });
  }
  function renderStaples(cur) {
    var by = {}, order = [];
    cur.stores.forEach(function (s) { (s.prices || []).forEach(function (p) {
      if (!p.price || num(p.price) === Infinity) return;
      if (!by[p.item]) { by[p.item] = []; order.push(p.item); }
      by[p.item].push({ store: s.name, price: p.price, n: num(p.price), what: p["brand/size"] || "", url: p.url, was: p.was });
    }); });
    var wrap = $("staples"), list = $("staples-list"); list.innerHTML = "";
    wrap.hidden = !order.length; if (!order.length) return;
    order.forEach(function (item) {
      var rows = by[item].sort(function (a, b) { return a.n - b.n; });
      var li = el("li", "staple"); li.appendChild(el("b", null, item.charAt(0).toUpperCase() + item.slice(1)));
      var ul = el("ul");
      rows.forEach(function (r, i) {
        var row = el("li", i === 0 && rows.length > 1 ? "cheapest" : null);
        var a = el("a", null, r.store); if (r.url) { a.href = r.url; a.target = "_blank"; a.rel = "noopener"; }
        row.appendChild(a); row.appendChild(el("span", "sp", " " + r.price + (r.was ? " (was " + r.was + ")" : "")));
        if (r.what) row.appendChild(el("small", null, r.what));
        ul.appendChild(row);
      });
      li.appendChild(ul); list.appendChild(li);
    });
  }
  $("gro-search-form").addEventListener("submit", function (e) { e.preventDefault(); $("gq").blur(); });
  $("gq").addEventListener("input", function () {
    var cities = (G && G.cities || []); var cur = cities.filter(function (c) { return c.city === city; })[0]; if (cur) renderGroSearch(cur);
  });
  function route() {
    var g = location.hash === "#groceries";
    $("view-deals").hidden = g; $("view-groceries").hidden = !g;
    if (g) { $("tab-groceries").setAttribute("aria-current", "page"); $("tab-deals").removeAttribute("aria-current"); }
    else { $("tab-deals").setAttribute("aria-current", "page"); $("tab-groceries").removeAttribute("aria-current"); }
  }
  window.addEventListener("hashchange", function () { route(); window.scrollTo(0, 0); });
  renderGroceries(); route();

  if (GOATCOUNTER_CODE) {
    var s = document.createElement("script"); s.async = true; s.src = "https://gc.zgo.at/count.js";
    s.setAttribute("data-goatcounter", "https://" + GOATCOUNTER_CODE + ".goatcounter.com/count");
    document.body.appendChild(s);
  }
})();
