# StockLens India — Live NSE/BSE Stock Analysis

A fast, beautiful, **zero-dependency** stock analysis website for Indian stocks.
Search any NSE/BSE listing, get live price, interactive charts (1D→5Y),
day/52-week ranges, SMA-20/50 + RSI-14 technicals and a local watchlist.

## Stack (deliberately boring = fast)

| Layer | Choice | Why |
|---|---|---|
| Backend | Python 3 stdlib (`http.server`) | No install, no API keys, runs anywhere |
| Frontend | Vanilla HTML/CSS/JS + canvas charts | No build step, ~30KB total, instant load |
| Data | Yahoo Finance chart/search APIs via server proxy | Free, keyless, covers NSE `.NS` + BSE `.BO` |

No React, no Tailwind, no chart library — the UI is hand-built so first
paint is one tiny HTML file + one CSS file + one JS file.

## Run

```bash
cd stock-analysis-india
python3 server.py        # → http://localhost:8000
```

Optional: `PORT=8080 python3 server.py`

## API (same-origin, proxied + cached)

| Endpoint | Cache | Description |
|---|---|---|
| `GET /api/search?q=tata` | 10 min | NSE/BSE symbol matches |
| `GET /api/chart?symbol=RELIANCE.NS&range=1mo&interval=1d` | 1–5 min | OHLC points + quote meta |
| `GET /api/markets` | 5 min | Nifty 50, Sensex, Bank Nifty, VIX, USD/INR, gold, crude |
| `GET /api/health` | — | Liveness probe |

Ranges: `1d 5d 1mo 6mo 1y 5y`. If Yahoo is unreachable the server serves
the last cached payload instead of erroring.

## Deploy

- **Static frontend:** `public/` works on GitHub Pages as-is (needs a
  same-origin `/api/*` — point it at a hosted `server.py` or add a tiny
  worker later).
- **Full app:** any VM/container with Python 3 — `python3 server.py`.

## Disclaimer

Educational tool — **not investment advice**. Prices may lag; verify with
your broker before trading.
