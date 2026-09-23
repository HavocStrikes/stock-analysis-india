#!/usr/bin/env python3
"""Snapshot Yahoo Finance data into public/data/ for static hosting.

Run locally:   python3 scripts/fetch-data.py
Runs on cron:  .github/workflows/data.yml (commits + pushes when changed).

Output:
  public/data/markets.json          indices / forex / commodities
  public/data/quotes.json           home aggregate: meta + 1y daily closes
  public/data/stocks/<SYM>.json     per-stock: meta + intraday + daily + weekly + fundamentals
  public/data/generated.json        { generatedAt }
Stdlib only.
"""
import http.cookiejar
import json
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"
STOCKS = DATA / "stocks"

UNIVERSE = [
    "RELIANCE.NS", "HDFCBANK.NS", "TCS.NS", "INFY.NS", "ICICIBANK.NS",
    "SBIN.NS", "BHARTIARTL.NS", "ITC.NS", "LT.NS", "TMCV.NS",
    "TATASTEEL.NS", "MARUTI.NS", "SUNPHARMA.NS", "TITAN.NS",
    "AXISBANK.NS", "KOTAKBANK.NS", "HINDUNILVR.NS", "NTPC.NS",
    "POWERGRID.NS", "ONGC.NS", "BAJFINANCE.NS", "ADANIENT.NS",
    "TATAPOWER.NS", "WIPRO.NS",
]
MARKETS = ["^NSEI", "^BSESN", "^NSEBANK", "^INDIAVIX", "INR=X", "GC=F", "CL=F"]
NAMES = {"^NSEI": "Nifty 50", "^BSESN": "Sensex", "^NSEBANK": "Bank Nifty",
         "^INDIAVIX": "India VIX", "INR=X": "USD/INR", "GC=F": "Gold", "CL=F": "Crude"}

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
_jar = http.cookiejar.CookieJar()
_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(_jar))
_crumb = None


def _get(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with _opener.open(req, timeout=timeout) as res:
        return res.read().decode("utf-8")


def crumb():
    global _crumb
    if _crumb:
        return _crumb
    try:
        _get("https://fc.yahoo.com/", timeout=10)
    except Exception:
        pass
    _crumb = _get("https://query1.finance.yahoo.com/v1/test/getcrumb", timeout=10).strip()
    return _crumb


def chart(symbol, range_, interval):
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}"
           f"?interval={interval}&range={range_}")
    data = json.loads(_get(url))
    r = ((data.get("chart") or {}).get("result") or [None])[0]
    if not r:
        raise ValueError(f"no chart for {symbol} {range_}")
    meta = r.get("meta", {})
    ts = r.get("timestamp") or []
    q0 = ((r.get("indicators") or {}).get("quote") or [{}])[0] or {}
    pts = []
    for i, t in enumerate(ts):
        cl = (q0.get("close") or [])
        c = cl[i] if i < len(cl) else None
        if c is None:
            continue
        row = {"t": t * 1000}
        for k, short in (("open", "o"), ("high", "h"), ("low", "l"), ("close", "c")):
            arr = q0.get(k) or []
            v = arr[i] if i < len(arr) else None
            row[short] = round(v, 2) if isinstance(v, (int, float)) else None
        arr = q0.get("volume") or []
        v = arr[i] if i < len(arr) else None
        row["v"] = int(v) if isinstance(v, (int, float)) else None
        pts.append(row)
    m = {k: meta.get(k) for k in (
        "symbol", "currency", "regularMarketPrice", "previousClose",
        "chartPreviousClose", "regularMarketChangePercent",
        "regularMarketDayHigh", "regularMarketDayLow",
        "fiftyTwoWeekHigh", "fiftyTwoWeekLow", "regularMarketVolume",
        "regularMarketTime", "fullExchangeName", "exchangeName", "marketCap")}
    m["exchange"] = m.pop("fullExchangeName") or m.pop("exchangeName")
    m["prevClose"] = m.pop("previousClose") or m.pop("chartPreviousClose")
    m["price"] = m.pop("regularMarketPrice")
    m["changePct"] = m.pop("regularMarketChangePercent")
    m["dayHigh"] = m.pop("regularMarketDayHigh")
    m["dayLow"] = m.pop("regularMarketDayLow")
    m["week52High"] = m.pop("fiftyTwoWeekHigh")
    m["week52Low"] = m.pop("fiftyTwoWeekLow")
    m["volume"] = m.pop("regularMarketVolume")
    m["marketCap"] = m.pop("marketCap")
    if m.get("regularMarketTime"):
        m["marketTime"] = m.pop("regularMarketTime") * 1000
    return {"meta": m, "points": pts}


