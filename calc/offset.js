// Mortgage offset account projection engine.
// Pure function — zero DOM access.
//
// Depends on globals (loaded before this file in the browser):
//   config.js  → CGT_DISCOUNT
//   utils.js   → marginalRate(income)
//
// inputs:
//   salary          - annual pre-tax salary ($)
//   currentAge      - integer
//   retirementAge   - integer
//   monthlyPreTax   - pre-tax monthly amount being redirected ($)
//   mortgageBalance - current mortgage outstanding ($)
//   mortgageRate    - decimal e.g. 0.06 (6% p.a.)
//   mortgageTerm    - remaining years on mortgage
//   totalReturn     - decimal — after-mortgage payoff, money reinvests at this rate
//   dividendYield   - decimal — for post-mortgage reinvestment after-tax return

function offsetProjection(inputs) {
  const {
    salary          = 0,
    currentAge      = 0,
    retirementAge   = 60,
    monthlyPreTax   = 0,
    mortgageBalance: initialMortgageBalance = 0,
    mortgageRate    = 0,
    mortgageTerm    = 0,
    totalReturn     = 0,
    dividendYield   = 0,
  } = inputs;

  const years = retirementAge - currentAge;

  // --- Marginal rate ---
  const mr = marginalRate(salary);

  // --- After-tax annual contribution ---
  // Offset strategy receives the after-tax equivalent of the pre-tax amount.
  const afterTaxContribution = monthlyPreTax * 12 * (1 - mr);

  // --- After-tax return for post-mortgage reinvestment phase ---
  // Income portion taxed at marginal rate; capital gains use 50% CGT discount.
  const afterTaxReturn =
    dividendYield * (1 - mr) +
    (totalReturn - dividendYield) * (1 - mr * CGT_DISCOUNT);

  // --- Edge cases ---
  const zeroResult = {
    snapshots: [],
    finalWealth: 0,
    totalInterestSaved: 0,
    annualContribution: afterTaxContribution,
    mortgagePaidOffYear: null,
    mr,
  };

  if (years <= 0) return zeroResult;
  if (monthlyPreTax === 0 && initialMortgageBalance === 0) return zeroResult;

  // --- Year-by-year projection ---
  // Contribution assumed at start of year, then earnings/savings applied.
  const snapshots = [];
  let offsetBalance      = 0;
  let totalInterestSaved = 0;

  // Mortgage runs for its full term — balance is not dynamically reduced.
  // mortgagePaidOffYear is fixed at mortgageTerm (or null if term outlasts projection).
  const mortgagePaidOffYear =
    initialMortgageBalance > 0 && mortgageTerm < years ? mortgageTerm : null;

  for (let y = 1; y <= years; y++) {
    const age = currentAge + y;

    // Add contribution at start of year (matches super.js / etf.js convention).
    offsetBalance += afterTaxContribution;

    const inMortgagePhase     = initialMortgageBalance > 0 && y <= mortgageTerm;
    const inReinvestmentPhase = !inMortgagePhase;

    let interestSaved = 0;

    if (inMortgagePhase) {
      // Interest saved = offset balance * mortgage rate (tax-free benefit).
      // The mortgage balance is NOT reduced — it runs its full term.
      interestSaved       = offsetBalance * mortgageRate;
      totalInterestSaved += interestSaved;
    } else if (inReinvestmentPhase) {
      // Post-mortgage phase: offset balance earns investment returns.
      // Contribution was already added above; now apply growth for the year.
      offsetBalance = offsetBalance * (1 + afterTaxReturn);
    }

    snapshots.push({
      year: y,
      age,
      offsetBalance,
      mortgageBalance: inMortgagePhase ? initialMortgageBalance : 0,
      interestSaved,
    });
  }

  return {
    snapshots,
    finalWealth: offsetBalance,
    totalInterestSaved,
    annualContribution: afterTaxContribution,
    mortgagePaidOffYear,
    mr,
  };
}

if (typeof module !== 'undefined') module.exports = { offsetProjection };
