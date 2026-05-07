# Salary Sacrifice Calculator

Compare salary sacrificing into super vs ETF investing vs mortgage offset — with full Australian tax modelling including Division 293, franking credits, CGT discount, and super earnings tax.

Live at **kashvector.com/super-compare/**

---

## Local development

No build step. Vanilla JS served directly by the browser.

```bash
npx --yes http-server . -p 8080 -c-1
# open http://localhost:8080
```

## Deploy

Copy files to the StockAnalysis deploy target, then push to trigger Cloudflare Pages:

```bash
cp config.js utils.js app.js index.html style.css C:/Projects/StockAnalysis/www/super-compare/
cp calc/*.js C:/Projects/StockAnalysis/www/super-compare/calc/
cd C:/Projects/StockAnalysis && git add -A && git commit -m "..." && git push
```

---

## Architecture

**Hard rule: only `app.js` touches the DOM, `window`, or `localStorage`.** All calc files are pure functions — data in, data out, zero DOM access.

### Script load order

```
config.js → utils.js → calc/super.js → calc/etf.js → calc/offset.js → Chart.js CDN → app.js
```

### Files

| File | Role |
|---|---|
| `config.js` | Constants: tax rates, caps, thresholds |
| `utils.js` | Pure helpers: `marginalRate()`, `fmt()`, `fmtM()`, `parseMoney()`, `formatMoneyInput()`, `safe()` |
| `calc/super.js` | `superProjection(inputs)` — super accumulation with Div 293, employer contributions, concessional cap |
| `calc/etf.js` | `etfProjection(inputs)` — ETF portfolio with franking credits, CGT cost base tracking |
| `calc/offset.js` | `offsetProjection(inputs)` — mortgage offset phase then post-mortgage reinvestment |
| `app.js` | DOM controller: input formatting, debounced live updates, localStorage persistence, all render functions |
| `style.css` | KashVector design system (`--kv-*` CSS vars), light/dark mode |

---

## Tax model

- **Super:** contributions taxed at 15% (30% if Div 293 applies). Earnings taxed at 15% income / 10% capital gains.
- **ETF:** after-tax equivalent of the sacrifice amount invested. Franking credits reduce tax on dividends. CGT discount (50%) applies at retirement. Cost base tracks reinvested dividends to prevent overstatement.
- **Offset:** same after-tax contribution reduces mortgage interest. Post-mortgage payoff, balance reinvests at an estimated after-tax return.
- **Div 293:** assessment base = `salary + employerAnnual`; extra 15% on `min(totalConcessional, base − $250k)`.
- **Comparison basis:** super receives the pre-tax amount; ETF and offset receive `monthlyPreTax × 12 × (1 − marginalRate)`.

---

## localStorage

Inputs persist under the key `kv_super_compare_inputs`.