def fundamentals(symbol):
    mods = "price,summaryDetail,defaultKeyStatistics,assetProfile"
    url = (f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/"
           f"{urllib.parse.quote(symbol)}?modules={mods}&crumb={crumb()}")
    try:
        data = json.loads(_get(url))
    except Exception:
        global _crumb
        _crumb = None
        url = (f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/"
               f"{urllib.parse.quote(symbol)}?modules={mods}&crumb={crumb()}")
        data = json.loads(_get(url))
    res = ((data.get("quoteSummary") or {}).get("result") or [None])[0]
    if not res:
        return None

    def pick(mod, key):
        v = res.get(mod, {}).get(key, {})
        return v.get("raw") if isinstance(v, dict) else v

    prof = res.get("assetProfile", {})
    emp = prof.get("fullTimeEmployees")
    return {
        "peTrailing": pick("summaryDetail", "trailingPE"),
        "peForward": pick("summaryDetail", "forwardPE"),
        "pb": pick("defaultKeyStatistics", "priceToBook"),
        "epsTrailing": pick("defaultKeyStatistics", "trailingEps"),
        "epsForward": pick("defaultKeyStatistics", "forwardEps"),
        "dividendYield": pick("summaryDetail", "dividendYield"),
        "beta": pick("defaultKeyStatistics", "beta"),
        "profitMargin": pick("defaultKeyStatistics", "profitMargins"),
        "roe": pick("defaultKeyStatistics", "returnOnEquity"),
        "bookValue": pick("defaultKeyStatistics", "bookValue"),
        "sharesOut": pick("defaultKeyStatistics", "sharesOutstanding"),
        "sector": prof.get("sector"), "industry": prof.get("industry"),
        "website": prof.get("website"),
        "employees": emp.get("raw") if isinstance(emp, dict) else emp,
        "summary": (prof.get("longBusinessSummary") or "")[:1500],
    }


def one_stock(sym):
    try:
        day = chart(sym, "1d", "5m")
        daily = chart(sym, "1y", "1d")
        weekly = chart(sym, "5y", "1wk")
        fund = fundamentals(sym)
        meta = daily["meta"]
        meta.update({k: v for k, v in day["meta"].items() if v is not None})
        return {"symbol": sym, "ok": True, "meta": meta, "fund": fund,
                "intraday": day["points"], "daily": daily["points"],
                "weekly": weekly["points"]}
    except Exception as exc:
        print(f"[warn] {sym}: {exc}", flush=True)
        return {"symbol": sym, "ok": False}


def main():
    DATA.mkdir(parents=True, exist_ok=True)
    STOCKS.mkdir(parents=True, exist_ok=True)
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    pool = ThreadPoolExecutor(max_workers=6)

    mk = []
    for sym in MARKETS:
        try:
            d = chart(sym, "2d", "1d")
            m = d["meta"]
            prev = m.get("prevClose")
            chg = round((m["price"] - prev) / prev * 100, 2) if m.get("price") and prev else None
            mk.append({"name": NAMES[sym], "symbol": sym, "price": m.get("price"),
                       "prevClose": prev, "changePct": chg,
                       "currency": m.get("currency") or "USD"})
        except Exception as exc:
            print(f"[warn] market {sym}: {exc}", flush=True)
    (DATA / "markets.json").write_text(json.dumps(
        {"fetchedAt": now, "quotes": mk}, separators=(",", ":")))

    stocks = list(pool.map(one_stock, UNIVERSE))
    ok = [s for s in stocks if s["ok"]]
    for s in ok:
        (STOCKS / f"{s['symbol']}.json").write_text(
            json.dumps(s, separators=(",", ":")))
    agg = [{"symbol": s["symbol"], "meta": s["meta"],
            "closes": [p["c"] for p in s["daily"]],
            "sector": (s.get("fund") or {}).get("sector"),
            "pe": (s.get("fund") or {}).get("peTrailing")} for s in ok]
    (DATA / "quotes.json").write_text(json.dumps(
        {"fetchedAt": now, "quotes": agg}, separators=(",", ":")))
    (DATA / "generated.json").write_text(json.dumps({"generatedAt": now}))
    print(f"snapshot ok: {len(ok)}/{len(UNIVERSE)} stocks, {len(mk)} markets")


if __name__ == "__main__":
    sys.exit(main())
