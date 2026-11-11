/* RealLow live online prices (added Nov 11 2026).
   Reads data/api-prices.json, which the robots refresh every 2 hours from the stores' own official systems
   (eBay Browse API today; AliExpress when its keys arrive). Shows:
   - "Top deals today": new items with a real discount vs the listing's list / was price, clean categories only
   - "Same items on eBay": the Online-deals items, priced live on eBay
   Text only (no product photos) so nothing immodest can slip in. Never invents a price. No trackers. */
(function () {
  var PAGES = "https://david7578433-bit.github.io/reallow/";
  var BASES = /github\.io$/.test(location.hostname) ? ["./"] : [PAGES, "./"];
  var CATS = [["all", "All"], ["tech", "Tech"], ["kitchen", "Kitchen"], ["home", "Home"], ["cleaning", "Cleaning"], ["tools", "Tools"], ["kids", "Kids & Baby"], ["health", "Health"], ["travel", "Travel"]];
  var D = null, ON = {}, cat = "all", showAll = false;
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function ext(a, href) { a.href = href; a.target = "_blank"; a.rel = "noopener nofollow sponsored"; return a; }
  function money(n) { return "$" + Number(n).toFixed(2); }
  function ago(iso) {
    var m = Math.round((Date.now() - new Date(iso)) / 60000); if (isNaN(m)) return "";
    if (m < 1) return "just now"; if (m < 60) return m + " min ago";
    var h = Math.floor(m / 60); return h < 48 ? h + " h " + (m % 60 ? (m % 60) + " min " : "") + "ago" : Math.round(h / 24) + " days ago";
  }
  function getJSON(path, cb) {
    var i = 0, bust = "?v=" + Math.floor(Date.now() / 3e5);
    (function next() {
      if (i >= BASES.length || !window.fetch) return cb(null);
      fetch(BASES[i++] + path + bust).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(cb, next);
    })();
  }
  function waLink(o) {
    var t = o.title + "\n" + money(o.price) + (o.was ? " (" + (o.was_label || "was") + " " + money(o.was) + ", " + o.pct_off + "% off)" : "") + " on " + o.store + "\n" + o.url + "\n\nPrice when checked; may change. More real deals: https://reallow.sites.tab.bot/";
    return "https://wa.me/?text=" + encodeURIComponent(t);
  }
  function dealCard(o) {
    var li = el("li", "deal live-deal");
    var th = el("div", "thumb live-thumb");
    th.appendChild(el("span", "live-pct", o.pct_off ? "-" + o.pct_off + "%" : "\u26A1"));
    th.appendChild(el("span", "live-store", o.store));
    var body = el("div", "d-body"), badges = el("div", "badges");
    if (o.pct_off) badges.appendChild(el("span", "b b-off", o.pct_off + "% OFF"));
    badges.appendChild(el("span", "b b-store b-" + String(o.store).toLowerCase(), o.store));
    if (o.free_ship) badges.appendChild(el("span", "b b-ship", "Free shipping"));
    body.appendChild(badges); body.appendChild(el("h3", "d-title", o.title));
    var pr = el("div", "prices"); pr.appendChild(el("span", "now", money(o.price)));
    if (o.was) { pr.appendChild(el("span", "was", money(o.was))); pr.appendChild(el("span", "save", "save " + money(o.was - o.price))); }
    body.appendChild(pr);
    var note = (o.was ? (o.was_label || "Was") + " " + money(o.was) + " on the listing \u00B7 " : "") + "New \u00B7 seller " + (o.seller || o.store) + " \u00B7 live price, checked ";
    var p = el("p", "note live-when"); p.appendChild(document.createTextNode(note)); var w = el("span", "live-ago", ago(o.checked)); w.setAttribute("data-t", o.checked); p.appendChild(w);
    body.appendChild(p);
    var act = el("div", "d-actions");
    var go = ext(el("a", "btn btn-deal", "Buy on " + o.store + " \u2192"), o.url); go.setAttribute("data-goatcounter-click", "live-buy-" + o.store.toLowerCase());
    var wa = ext(el("a", "btn btn-wa", "Share"), waLink(o)); wa.setAttribute("aria-label", "Share on WhatsApp");
    act.appendChild(go); act.appendChild(wa); body.appendChild(act);
    li.appendChild(th); li.appendChild(body);
    return li;
  }
  function renderDeals(box) {
    if (!box) return; box.innerHTML = "";
    var all = (D && D.top_deals) || [];
    if (!all.length) { box.hidden = true; return; }
    box.hidden = false;
    var head = el("div", "deals-head");
    head.appendChild(el("h2", null, "\u26A1 Top deals today \u00B7 live prices"));
    var line = el("p", "checked"); line.appendChild(document.createTextNode(all.length + " deals \u00B7 checked ")); var w = el("span", "live-ago", ago(D.updated)); w.setAttribute("data-t", D.updated); line.appendChild(w);
    head.appendChild(line); box.appendChild(head);
    box.appendChild(el("p", "on-intro", "Real discounts right now, read straight from eBay's own system and refreshed every 2 hours. New items only, well-rated sellers, clean categories. The store's page is the final word."));
    var ch = el("div", "chips"); ch.setAttribute("role", "toolbar"); ch.setAttribute("aria-label", "Live deal categories");
    CATS.forEach(function (c) {
      var n = c[0] === "all" ? all.length : all.filter(function (o) { return o.cat === c[0]; }).length; if (!n) return;
      var b = el("button", "chip"); b.type = "button"; b.setAttribute("aria-pressed", String(cat === c[0]));
      b.appendChild(el("span", null, c[1])); b.appendChild(el("span", "n", String(n)));
      b.addEventListener("click", function () { cat = c[0]; showAll = false; renderAll(); });
      ch.appendChild(b);
    });
    box.appendChild(ch);
    var shown = all.filter(function (o) { return cat === "all" || o.cat === cat; });
    var ol = el("ol", "deals live-list"); var lim = showAll ? shown.length : 8;
    shown.slice(0, lim).forEach(function (o) { ol.appendChild(dealCard(o)); });
    box.appendChild(ol);
    if (shown.length > lim) { var m = el("button", "btn btn-light more", "Show all " + shown.length + " live deals"); m.type = "button"; m.addEventListener("click", function () { showAll = true; renderAll(); }); box.appendChild(m); }
  }
  function renderMatches(box) {
    if (!box) return; box.innerHTML = "";
    var ms = (D && D.matches) || []; if (!ms.length) { box.hidden = true; return; }
    box.hidden = false;
    var head = el("div", "deals-head"); head.appendChild(el("h2", null, "\uD83D\uDCCA The same items on eBay right now"));
    var line = el("p", "checked"); line.appendChild(document.createTextNode("live, checked ")); var w = el("span", "live-ago", ago(D.updated)); w.setAttribute("data-t", D.updated); line.appendChild(w); head.appendChild(line);
    box.appendChild(head);
    box.appendChild(el("p", "on-intro", "The cheapest new eBay listing we found for each item above, from a well-rated US seller. The size or count can be different, so check before you buy."));
    var ul = el("ul", "live-match");
    ms.forEach(function (m) {
      var li = el("li", "frow");
      li.appendChild(el("div", "lm-for", m.for_title || m.q));
      var src = ON[m.for_id], eb = m.price + (m.ship || 0);
      if (src && src.price > 0) {
        var r0 = el("div", "f-meta"); r0.appendChild(el("b", "f-price", money(src.price))); r0.appendChild(el("span", "f-store", src.store));
        if (src.price <= eb) r0.appendChild(el("span", "f-off lm-best", "cheapest"));
        li.appendChild(r0);
      }
      var row = el("div", "f-meta");
      row.appendChild(el("b", "f-price", money(m.price)));
      row.appendChild(el("span", "f-store", "eBay"));
      if (m.free_ship) row.appendChild(el("span", "f-off", "free shipping")); else if (m.ship) row.appendChild(el("span", "f-when", "+ " + money(m.ship) + " shipping"));
      if (src && src.price > eb) row.appendChild(el("span", "f-off lm-best", "cheapest"));
      li.appendChild(row);
      li.appendChild(ext(el("a", "f-title", m.title + " \u2192"), m.url));
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }
  function renderAll() { renderDeals($("live-deals")); renderDeals($("live-deals-online")); renderMatches($("live-matches")); }
  function tick() { var xs = document.querySelectorAll(".live-ago[data-t]"); for (var i = 0; i < xs.length; i++) xs[i].textContent = ago(xs[i].getAttribute("data-t")); }
  getJSON("data/api-prices.json", function (j) { if (!j) return; D = j; renderAll(); });
  getJSON("data/online-deals.json", function (j) { if (!j || !j.deals) return; j.deals.forEach(function (o) { ON[o.id] = o; }); if (D) renderMatches($("live-matches")); });
  setInterval(tick, 60000);
})();
