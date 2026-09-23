#!/usr/bin/env python3
"""StockLens India — zero-dependency server (Python stdlib only).

Serves:
  /                          -> static frontend (public/)
  /api/search?q=...          -> symbol search (Yahoo Finance, India-biased)
  /api/chart?symbol=RELIANCE.NS&range=1mo&interval=1d
                             -> OHLC + meta (price, day/52w range, prev close)
  /api/batch?symbols=A,B,...&range=6mo
                             -> compact quotes + daily closes for many symbols
                                (powers home grid, movers & screener in 1 call)
  /api/fundamentals?symbol=  -> valuation + profile (PE, PB, mcap, EPS,
                                dividend, beta, sector, business summary)
  /api/markets               -> Nifty 50, Sensex, Bank Nifty, India VIX,
                                USD/INR, gold, crude snapshot
  /api/health                -> liveness probe

Run:  python3 server.py   ->  http://localhost:8000
Env:  PORT (default 8000)
"""
import gzip
import http.cookiejar
import json
import mimetypes
import os
import re
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BASE = Path(__file__).resolve().parent
PUBLIC = BASE / "public"
PORT = int(os.environ.get("PORT", "8000"))

UA_STR = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
          "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

_jar = http.cookiejar.CookieJar()
_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(_jar))
_crumb = {"value": None, "ts": 0}


def _get(url, timeout=12):
    req = urllib.request.Request(url, headers={"User-Agent": UA_STR})
    with _opener.open(req, timeout=timeout) as res:
        return res.read().decode("utf-8")


def yahoo(url, timeout=12):
    return json.loads(_get(url, timeout))


def crumb():
    """Yahoo crumb for the authed endpoints (quoteSummary). Cached 30 min."""
    if _crumb["value"] and time.time() - _crumb["ts"] < 1800:
        return _crumb["value"]
    try:
        _get("https://fc.yahoo.com/", timeout=10)
    except Exception:
        pass
    _crumb["value"] = _get("https://query1.finance.yahoo.com/v1/test/getcrumb",
                            timeout=10).strip()
    _crumb["ts"] = time.time()
    return _crumb["value"]


def quote_summary(symbol):
    mods = "price,summaryDetail,defaultKeyStatistics,assetProfile"
    url = (f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/"
           f"{urllib.parse.quote(symbol)}?modules={mods}&crumb={crumb()}")
    try:
        data = json.loads(_get(url))
    except Exception as exc:
        if "401" in str(exc) or "Unauthorized" in str(exc):
            _crumb["value"] = None  # force refresh once
            url = (f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/"
                   f"{urllib.parse.quote(symbol)}?modules={mods}&crumb={crumb()}")
            data = json.loads(_get(url))
        else:
            raise
    res = ((data.get("quoteSummary") or {}).get("result") or [None])[0]
    if not res:
        raise ValueError("no fundamentals for symbol")
    raw = lambda *mods_keys: next(
        (m.get(mods_keys[1], {}).get("raw")
         for m in [res.get(mods_keys[0], {})] if m.get(mods_keys[1])), None)

    def pick(mod, key):
        v = res.get(mod, {}).get(key, {})
        return v.get("raw") if isinstance(v, dict) else v

    prof = res.get("assetProfile", {})
    return {
        "symbol": symbol,
        "peTrailing": pick("summaryDetail", "trailingPE"),
        "peForward": pick("summaryDetail", "forwardPE"),
        "pb": pick("defaultKeyStatistics", "priceToBook"),
        "marketCap": pick("price", "marketCap"),
        "epsTrailing": pick("defaultKeyStatistics", "trailingEps"),
        "epsForward": pick("defaultKeyStatistics", "forwardEps"),
        "dividendYield": pick("summaryDetail", "dividendYield"),
        "dividendRate": pick("summaryDetail", "dividendRate"),
        "beta": pick("defaultKeyStatistics", "beta"),
        "profitMargin": pick("defaultKeyStatistics", "profitMargins"),
        "roe": pick("defaultKeyStatistics", "returnOnEquity"),
        "bookValue": pick("defaultKeyStatistics", "bookValue"),
        "sharesOut": pick("defaultKeyStatistics", "sharesOutstanding"),
        "sector": prof.get("sector"), "industry": prof.get("industry"),
        "website": prof.get("website"), "employees": (prof.get("fullTimeEmployees") or {}).get("raw") if isinstance(prof.get("fullTimeEmployees"), dict) else prof.get("fullTimeEmployees"),
        "summary": prof.get("longBusinessSummary"),
    }


# symbol -> (fetched_at, payload)
_cache: dict = {}


