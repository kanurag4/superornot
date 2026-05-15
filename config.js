const CONCESSIONAL_CAP = 30000;         // concessional contributions cap (unchanged for 2026-27)
const DIV293_THRESHOLD = 250000;        // income + concessional contributions threshold
const STANDARD_CONTRIBUTIONS_TAX = 0.15;
const DIV293_EXTRA_TAX = 0.15;          // additional tax; total becomes 0.30 for high earners
const SUPER_EARNINGS_INCOME_TAX = 0.15; // tax on income (dividends/interest) inside super
const SUPER_CGT_TAX = 0.10; // 15% tax on 2/3 of gain (1/3 inclusion reduction for assets held >12mo)
const CGT_DISCOUNT = 0.50;             // 50% CGT discount for assets held > 12 months (personal)
const DEFAULT_EMPLOYER_SUPER_RATE = 0.12; // 12% SG rate 2025-26

// Division 296 — Better Targeted Super Concessions (effective 1 July 2026)
const DIV296_LSBT  = 3_000_000;  // large super balance threshold
const DIV296_VLSBT = 10_000_000; // very large super balance threshold
const DIV296_TIER1_EXTRA = 0.15; // extra tax on earnings: $3M–$10M (total earnings tax → 30%)
const DIV296_TIER2_EXTRA = 0.25; // extra tax on earnings: above $10M (total earnings tax → 40%)

if (typeof module !== 'undefined') module.exports = {
  CONCESSIONAL_CAP,
  DIV293_THRESHOLD,
  STANDARD_CONTRIBUTIONS_TAX,
  DIV293_EXTRA_TAX,
  SUPER_EARNINGS_INCOME_TAX,
  SUPER_CGT_TAX,
  CGT_DISCOUNT,
  DEFAULT_EMPLOYER_SUPER_RATE,
  DIV296_LSBT,
  DIV296_VLSBT,
  DIV296_TIER1_EXTRA,
  DIV296_TIER2_EXTRA,
};
