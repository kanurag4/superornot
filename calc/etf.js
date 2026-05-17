// ETF/stocks portfolio projection engine.
// Pure function — zero DOM access.
//
// Depends on globals (loaded before this file in the browser):
//   config.js  → CGT_INFLATION_RATE, CGT_MIN_RATE
//   utils.js   → marginalRate(income)
//
// inputs:
//   salary                 - annual pre-tax salary ($) — used to derive marginal rate
//   currentAge             - integer
//   retirementAge          - integer
//   monthlyPreTax          - pre-tax monthly amount being redirected ($)
//   currentPortfolioBalance - existing portfolio balance ($); assumed purchased at current market value
//   totalReturn            - expected annual total return, decimal e.g. 0.08
//   dividendYield          - income (dividends) portion of return, decimal e.g. 0.04
//   frankingPct            - fraction of dividends that are franked, decimal e.g. 0.70

function etfProjection(inputs) {
  const {
    salary                  = 0,
    currentAge              = 0,
    retirementAge           = 60,
    monthlyPreTax           = 0,
    currentPortfolioBalance = 0,
    totalReturn             = 0,
    dividendYield           = 0,
    frankingPct             = 0,
  } = inputs;

  const years = retirementAge - currentAge;

  // --- Marginal rate ---
  const mr = marginalRate(salary);

  // --- After-tax annual contribution ---
  // The ETF strategy invests the after-tax equivalent of the pre-tax sacrifice amount.
  // Uses bracket-aware taxOnSacrifice to handle threshold crossings correctly.
  const afterTaxContribution = monthlyPreTax * 12 - taxOnSacrifice(salary, monthlyPreTax * 12);

  // --- Edge cases ---
  if (years <= 0) {
    return {
      snapshots: [],
      finalPortfolio: currentPortfolioBalance,
      finalAfterTax: currentPortfolioBalance,
      cgt: 0,
      netAnnualContribution: afterTaxContribution,
      mr,
    };
  }
  if (monthlyPreTax === 0 && currentPortfolioBalance === 0) {
    return {
      snapshots: [],
      finalPortfolio: 0,
      finalAfterTax: 0,
      cgt: 0,
      netAnnualContribution: afterTaxContribution,
      mr,
    };
  }

  // --- Year-by-year projection ---
  // Contribution assumed at start of year, then earnings applied.
  // indexedCostBase inflates by CGT_INFLATION_RATE each year, which correctly assigns each
  // contribution's holding period: year-1 funds are indexed `years` times, year-Y funds once.
  const snapshots = [];
  let portfolio       = currentPortfolioBalance;
  let costBase        = currentPortfolioBalance;
  let indexedCostBase = currentPortfolioBalance;

  for (let y = 1; y <= years; y++) {
    portfolio       += afterTaxContribution;
    costBase        += afterTaxContribution;
    indexedCostBase += afterTaxContribution;

    const grossDividend  = portfolio * dividendYield;
    const frankingCredit = grossDividend * frankingPct * (30 / 70);
    const taxableIncome  = grossDividend + frankingCredit;
    const taxOnDividend  = taxableIncome * mr - frankingCredit;
    const netDividend    = grossDividend - taxOnDividend;
    const capitalGrowth  = portfolio * (totalReturn - dividendYield);

    portfolio       += capitalGrowth + netDividend;
    costBase        += netDividend;
    indexedCostBase += netDividend;

    // Inflate indexed cost base by one year — carries forward correctly for all prior contributions.
    indexedCostBase *= (1 + CGT_INFLATION_RATE);

    const unrealisedGain = Math.max(0, portfolio - indexedCostBase);
    const estimatedCGT   = unrealisedGain * Math.max(CGT_MIN_RATE, mr);
    const etfAfterTax    = portfolio - estimatedCGT;

    snapshots.push({ year: y, age: currentAge + y, portfolio, etfAfterTax });
  }

  // --- At retirement: apply true CGT (2026 budget rules) ---
  const capitalGain   = Math.max(0, portfolio - indexedCostBase);
  const cgt           = capitalGain * Math.max(CGT_MIN_RATE, mr);
  const finalAfterTax = portfolio - cgt;

  return {
    snapshots,
    finalPortfolio: portfolio,
    finalAfterTax,
    cgt,
    netAnnualContribution: afterTaxContribution,
    mr,
  };
}

if (typeof module !== 'undefined') module.exports = { etfProjection };