def cached(key, ttl, loader):
    now = time.time()
    hit = _cache.get(key)
    if hit and now - hit[0] < ttl:
        return hit[1]
    try:
        payload = loader()
    except Exception as exc:  # stale beats none
        if hit:
            return hit[1]
        raise exc
    _cache[key] = (now, payload)
    return payload


SYM_RE = re.compile(r"^[A-Z0-9.^=-]{1,16}(\.(NS|BO))?$")


def api_search(q):
    q = (q or "").strip()[:60]
    if not q:
        return {"query": "", "results": []}
    url = ("https://query2.finance.yahoo.com/v1/finance/search?q="
           + urllib.parse.quote(q) + "&quotesCount=10&country=India")
    data = yahoo(url)
    out = []
    for item in data.get("quotes", []):
        sym = item.get("symbol", "")
        if not (sym.endswith(".NS") or sym.endswith(".BO")):
            continue
        if "-BL" in sym or "=F" in sym or "^" in sym:
            continue
        out.append({
            "symbol": sym,
            "name": item.get("shortname") or item.get("longname") or sym,
            "exchange": item.get("exchDisp") or item.get("exchange") or "",
            "type": item.get("quoteType") or "",
        })
        if len(out) >= 8:
            break
    return {"query": q, "results": out}


def fetch_chart(symbol, range_, interval):
    ranges = {"1d": "5m", "5d": "15m", "1mo": "1d", "6mo": "1d",
              "1y": "1d", "5y": "1wk"}
    if range_ not in ranges:
        range_ = "1mo"
    interval = interval or ranges[range_]
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}"
           f"?interval={interval}&range={range_}")
    data = yahoo(url)
    result = (data.get("chart") or {}).get("result") or []
    if not result:
        err = ((data.get("chart") or {}).get("error") or {})
        raise ValueError(err.get("description") or "no data for symbol")
    r = result[0]
    meta = r.get("meta", {})
    ts = r.get("timestamp") or []
    q = (r.get("indicators") or {}).get("quote") or [{}]
    q0 = q[0] or {}
    points = []
    for i, t in enumerate(ts):
        closes = q0.get("close") or []
        c = closes[i] if i < len(closes) else None
        if c is None:
            continue
        row = {"t": t * 1000, "c": round(c, 2)}
        if range_ in ("1d", "5d"):
            for k in ("open", "high", "low", "volume"):
                arr = q0.get(k) or []
                v = arr[i] if i < len(arr) else None
                row[k[0]] = round(v, 2) if isinstance(v, (int, float)) else None
        else:
            arr = q0.get("volume") or []
            v = arr[i] if i < len(arr) else None
            row["v"] = int(v) if isinstance(v, (int, float)) else None
        points.append(row)
    m = {
        "symbol": meta.get("symbol"), "currency": meta.get("currency"),
        "exchange": meta.get("fullExchangeName") or meta.get("exchangeName"),
        "price": meta.get("regularMarketPrice"),
        "prevClose": meta.get("previousClose") or meta.get("chartPreviousClose"),
        "changePct": meta.get("regularMarketChangePercent"),
        "dayHigh": meta.get("regularMarketDayHigh"), "dayLow": meta.get("regularMarketDayLow"),
        "week52High": meta.get("fiftyTwoWeekHigh"), "week52Low": meta.get("fiftyTwoWeekLow"),
        "volume": meta.get("regularMarketVolume"),
        "marketTime": (meta.get("regularMarketTime") or 0) * 1000,
    }
    return {"meta": m, "points": points}


def api_chart(symbol, range_, interval):
    symbol = (symbol or "").strip().upper()[:24]
    if not symbol:
        raise ValueError("missing ?symbol=")
    return fetch_chart(symbol, range_, interval)


_pool = ThreadPoolExecutor(max_workers=6)


