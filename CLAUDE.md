# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Source for the **Salary Sacrifice Calculator** KashVector tool — compares three strategies for redirecting pre-tax salary: superannuation salary sacrifice, ETF/stock investing, and mortgage offset. Australian tax model including Division 293, Division 296, 2026-27 income tax brackets, carry-forward concessional contributions, franking credits, CGT indexation (post-budget assets), and super earnings tax.

## Development and deployment

**No build step.** Vanilla JS served directly by the browser.

**Keep the source repo and the deployed copy in sync.** They drifted apart once already (deployed `www/super-compare/` picked up `kv-scenario.js` wiring, a copy-link button, a Sharesight affiliate block, and updated SEO meta that this source repo lacked for weeks) — always check `diff` against `C:\Projects\StockAnalysis\www\super-compare\` before starting new work if it's been a while since the last deploy.

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
/kv-theme.js → /kv-scenario.js (both in <head>) → /kv-nav.js → config.js → utils.js → calc/super.js → calc/etf.js → calc/offset.js → Chart.js CDN → app.js
```
`kv-nav.js` and `kv-scenario.js` are loaded from the site root and 404 during local dev (no parent site) but work correctly on the deployed domain. `kv-nav.js` injects the cross-tool navigation bar after the `<header>`. `kv-scenario.js` provides `window.kvScenario` — scenario-link URL params, the shared cross-tool profile (localStorage key `kv-profile`), and the "next step" suggestion card. See the Cross-tool UX section below.

### File responsibilities

| File | Role |
|---|---|
| `config.js` | Constants: tax rates, caps, thresholds (`CONCESSIONAL_CAP`, `CARRY_FORWARD_TSB_THRESHOLD`, `DIV293_THRESHOLD`, `DIV296_LSBT`, `DIV296_VLSBT`, `DEFAULT_EMPLOYER_SUPER_RATE`, `CGT_INFLATION_RATE`, etc.) |
| `utils.js` | Pure helpers: `marginalRate()`, `incomeTax()`, `taxOnSacrifice()`, `fmt()`, `fmtM()`, `parseMoney()`, `formatMoneyVal()`, `formatMoneyInput()`, `safe()` |
| `calc/super.js` | `superProjection(inputs)` — super accumulation with Div 293, Div 296, employer contributions, concessional cap check, carry-forward concessional cap |
| `calc/etf.js` | `etfProjection(inputs)` — ETF portfolio with franking credits, CGT cost base tracking |
| `calc/offset.js` | `offsetProjection(inputs)` — mortgage offset phase then post-mortgage reinvestment |
| `app.js` | DOM controller: input formatting, debounced live updates + live recalculation, localStorage persistence, `calculate()`, all render functions, display-transform helpers (`deflate()`, `pickWinner()`), cross-tool scenario/profile wiring |
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
- localStorage key: `kv_super_compare_inputs` — every input value, `carryForwardEnabled`, the three display toggles (`realDollarsToggle`, `sensitivityToggle`, `splitToggle`), and `postPayoffMode`. `restoreInputs()` sets DOM state generically from the saved keys, then explicitly re-syncs the `realDollars`/`showSensitivity`/`showSplit`/`postPayoffMode` module-level globals from it — those globals are what `calculate()` actually reads, so any new persisted toggle needs both halves.
- CSS colour tokens: `--kv-super: #3b82f6` (blue), `--kv-pass: #22c55e` (green/ETF), `--kv-warn: #f59e0b` (amber/offset), `#818cf8` (purple/50-50 split overlay)

### Display-option toggles (`realDollars`, `showSensitivity`, `showSplit`)

Three checkboxes above the results, all default off, all trigger a silent `calculate(true)` on change:

- **`realDollars`** — deflates every *point-in-time retirement-year* dollar figure by `CGT_INFLATION_RATE` (2%/yr) via the `deflate(value, yearsFromNow)` helper: wealth cards, the verdict line, each chart/table point (deflated by its own elapsed year, not the total horizon), the sensitivity card, the split note, and the Offset Insights card's `finalWealth`/`remainingBalanceAtRetirement`. **Never applied** to per-year flows (contributions, carry-forward amounts) or lifetime-cumulative totals (`interestSavedOverLife`) — those would need a full year-by-year deflate-and-sum to be correct, so they stay nominal and the UI says so next to the figure. When adding any new retirement-year dollar display, route it through `deflate()` or it will silently disagree with the wealth cards once a user has both a mortgage and this toggle on — this exact bug shipped once and was caught in peer review.
- **`showSensitivity`** — reruns all three projections at `totalReturn ± 2%` (via `runReturnScenario()`) and reports whether the winning strategy flips. Only computed when the toggle is on, to avoid tripling the projection work on every keystroke.
- **`showSplit`** — via `computeSplitResult()`, runs Super at half the monthly contribution plus Offset-or-ETF (whichever applies, based on `mortgageBalance > 0`) at the other half, sums them year-by-year, and adds a dashed 4th line to the chart plus a text comparison against the single best strategy.

### Silent vs. interactive calculation

`calculate(silent = false)` — `silent` skips `scrollResultsIntoView()`. Called with `silent=true` for: live recalculation as the user types (`scheduleLiveUpdate()`, 300ms debounce, gated by a `hasCalculated` flag so first-time visitors still must click Calculate), the `postPayoffMode` dropdown, all three display toggles, and auto-calculate on page load when arriving via a scenario link or with valid restored inputs. Called with the default `silent=false` only from the Calculate button itself. `showPlaceholder(message)` (used by the salary-empty and retirementAge≤currentAge guards) also hides all five warning banners — they live outside `#results` so a successful calculation's banners would otherwise persist over a placeholder shown by a later failed guard.

### Cross-tool UX (`kv-scenario.js`)

`FIELD_MAP` in `app.js` maps `salary`/`superBalance`/`mortgageBalance`/`mortgageRate` to scenario-link URL params and shared-profile keys (localStorage `kv-profile`, shared across KashVector tools). `touchedProfileFields` tracks genuine user edits so an untouched field never overwrites another tool's legitimately-saved profile value — only set `true` inside real `input` event handlers, never inside `restoreInputs()`/`applyScenarioParams()`/`applyProfilePrefill()`. The "next step" suggestion card links to the FIRE calculator, carrying `superBalance` only (Super Compare's headline output — net extra contribution — has no counterpart field in FIRE's own `FIELD_MAP`).
