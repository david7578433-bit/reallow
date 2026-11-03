/* RealLow search engine (v4). Hand-rolled, no libraries, runs on the phone.
   - typo tolerant (1 typo in short words, 2 in long ones), plurals ("shirts" = "shirt"), word order does not matter
   - synonyms: fridge = refrigerator, washing machine = washer, sneakers ~ shoes, shabbos shoes ~ dress shoes, ...
   - ranking: exact word > starts-with > typo match; the caller sorts cheapest first inside a rank
   - one growing index: grocery items, store products, deals and store names are added as their files load. */
(function () {
  "use strict";
  // Same words, different spelling: both the products and the search are turned into the first word.
  var CANON = {
    refrigerator: ["fridge", "fridges", "frig", "frige", "refridgerator", "refrigerater", "refridgerater", "refrigirator", "refrig", "refrigerador", "fridgerator"],
    washingmachine: ["clotheswasher", "washingmachines"], dryer: ["clothesdryer"], dishwasher: ["dishwashers", "dishwasher"],
    aircon: ["ac", "airconditioner", "airconditioning", "aircondition"], airfryer: ["airfryers"],
    microwave: ["microwaves", "microwav"], tv: ["television", "televisions", "tvs"], hotplate: ["hotplates", "plata", "platta"],
    blech: ["blechs"], urn: ["urns", "hotwaterurn"],
    shabbos: ["shabbat", "shabbes", "shabes", "sabbath", "shabos", "shabbath"], yomtov: ["yom", "tov"],
    yarmulke: ["yarmulka", "yarmulkas", "yarmulkes", "kippah", "kipah", "kippa", "kipa", "kippot", "yarmulkah"],
    pajama: ["pyjama", "pajamas", "pyjamas", "pjs", "pj", "sleepwear"], tshirt: ["tee", "tees", "tshirts", "teeshirt"],
    kid: ["children", "child", "kids", "childrens", "kiddie"], men: ["man", "mens", "gent", "gents", "mans"],
    women: ["woman", "womens", "lady", "ladies", "ladys", "womans"], boy: ["boys"], girl: ["girls"],
    baby: ["babies", "infant", "infants", "babys", "newborn"], teen: ["teens", "teenager"], toddler: ["toddlers"],
    sneaker: ["sneakers", "sneeker", "sneekers"], pant: ["pants", "trouser", "trousers", "slack", "slacks"],
    sweater: ["jumper", "pullover"], tights: ["tight", "pantyhose", "hosiery"], sock: ["socks"],
    coffee: ["cofee", "coffe"], challah: ["chala", "challa", "chalah", "challos", "challot"], chicken: ["chiken", "chickn"]
  };
  // Related words: a search for the key also finds these, ranked a bit lower.
  var SYN = {
    shoe: ["sneaker", "boot", "sandal", "loafer", "oxford", "slipper", "moccasin", "maryjane", "clog"],
    sneaker: ["shoe"], boot: ["shoe"], sandal: ["shoe"], slipper: ["shoe"],
    shirt: ["blouse", "polo", "tshirt", "buttondown"], blouse: ["top", "shirt"], top: ["shirt", "blouse", "tshirt"], tshirt: ["shirt", "top"],
    pant: ["jean", "legging", "chino", "jogger"], dress: ["gown", "jumper"], gown: ["dress"], skirt: ["skort"],
    suit: ["blazer", "jacket"], blazer: ["suit", "jacket"], coat: ["jacket", "parka", "puffer", "overcoat", "kapota"], jacket: ["coat", "blazer", "puffer"],
    hat: ["cap", "fedora", "beanie"], tights: ["sock", "stocking", "legging"], sock: ["tights"],
    refrigerator: ["freezer"], freezer: ["refrigerator"], range: ["stove", "oven", "cooktop"], stove: ["range", "cooktop", "oven"], oven: ["range", "stove"], cooktop: ["range", "stove"],
    washer: ["washingmachine", "laundry"], washingmachine: ["washer", "laundry"], dryer: ["laundry"], vacuum: ["vac", "hoover"], kid: ["boy", "girl", "toddler", "teen", "baby"],
    shabbos: ["dress", "yomtov", "holiday", "elegant"], headwrap: ["tichel", "snood", "headband"], tichel: ["headwrap", "snood"]
  };
  var PHRASES = [
    [/\bwashing machines?\b/g, "washingmachine"], [/\bclothes (washer|dryer)s?\b/g, "clothes$1"], [/\bair condition(er|ers|ing)?\b/g, "airconditioner"],
    [/\bair fryers?\b/g, "airfryer"], [/\bhot plates?\b/g, "hotplate"], [/\bhot water urns?\b/g, "hotwaterurn"], [/\bdish ?washers?\b/g, "dishwasher"],
    [/\bmicro wave\b/g, "microwave"], [/\b(t|tee) shirts?\b/g, "tshirt"], [/\bmary janes?\b/g, "maryjane"], [/\bbutton (down|up)s?\b/g, "buttondown"],
    [/\byom tov\b/g, "yomtov"], [/\bhead ?wraps?\b/g, "headwrap"], [/\bre?frid?ge?rat[oe]rs?\b/g, "refrigerator"]
  ];
  var C2 = {}; Object.keys(CANON).forEach(function (k) { CANON[k].forEach(function (v) { C2[v] = k; }); C2[k] = k; });

  function norm(s) {
    s = String(s || "").toLowerCase().replace(/[\u2019'`]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
    for (var i = 0; i < PHRASES.length; i++) s = s.replace(PHRASES[i][0], PHRASES[i][1]);
    return s;
  }
  function stem(t) {
    if (C2[t]) return C2[t];
    var n = t.length;
    if (n > 3 && !/\d/.test(t)) {
      if (/(ss|us|is|ous)$/.test(t)) { /* keep: dress, glass, citrus */ }
      else if (n > 4 && /ies$/.test(t)) t = t.slice(0, -3) + "y";
      else if (n > 4 && /(ches|shes|xes|zes|sses)$/.test(t)) t = t.slice(0, -2);
      else if (/s$/.test(t)) t = t.slice(0, -1);
    }
    return C2[t] || t;
  }
  var STOP = { and: 1, the: 1, "for": 1, with: 1, of: 1, a: 1, "in": 1, by: 1, to: 1, on: 1 };
  function terms(text) {
    var out = [], seen = {}, ws = norm(text).split(" ");
    for (var i = 0; i < ws.length; i++) { var w = ws[i]; if (!w || STOP[w]) continue; var t = stem(w); if (!seen[t]) { seen[t] = 1; out.push(t); } }
    return out;
  }

  // bounded Damerau-Levenshtein: returns distance, or max+1 when over
  function dist(a, b, max) {
    var la = a.length, lb = b.length; if (Math.abs(la - lb) > max) return max + 1;
    var prev2 = null, prev = new Array(lb + 1), cur, i, j;
    for (j = 0; j <= lb; j++) prev[j] = j;
    for (i = 1; i <= la; i++) {
      cur = new Array(lb + 1); cur[0] = i; var rowMin = i;
      for (j = 1; j <= lb; j++) {
        var c = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        var v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur[j] = v; if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev2 = prev; prev = cur;
    }
    return prev[lb];
  }

  function Index() {
    this.vocab = new Map(); // term -> postings array (doc*2 + 1 when the word is only in the keywords)
    this.sorted = null; this.docs = 0; this.meta = [];
  }
  Index.prototype.add = function (title, keywords, ref) {
    var d = this.docs++, p, t, i, seen = {};
    this.meta.push(ref);
    // posting = doc*4 + 0 (word in the name), 1 (only in the store's keywords/type), 2 (in both: e.g. name "...Refrigerator" + type "Refrigerators")
    var tt = terms(title), kk = keywords ? terms(keywords) : [], ks = {};
    for (i = 0; i < kk.length; i++) ks[kk[i]] = 1;
    for (i = 0; i < tt.length; i++) { t = tt[i]; seen[t] = 1; p = this.vocab.get(t); if (!p) { p = []; this.vocab.set(t, p); this.sorted = null; } p.push(d * 4 + (ks[t] ? 2 : 0)); }
    for (i = 0; i < kk.length; i++) { t = kk[i]; if (seen[t]) continue; seen[t] = 1; p = this.vocab.get(t); if (!p) { p = []; this.vocab.set(t, p); this.sorted = null; } p.push(d * 4 + 1); }
    return d;
  };
  Index.prototype._sortedVocab = function () { if (!this.sorted) this.sorted = Array.from(this.vocab.keys()).sort(); return this.sorted; };
  Index.prototype._prefix = function (t, cap) {
    var v = this._sortedVocab(), lo = 0, hi = v.length, out = [];
    while (lo < hi) { var mid = (lo + hi) >> 1; if (v[mid] < t) lo = mid + 1; else hi = mid; }
    for (var i = lo; i < v.length && out.length < cap && v[i].lastIndexOf(t, 0) === 0; i++) if (v[i] !== t) out.push(v[i]);
    return out;
  };
  Index.prototype._fuzzy = function (t) {
    var n = t.length; if (n < 4 || /^\d+$/.test(t)) return [];
    var max = n >= 7 ? 2 : 1, out = [], v = this._sortedVocab();
    for (var i = 0; i < v.length; i++) {
      var w = v[i]; if (w === t || Math.abs(w.length - n) > max) continue;
      if (n < 7 && w.charCodeAt(0) !== t.charCodeAt(0)) continue;
      if (dist(t, w, max) <= max) out.push(w);
    }
    // also known misspellings of canonical words (frige -> fridge -> refrigerator)
    Object.keys(C2).forEach(function (k) { if (k !== t && Math.abs(k.length - n) <= max && (n >= 7 || k[0] === t[0]) && dist(t, k, max) <= max && out.indexOf(C2[k]) < 0) out.push(C2[k]); });
    return out;
  };
  // alternatives for one query word: [term, weight, kind] kind 3 exact, 2 starts-with, 1 typo
  Index.prototype._alts = function (t, isLast) {
    var alts = [], self = this, seen = {};
    function push(term, w, kind) { if (seen[term] || !self.vocab.has(term)) return; seen[term] = 1; alts.push([term, w, kind]); }
    push(t, 1, 3);
    (SYN[t] || []).forEach(function (s) { push(s, t === "shabbos" ? 0.55 : 0.8, 3); });
    if (t.length >= 2) this._prefix(t, t.length < 3 ? 40 : isLast ? 400 : 150).forEach(function (s) { push(s, 0.75, 2); });
    var have = 0; alts.forEach(function (a) { have += self.vocab.get(a[0]).length; });
    if (t.length >= 4 && have < 25) this._fuzzy(t).forEach(function (s) { if (!seen[s]) { push(s, 0.55, 1); (SYN[s] || []).forEach(function (x) { push(x, 0.45, 1); }); } });
    return alts;
  };
  // search: returns [{ref, score, rank, partial}] (unsorted beyond rank+score; caller sorts by price inside a rank)
  Index.prototype.search = function (q, accept, noPartial) {
    var qt = terms(q); if (!qt.length) return { hits: [], words: [] };
    var nT = qt.length, self = this;
    var per = qt.map(function (t, i) { return self._alts(t, i === nT - 1); });
    var known = per.filter(function (a) { return a.length; }).length;
    var score = new Map(), cnt = new Map(), rank = new Map();
    per.forEach(function (alts, ti) {
      var best = new Map(), kindOf = new Map();
      alts.forEach(function (a) {
        var p = self.vocab.get(a[0]); if (!p) return;
        for (var i = 0; i < p.length; i++) {
          var f = p[i] & 3, d = p[i] >> 2, s = (f === 1 ? 0.9 : f === 2 ? 1.2 : 1) * a[1] * a[2];
          var b = best.get(d); if (b === undefined || s > b) { best.set(d, s); kindOf.set(d, a[2]); }
        }
      });
      best.forEach(function (s, d) {
        score.set(d, (score.get(d) || 0) + s); cnt.set(d, (cnt.get(d) || 0) + 1);
        var k = kindOf.get(d), r = rank.get(d); rank.set(d, r === undefined ? k : Math.min(r, k));
      });
    });
    function collect(need) {
      var out = [];
      cnt.forEach(function (c, d) {
        if (c < need) return; var ref = self.meta[d]; if (accept && !accept(ref)) return;
        out.push({ ref: ref, score: score.get(d), rank: c < nT ? 0 : rank.get(d), partial: c < nT });
      });
      return out;
    }
    var hits = collect(nT);
    if (!hits.length && nT > 2 && !noPartial) hits = collect(Math.max(1, known - 1)); // nothing has every word: show the closest ones
    return { hits: hits, words: qt };
  };
  window.RLSearch = { Index: Index, terms: terms, norm: norm, stem: stem, dist: dist };
})();