def api_batch(symbols, range_="6mo"):
    syms = [s.strip().upper()[:16] for s in (symbols or "").split(",")]
    syms = [s for s in syms if SYM_RE.match(s)][:30]
    if not syms:
        raise ValueError("missing ?symbols=")
    if range_ not in ("5d", "1mo", "6mo", "1y"):
        range_ = "6mo"

    def one(sym):
        try:
            d = fetch_chart(sym, range_, None)
            return {"symbol": sym, "ok": True, "meta": d["meta"],
                    "closes": [p["c"] for p in d["points"]]}
        except Exception as exc:
            return {"symbol": sym, "ok": False, "error": str(exc)[:120]}

    quotes = list(_pool.map(one, syms))
    return {"fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "quotes": quotes}


MARKET_SYMBOLS = [
    ("Nifty 50", "^NSEI"), ("Sensex", "^BSESN"), ("Bank Nifty", "^NSEBANK"),
    ("India VIX", "^INDIAVIX"), ("USD/INR", "INR=X"),
    ("Gold", "GC=F"), ("Crude", "CL=F"),
]


def api_markets():
    out = []
    for name, sym in MARKET_SYMBOLS:
        try:
            url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}"
                   "?interval=1d&range=2d")
            data = yahoo(url)
            r = ((data.get("chart") or {}).get("result") or [{}])[0]
            meta = r.get("meta", {})
            price = meta.get("regularMarketPrice")
            prev = meta.get("previousClose") or meta.get("chartPreviousClose")
            if price is None:
                continue
            chg = round((price - prev) / prev * 100, 2) if prev else None
            cur = meta.get("currency") or "USD"
            out.append({"name": name, "symbol": sym, "price": price,
                        "prevClose": prev, "changePct": chg, "currency": cur})
        except Exception:
            continue
    return {"fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "quotes": out}


MIME_EXTRA = {".webmanifest": "application/manifest+json"}


class Handler(BaseHTTPRequestHandler):
    server_version = "StockLens/1.0"

    def log_message(self, *args):
        pass

    def _send(self, code, body: bytes, ctype, cache="no-store", encoding=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        self.send_header("Access-Control-Allow-Origin", "*")
        if encoding:
            self.send_header("Content-Encoding", encoding)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, obj, cache="no-store"):
        raw = json.dumps(obj, separators=(",", ":")).encode()
        enc = self.headers.get("Accept-Encoding", "")
        if len(raw) > 1024 and "gzip" in enc:
            self._send(200, gzip.compress(raw), "application/json; charset=utf-8",
                       cache, encoding="gzip")
        else:
            self._send(200, raw, "application/json; charset=utf-8", cache)

    def _static(self, rel):
        path = (PUBLIC / rel.lstrip("/")).resolve()
        if not str(path).startswith(str(PUBLIC)) or not path.is_file():
            self._send(404, b"Not found", "text/plain")
            return
        ctype = MIME_EXTRA.get(path.suffix.lower())
        if not ctype:
            ctype, _ = mimetypes.guess_type(str(path))
            ctype = ctype or "application/octet-stream"
            if ctype.startswith("text/") or ctype in (
                    "application/javascript", "application/json", "image/svg+xml"):
                ctype += "; charset=utf-8"
        raw = path.read_bytes()
        textish = ctype.startswith("text/") or "javascript" in ctype \
            or "json" in ctype or "svg" in ctype
        enc = self.headers.get("Accept-Encoding", "")
        if textish and len(raw) > 1024 and "gzip" in enc:
            self._send(200, gzip.compress(raw), ctype,
                       "public, max-age=3600", encoding="gzip")
        else:
            self._send(200, raw, ctype, "public, max-age=3600")

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        p, qs = url.path, urllib.parse.parse_qs(url.query)
        q = lambda k, d="": qs.get(k, [d])[0]
        try:
            if p in ("/", "/index.html"):
                return self._static("index.html")
            if p == "/api/health":
                return self._json({"ok": True})
            if p == "/api/search":
                return self._json(cached(f"search:{q('q').lower()}", 600,
                                         lambda: api_search(q("q"))))
            if p == "/api/chart":
                sym, rg, iv = q("symbol"), q("range", "1mo"), q("interval") or None
                ttl = 60 if rg == "1d" else 300
                return self._json(cached(f"chart:{sym}:{rg}:{iv}", ttl,
                                         lambda: api_chart(sym, rg, iv)))
            if p == "/api/batch":
                syms, rg = q("symbols"), q("range", "6mo")
                return self._json(cached(f"batch:{syms}:{rg}", 300,
                                         lambda: api_batch(syms, rg)))
            if p == "/api/fundamentals":
                sym = q("symbol").strip().upper()
                if not sym or not SYM_RE.match(sym):
                    raise ValueError("bad ?symbol=")
                return self._json(cached(f"fund:{sym}", 3600,
                                         lambda: quote_summary(sym)))
            if p == "/api/markets":
                return self._json(cached("markets", 300, api_markets))
            if p.startswith("/api/") or p.startswith("/."):
                return self._send(404, b"Not found", "text/plain")
            return self._static(p)
        except ValueError as exc:
            self._send(400, json.dumps({"error": str(exc)}).encode(),
                       "application/json")
        except Exception as exc:  # noqa: BLE001 — never leak a stack to clients
            print(f"[error] {p}: {exc}")
            self._send(502, json.dumps(
                {"error": "upstream unavailable, try again"}).encode(),
                "application/json")


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"StockLens India -> http://localhost:{PORT}")
    srv.serve_forever()
