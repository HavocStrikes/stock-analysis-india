# TickerTape India — NSE/BSE Terminal

A **newsprint-terminal** stock analysis site for Indian stocks.
Light-first paper theme, mono numerals, dense quotation tables, candlestick
charts, screeners and real fundamentals. Zero dependencies.

## What it does

- **Market** — sortable quotations table (24 tracked NSE stocks: LTP, change,
  market cap, P/E, RSI, 52-week position), top gainers/losers, watchlist
- **Screener** — oversold / overbought RSI, golden SMA trend, near-52w-high
- **Stock pages** — candlestick chart (1D→5Y) with volume, MA 20/50, Bollinger,
  crosshair O/H/L/C readout; RSI/MACD/MA technicals; valuation (P/E, P/B, EPS,
  dividend, beta, ROE); company file with business summary
- **Modes** — `● LIVE` when the Python API answers, `○ SNAPSHOT` (with time)
  when reading baked-in data files

## Stack

| Layer | Choice |
|---|---|
| Backend | Python 3 stdlib (`server.py`) — proxy + cache over Yahoo Finance |
| Snapshots | `scripts/fetch-data.py` bakes `public/data/*.json` (cron: `data.yml`) |
| Frontend | Vanilla HTML/CSS/JS + canvas — no build, ~15KB gzipped |

## Run locally (full live mode)

```bash
cd stock-analysis-india
python3 server.py        # → http://localhost:8000
```

Any static server also works — the UI falls back to `public/data/`
snapshots automatically: `python3 -m http.server --directory public 8000`

## Refresh snapshots manually

```bash
python3 scripts/fetch-data.py   # writes public/data/, 24 stocks + markets
```

## API (same-origin when `server.py` runs)

| Endpoint | Cache | Description |
|---|---|---|
| `GET /api/search?q=tata` | 10 min | NSE/BSE symbol matches |
| `GET /api/chart?symbol=RELIANCE.NS&range=6mo` | 1–5 min | Full OHLCV points + meta |
| `GET /api/batch?symbols=A,B&range=6mo` | 5 min | Many symbols, fundamentals-enriched |
| `GET /api/fundamentals?symbol=` | 1 h | Valuation + profile (crumb-auth Yahoo) |
| `GET /api/markets` | 5 min | Nifty 50, Sensex, Bank Nifty, VIX, USD/INR, gold, crude |

## Deploy

GitHub Pages serves `public/` (`pages.yml`); the `data.yml` cron refreshes
snapshots every 30 min in market hours so the static site stays fresh with
no server. For true live mode, host `server.py` anywhere with Python 3 and
set `STOCKLENS_API_BASE` to its URL (`config.js`).

## Disclaimer

Educational tool — **not investment advice**. Snapshot data can lag; verify
with your broker before trading.
