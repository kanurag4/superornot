// ETF/stocks portfolio projection engine.
// Pure function — zero DOM access.
//
// Depends on globals (loaded before this file in the browser):
//   config.js  → CGT_DISCOUNT
//   utils.js   → marginalRate(income)
//
// inputs:
//   salary          - annual pre-tax salary ($) — used to derive marginal rate
//   currentAge      - integer
//   retirementAge   - integer
//   monthlyPreTax   - pre-tax monthly amount being redirected ($)
//   totalReturn     - expected annual total return, decimal e.g. 0.08
//   dividendYield   - income (dividends) portion of return, decimal e.g. 0.04
//   frankingPct     - fraction of dividends that are franked, decimal e.g. 0.70

function etfProjection(inputs) {
  const {
    salary         = 0,
    currentAge     = 0,
    retirementAge  = 60,
    monthlyPreTax  = 0,
    totalReturn    = 0,
    dividendYield  = 0,
    frankingPct    = 0,
  } = inputs;

  const years = retirementAge - currentAge;

  // --- Marginal rate ---
  const mr = marginalRate(salary);

  // --- After-tax annual contribution ---
  // The ETF strategy invests the after-tax equivalent of the pre-tax sacrifice amount.
  const afterTaxContribution = monthlyPreTax * 12 * (1 - mr);

  // --- Edge cases: no projection period or no contribution ---
  if (years <= 0 || monthlyPreTax === 0) {
    return {
      snapshots: [],
      finalPortfolio: 0,
      finalAfterTax: 0,
      cgt: 0,
      annualContribution: afterTaxContribution,
      mr,
    };
  }

  // --- Year-by-year projection ---
  // Contribution assumed at start of year, then earnings applied.
  const snapshots = [];
  let portfolio = 0;
  let costBase  = 0;

  for (let y = 1; y <= years; y++) {
    // Add contribution at start of year
    portfolio += afterTaxContribution;
    costBase  += afterTaxContribution;

    // Annual earnings
    const grossDividend  = portfolio * dividendYield;
    const frankingCredit = grossDividend * frankingPct * (30 / 70);
    const taxableIncome  = grossDividend + frankingCredit;
    const taxOnDividend  = taxableIncome * mr - frankingCredit;
    const netDividend    = grossDividend - Math.max(0, taxOnDividend);   // franking refund possible
    const capitalGrowth  = portfolio * (totalReturn - dividendYield);

    portfolio += capitalGrowth + netDividend;

    // Mid-year "if sold today" estimate (for chart)
    const unrealisedGain = Math.max(0, portfolio - costBase);
    const estimatedCGT   = unrealisedGain * CGT_DISCOUNT * mr;
    const etfAfterTax    = portfolio - estimatedCGT;

    snapshots.push({
      year: y,
      age: currentAge + y,
      portfolio,
      etfAfterTax,
    });
  }

  // --- At retirement: apply true CGT ---
  const capitalGain  = Math.max(0, portfolio - costBase);
  const cgt          = capitalGain * CGT_DISCOUNT * mr;
  const finalAfterTax = portfolio - cgt;

  return {
    snapshots,
    finalPortfolio: portfolio,
    finalAfterTax,
    cgt,
    annualContribution: afterTaxContribution,
    mr,
  };
}

if (typeof module !== 'undefined') module.exports = { etfProjection };
