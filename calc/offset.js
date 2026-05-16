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

// Month-by-month amortization: finds actual payoff date and total interest with offset.
function _computeAmortization(balance, annualRate, termYears, afterTaxAnnualContrib) {
  const n = termYears * 12;
  const monthly = annualRate / 12;

  if (balance <= 0 || termYears <= 0) {
    return {
      monthlyRepayment: 0,
      effectiveTermMonths: 0,
      termSavedYears: 0,
      totalInterestWithoutOffset: 0,
      interestSavedOverLife: 0,
    };
  }

  // Standard P&I monthly repayment (PMT formula)
  const pmt = monthly === 0
    ? balance / n
    : balance * monthly * Math.pow(1 + monthly, n) / (Math.pow(1 + monthly, n) - 1);

  const totalInterestWithoutOffset = pmt * n - balance;

  // Simulate month-by-month with offset growing by monthly contribution
  const monthlyContrib = afterTaxAnnualContrib / 12;
  let mortBal = balance;
  let offsetBal = 0;
  let totalInterestWithOffset = 0;
  let effectiveMonths = n;

  for (let m = 1; m <= n; m++) {
    offsetBal += monthlyContrib;
    const effectivePrincipal = Math.max(0, mortBal - offsetBal);
    const interest = effectivePrincipal * monthly;
    totalInterestWithOffset += interest;
    mortBal -= (pmt - interest);
    // Break when the remaining balance hits 0 OR when the offset fully covers the
    // remaining debt (interest has been 0 for this month; remaining payoff months
    // are ceil(mortBal / pmt) which we approximate as current month).
    if (mortBal <= 0 || offsetBal >= mortBal) {
      effectiveMonths = m;
      break;
    }
  }

  return {
    monthlyRepayment: pmt,
    effectiveTermMonths: effectiveMonths,
    termSavedYears: (n - effectiveMonths) / 12,
    totalInterestWithoutOffset,
    interestSavedOverLife: Math.max(0, totalInterestWithoutOffset - totalInterestWithOffset),
  };
}

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
  const mr = marginalRate(salary);
  const afterTaxContribution = monthlyPreTax * 12 * (1 - mr);

  const afterTaxReturn =
    dividendYield * (1 - mr) +
    (totalReturn - dividendYield) * (1 - mr * CGT_DISCOUNT);

  // Amortization: effective payoff date with monthly offset contributions
  const amort = _computeAmortization(
    initialMortgageBalance,
    mortgageRate,
    mortgageTerm,
    afterTaxContribution
  );

  // Post-payoff investment mode: 'etf' (default) or 'super'
  const postPayoffMode = inputs.postPayoffMode || 'etf';

  // Post-payoff contribution and growth rate depend on chosen mode.
  // ETF: after-tax amount grows at personal after-tax return.
  // Super: pre-tax amount is salary-sacrificed (taxed at 15%), grows at super earnings rate.
  const superAfterTaxReturn =
    dividendYield * (1 - SUPER_EARNINGS_INCOME_TAX) +
    (totalReturn - dividendYield) * (1 - SUPER_CGT_TAX);

  const postPayoffContrib = postPayoffMode === 'super'
    ? monthlyPreTax * 12 * (1 - STANDARD_CONTRIBUTIONS_TAX)
    : afterTaxContribution;

  const postPayoffReturn = postPayoffMode === 'super' ? superAfterTaxReturn : afterTaxReturn;

  // Effective payoff year in the projection (ceiling — mortgage phase ends this year)
  const effectivePayoffYr = initialMortgageBalance > 0 && amort.effectiveTermMonths > 0
    ? Math.ceil(amort.effectiveTermMonths / 12)
    : mortgageTerm;

  const zeroResult = {
    snapshots: [],
    finalWealth: 0,
    mortgagePhaseWealth: 0,
    totalInterestSaved: 0,
    annualContribution: afterTaxContribution,
    mortgagePaidOffYear: null,
    mr,
    afterTaxReturn,
    postPayoffReturn,
    postPayoffMode,
    termSavedYears: 0,
    effectiveTermYears: mortgageTerm,
    originalTermYears: mortgageTerm,
    interestSavedOverLife: 0,
    monthlyRepayment: amort.monthlyRepayment,
    remainingBalanceAtRetirement: 0,
    remainingTermAtRetirement: 0,
  };

  if (years <= 0) return zeroResult;
  if (monthlyPreTax === 0 && initialMortgageBalance === 0) return zeroResult;

  // Paid off early = effective payoff year falls within the projection window
  const mortgagePaidOffYear =
    initialMortgageBalance > 0 && effectivePayoffYr < years ? effectivePayoffYr : null;

  const snapshots = [];
  let offsetBalance      = 0;
  let totalInterestSaved = 0;
  let mortgagePhaseWealth = 0; // offset balance at the moment the loan is cleared

  for (let y = 1; y <= years; y++) {
    const age = currentAge + y;

    const inMortgagePhase = initialMortgageBalance > 0 && y <= effectivePayoffYr;

    let interestSaved = 0;

    if (inMortgagePhase) {
      offsetBalance += afterTaxContribution;
      interestSaved       = offsetBalance * mortgageRate;
      totalInterestSaved += interestSaved;
      // Capture balance at the year the mortgage is cleared
      if (y === effectivePayoffYr) mortgagePhaseWealth = offsetBalance;
    } else {
      // Post-mortgage: reinvest using the user-chosen mode (ETF or super).
      offsetBalance += postPayoffContrib;
      offsetBalance  = offsetBalance * (1 + postPayoffReturn);
    }

    snapshots.push({
      year: y,
      age,
      offsetBalance,
      mortgageBalance: inMortgagePhase ? initialMortgageBalance : 0,
      interestSaved,
    });
  }

  // If the mortgage is never paid off within the projection, mortgagePhaseWealth = final balance
  if (!mortgagePaidOffYear) mortgagePhaseWealth = offsetBalance;

  // Remaining mortgage balance at retirement — only meaningful when the loan outlasts retirement.
  // Uses standard amortization: B_k = P*(1+r)^k - PMT*((1+r)^k - 1)/r
  let remainingBalanceAtRetirement = 0;
  let remainingTermAtRetirement = 0;
  if (initialMortgageBalance > 0 && !mortgagePaidOffYear && amort.monthlyRepayment > 0) {
    const k = years * 12;
    const r = mortgageRate / 12;
    const pmt = amort.monthlyRepayment;
    remainingBalanceAtRetirement = r === 0
      ? Math.max(0, initialMortgageBalance - pmt * k)
      : Math.max(0, initialMortgageBalance * Math.pow(1 + r, k) - pmt * (Math.pow(1 + r, k) - 1) / r);
    remainingTermAtRetirement = Math.max(0, mortgageTerm - years);
  }

  return {
    snapshots,
    finalWealth: offsetBalance,       // total at retirement including post-payoff growth
    mortgagePhaseWealth,              // fixed: balance at the moment the loan is cleared
    totalInterestSaved,
    annualContribution: afterTaxContribution,
    mortgagePaidOffYear,
    mr,
    afterTaxReturn,
    postPayoffReturn,
    postPayoffMode,
    termSavedYears: amort.termSavedYears,
    effectiveTermYears: amort.effectiveTermMonths / 12,
    originalTermYears: mortgageTerm,
    interestSavedOverLife: amort.interestSavedOverLife,
    monthlyRepayment: amort.monthlyRepayment,
    remainingBalanceAtRetirement,
    remainingTermAtRetirement,
  };
}

if (typeof module !== 'undefined') module.exports = { offsetProjection };
