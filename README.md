# Salary Sacrifice Calculator

**KashVector tool** — compare three strategies for redirecting pre-tax salary:

- **Super salary sacrifice** — concessional contributions, taxed at 15% (or 30% for high earners via Division 293)
- **ETF/stock investing** — after-tax equivalent invested in a diversified portfolio, with franking credits and CGT discount
- **Mortgage offset** — after-tax equivalent placed in an offset account, reducing interest, then reinvested post-payoff

Live at: [kashvector.com/super-compare/](https://kashvector.com/super-compare/)

---

## Tax model

| Feature | Detail |
|---|---|
| Division 293 | Extra 15% contributions tax when `salary + employer super > $250k` |
| Concessional cap | $30,000/yr (2025-26); cap breach flagged in UI |
| Super earnings | Income taxed at 15%; capital gains at 10% (1/3 inclusion reduction for assets held >12 months) |
| ETF franking | Grossed-up dividends reduce effective income tax on distributions |
| ETF CGT | 50% discount on gains for assets held >12 months; cost base tracked year-by-year |
| Employer SG rate | 12% (2025-26 default) |

**Comparison basis:** super receives the full pre-tax sacrifice amount; ETF and offset receive the after-tax equivalent (`monthlyPreTax × 12 × (1 − marginalRate)`).

---

## Project structure

```
config.js          Tax constants (caps, rates, thresholds)
utils.js           Pure helpers: marginalRate(), fmt(), fmtM(), parseMoney()
calc/
  super.js         superProjection(inputs) → super accumulation
  etf.js           etfProjection(inputs)   → ETF portfolio
  offset.js        offsetProjection(inputs) → mortgage offset + reinvestment
app.js             DOM controller (inputs, localStorage, chart, render)
index.html         Single-page app shell
style.css          KashVector design system (CSS vars, light/dark mode)
```

**Hard rule:** only `app.js` touches the DOM, `window`, or `localStorage`. All `calc/` files are pure functions — data in, data out.

**Script load order** (globals must exist before use):
```
config.js → utils.js → calc/super.js → calc/etf.js → calc/offset.js → Chart.js CDN → app.js
```

---

## Local development

No build step. Vanilla JS served directly by the browser.

```bash
npx --yes http-server . -p 8080 -c-1
# open http://localhost:8080
```

---

## Deploy

Copy files to the StockAnalysis static site and push to trigger Cloudflare Pages:

```bash
cp config.js utils.js app.js index.html style.css C:/Projects/StockAnalysis/www/super-compare/
cp calc/*.js C:/Projects/StockAnalysis/www/super-compare/calc/
cd C:/Projects/StockAnalysis && git add -A && git commit -m "..." && git push
```
