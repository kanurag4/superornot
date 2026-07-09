# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Source for the **Salary Sacrifice Calculator** KashVector tool — compares three strategies for redirecting pre-tax salary: superannuation salary sacrifice, ETF/stock investing, and mortgage offset. Australian tax model including Division 293, Division 296, 2026-27 income tax brackets, carry-forward concessional contributions, franking credits, CGT indexation (post-budget assets), and super earnings tax.

## Development and deployment

**No build step.** Vanilla JS served directly by the browser.

**Local preview:**
```bash
npx --yes http-server . -p 8080 -c-1
# open http://localhost:8080
```

**Deploy:** Copy files to `C:\Projects\StockAnalysis\www\super-compare\`, then push StockAnalysis to trigger Cloudflare Pages auto-deploy:
```bash
cp config.js utils.js app.js index.html style.css C:/Projects/StockAnalysis/www/super-compare/
cp calc/*.js C:/Projects/StockAnalysis/www/super-compare/calc/
cd C:/Projects/StockAnalysis && git add -A && git commit -m "..." && git push
```

## Architecture

**Hard rule: only `app.js` touches the DOM, `window`, or `localStorage`.** All calc files are pure functions — data in, data out, zero DOM access.

### Script load order (matters — globals must exist before use)
```
/kv-nav.js (shared root) → config.js → utils.js → calc/super.js → calc/etf.js → calc/offset.js → Chart.js CDN → app.js
```
`kv-nav.js` is loaded from the site root (`/kv-nav.js`) and injects the cross-tool navigation bar after the `<header>`. It 404s during local dev (no parent site), but works correctly on the deployed domain.

### File responsibilities

| File | Role |
|---|---|
| `config.js` | Constants: tax rates, caps, thresholds (`CONCESSIONAL_CAP`, `CARRY_FORWARD_TSB_THRESHOLD`, `DIV293_THRESHOLD`, `DIV296_LSBT`, `DIV296_VLSBT`, `DEFAULT_EMPLOYER_SUPER_RATE`, etc.) |
| `utils.js` | Pure helpers: `marginalRate()`, `fmt()`, `fmtM()`, `parseMoney()`, `formatMoneyInput()`, `safe()` |
| `calc/super.js` | `superProjection(inputs)` — super accumulation with Div 293, Div 296, employer contributions, concessional cap check, carry-forward concessional cap |
| `calc/etf.js` | `etfProjection(inputs)` — ETF portfolio with franking credits, CGT cost base tracking |
| `calc/offset.js` | `offsetProjection(inputs)` — mortgage offset phase then post-mortgage reinvestment |
| `app.js` | DOM controller: input formatting, debounced live updates, localStorage persistence, `calculate()`, all render functions |
| `style.css` | KashVector design system (`--kv-*` CSS vars), light/dark mode via `html:not(.dark)` overrides |

### Calc function signatures

```js
superProjection({ salary, currentAge, retirementAge, monthlyPreTax, employerSuperRate,
                  currentSuperBalance, totalReturn, dividendYield,
                  carryForwardTotal, carryForwardPerYear })
// → { snapshots[{year,age,superBalance}], finalBalance, contributionsTaxRate,
//     div293Applies, div296Applies, div296TotalTax, capBreached, annualTaxSaving,
//     netAnnualContribution, employerAnnualContribution, superAfterTaxReturn,
//     carryForwardEligible, effectiveCarryForward, carryForwardYears }

etfProjection({ salary, currentAge, retirementAge, monthlyPreTax,
                currentPortfolioBalance, totalReturn, dividendYield, frankingPct })
// → { snapshots[{year,age,portfolio,etfAfterTax}], finalPortfolio, finalAfterTax,
//     cgt, netAnnualContribution, mr }

offsetProjection({ salary, currentAge, retirementAge, monthlyPreTax,
                   mortgageBalance, mortgageRate, mortgageTerm, totalReturn, dividendYield,
                   postPayoffMode })
// → { snapshots[{year,age,offsetBalance,mortgageBalance,interestSaved}],
//     finalWealth, mortgagePhaseWealth, totalInterestSaved, annualContribution,
//     mortgagePaidOffYear, mr, afterTaxReturn, postPayoffReturn, postPayoffMode,
//     termSavedYears, effectiveTermYears, originalTermYears, interestSavedOverLife, monthlyRepayment }
```

### Key tax model details

- **Comparison basis:** super gets the pre-tax sacrifice amount (taxed at 15%/30%); ETF and offset receive the after-tax equivalent (`monthlyPreTax * 12 * (1 - marginalRate)`)
- **Div 293:** assessment base = `salary + employerAnnual` (sacrifice nets out); extra 15% applies to `min(totalConcessional, div293Base - $250k)`
- **Div 296 (from 1 July 2026):** extra tax on super earnings for balances above $3M — 15% extra on earnings in $3M–$10M tier, 25% extra above $10M; applied annually inside the projection loop
- **Carry-forward concessional cap:** only available when `currentSuperBalance < CARRY_FORWARD_TSB_THRESHOLD` ($500k). `carryForwardTotal` is the total pool of unused cap from the past 5 years; `carryForwardPerYear` is the annual drawdown. Each projection year reduces `remainingCF` by `min(annualCFUse, remainingCF)` until exhausted. `capAmounts(cap)` helper computes net/employer contributions at any effective cap. UI shows ineligible banner when TSB ≥ $500k. `capBreached` reflects the ongoing (post-CF-exhausted) cap — used for the warning banner.
- **ETF cost base:** reinvested net dividends increase cost base each year (prevents CGT overstatement at retirement)
- **Offset model:** month-by-month amortisation computes effective payoff date; `mortgagePhaseWealth` (fixed, captured at payoff) vs `finalWealth` (changes with `postPayoffMode`); post-payoff reinvestment in 'etf' or 'super' mode
- **Super earnings:** income taxed at 15%, capital gains at 10% (2/3 inclusion × 15%)
- **2026-27 income tax brackets** applied in `utils.js` `marginalRate()`

### KashVector design conventions

- `fmtM(v)` for chart labels and table cells; `fmt(v)` for card values
- Chart.js: always `destroy()` before recreating; pin Y-axis width with `afterFit: scale => { scale.width = 88; }`; bind `yearDetails` toggle → `chart.resize()` once in `DOMContentLoaded`
- localStorage key: `kv_super_compare_inputs`
- CSS colour tokens: `--kv-super: #3b82f6` (blue), `--kv-pass: #22c55e` (green/ETF), `--kv-warn: #f59e0b` (amber/offset)
