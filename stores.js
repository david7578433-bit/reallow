/* Store directory: each store's own search link, tested Nov 3, 2026. {q} = query with +, {path} = URL-encoded, {dash} = words-with-dashes. noq = the store blocks test robots, so the button opens the store without a search. */
window.REALLOW_STORES = {
 "tested": "2026-11-03",
 "groups": [
  {
   "name": "Everything stores",
   "icon": "\ud83c\udf0e",
   "stores": [
    {
     "name": "Amazon",
     "url": "https://www.amazon.com/s?k={q}",
     "top": true
    },
    {
     "name": "Walmart",
     "url": "https://www.walmart.com/search?q={q}",
     "top": true
    },
    {
     "name": "Target",
     "url": "https://www.target.com/s?searchTerm={q}",
     "top": true
    },
    {
     "name": "eBay",
     "url": "https://www.ebay.com/sch/i.html?_nkw={q}",
     "top": true
    },
    {
     "name": "AliExpress",
     "url": "https://www.aliexpress.us/w/wholesale-{dash}.html",
     "top": true
    },
    {
     "name": "Temu",
     "url": "https://www.temu.com/search_result.html?search_key={q}",
     "top": true
    },
    {
     "name": "Google Shopping",
     "url": "https://www.google.com/search?udm=28&q={q}",
     "sub": "compare all stores",
     "all": true,
     "top": true
    }
   ]
  },
  {
   "name": "Warehouse clubs",
   "icon": "\ud83d\udce6",
   "stores": [
    {
     "name": "Costco",
     "url": "https://www.costco.com/CatalogSearch?dept=All&keyword={q}",
     "top": true
    },
    {
     "name": "BJ's",
     "url": "https://www.bjs.com/search/{path}",
     "top": true
    },
    {
     "name": "Sam's Club",
     "url": "https://www.samsclub.com/search?q={q}"
    }
   ]
  },
  {
   "name": "Home & furniture",
   "icon": "\ud83d\udecb\ufe0f",
   "stores": [
    {
     "name": "IKEA",
     "url": "https://www.ikea.com/us/en/search/?q={q}",
     "top": true
    },
    {
     "name": "Wayfair",
     "url": "https://www.wayfair.com/keyword.php?keyword={q}"
    },
    {
     "name": "Bed Bath & Beyond",
     "url": "https://www.bedbathandbeyond.com/{path},/k,/results.html"
    },
    {
     "name": "Overstock",
     "url": "https://www.overstock.com/{path},/k,/results.html"
    },
    {
     "name": "Kohl's",
     "url": "https://www.kohls.com/search.jsp?search={q}"
    },
    {
     "name": "Macy's",
     "url": "https://www.macys.com/shop/featured/{path}"
    },
    {
     "name": "JCPenney",
     "url": "https://www.jcpenney.com/s?searchTerm={q}"
    },
    {
     "name": "Boscov's",
     "url": "https://www.boscovs.com/search?q={q}"
    },
    {
     "name": "Crate & Barrel",
     "url": "https://www.crateandbarrel.com/search?query={q}"
    },
    {
     "name": "Williams Sonoma",
     "url": "https://www.williams-sonoma.com/search/results.html?words={q}"
    }
   ]
  },
  {
   "name": "Discount & dollar stores",
   "icon": "\ud83d\udcb5",
   "stores": [
    {
     "name": "Dollar Tree",
     "url": "https://www.dollartree.com/searchresults?Ntt={q}",
     "top": true
    },
    {
     "name": "Dollar General",
     "url": "https://www.dollargeneral.com/product-search?q={q}"
    },
    {
     "name": "Five Below",
     "url": "https://www.fivebelow.com/search?q={q}"
    },
    {
     "name": "Ollie's",
     "url": "https://www.ollies.com/search?q={q}"
    },
    {
     "name": "TJ Maxx",
     "url": "https://tjmaxx.tjx.com/store/index.jsp",
     "sub": "opens store",
     "noq": true
    },
    {
     "name": "Marshalls",
     "url": "https://www.marshalls.com/us/store/index.jsp",
     "sub": "opens store",
     "noq": true
    }
   ]
  },
  {
   "name": "Home improvement & tools",
   "icon": "\ud83d\udd28",
   "stores": [
    {
     "name": "Home Depot",
     "url": "https://www.homedepot.com/s/{path}",
     "top": true
    },
    {
     "name": "Lowe's",
     "url": "https://www.lowes.com/search?searchTerm={q}",
     "top": true
    },
    {
     "name": "Menards",
     "url": "https://www.menards.com/main/search.html?search={q}"
    },
    {
     "name": "Tractor Supply",
     "url": "https://www.tractorsupply.com/tsc/search/{path}"
    },
    {
     "name": "Academy Sports",
     "url": "https://www.academy.com/search?query={q}"
    }
   ]
  },
  {
   "name": "Electronics",
   "icon": "\ud83d\udcbb",
   "stores": [
    {
     "name": "Best Buy",
     "url": "https://www.bestbuy.com/site/searchpage.jsp?st={q}",
     "top": true
    },
    {
     "name": "Newegg",
     "url": "https://www.newegg.com/p/pl?d={q}"
    },
    {
     "name": "B&H Photo",
     "url": "https://www.bhphotovideo.com/c/search?q={q}"
    },
    {
     "name": "Adorama",
     "url": "https://www.adorama.com/l/?searchinfo={q}"
    },
    {
     "name": "Apple",
     "url": "https://www.apple.com/us/search/{path}"
    },
    {
     "name": "Samsung",
     "url": "https://www.samsung.com/us/search/searchMain/?listType=g&searchTerm={q}"
    },
    {
     "name": "Dell",
     "url": "https://www.dell.com/en-us/search/{path}"
    },
    {
     "name": "GameStop",
     "url": "https://www.gamestop.com/search/?q={q}"
    },
    {
     "name": "Monoprice",
     "url": "https://www.monoprice.com/search/index?keyword={q}"
    }
   ]
  },
  {
   "name": "Office & school",
   "icon": "\u270f\ufe0f",
   "stores": [
    {
     "name": "Staples",
     "url": "https://www.staples.com/{path}/directory_{path}"
    },
    {
     "name": "Office Depot",
     "url": "https://www.officedepot.com/a/search/?q={q}"
    }
   ]
  },
  {
   "name": "Pharmacy & health",
   "icon": "\ud83d\udc8a",
   "stores": [
    {
     "name": "CVS",
     "url": "https://www.cvs.com/search?searchTerm={q}"
    },
    {
     "name": "Walgreens",
     "url": "https://www.walgreens.com/search/results.jsp?Ntt={q}"
    },
    {
     "name": "iHerb",
     "url": "https://www.iherb.com/search?kw={q}"
    }
   ]
  },
  {
   "name": "Kids, toys & crafts",
   "icon": "\ud83e\uddf8",
   "stores": [
    {
     "name": "LEGO",
     "url": "https://www.lego.com/en-us/search?q={q}"
    },
    {
     "name": "Michaels",
     "url": "https://www.michaels.com/search?q={q}"
    },
    {
     "name": "Hobby Lobby",
     "url": "https://www.hobbylobby.com/search?query={q}"
    },
    {
     "name": "Etsy",
     "url": "https://www.etsy.com/search?q={q}"
    }
   ]
  },
  {
   "name": "Pets",
   "icon": "\ud83d\udc3e",
   "stores": [
    {
     "name": "Chewy",
     "url": "https://www.chewy.com/s?query={q}"
    },
    {
     "name": "PetSmart",
     "url": "https://www.petsmart.com/search/?q={q}"
    }
   ]
  },
  {
   "name": "Groceries & delivery",
   "icon": "\ud83e\udd6b",
   "stores": [
    {
     "name": "Instacart",
     "url": "https://www.instacart.com/store/s?k={q}"
    },
    {
     "name": "ShopRite",
     "url": "https://www.shoprite.com/sm/pickup/rsid/3000/results?q={q}"
    },
    {
     "name": "Kroger",
     "url": "https://www.kroger.com/search?query={q}"
    }
   ]
  }
 ]
};
