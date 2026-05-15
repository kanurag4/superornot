// Superannuation projection engine.
// Pure function — zero DOM access.
//
// Depends on globals (loaded before this file in the browser):
//   config.js  → DIV293_THRESHOLD, STANDARD_CONTRIBUTIONS_TAX, DIV293_EXTRA_TAX,
//                SUPER_EARNINGS_INCOME_TAX, SUPER_CGT_TAX,
//                DIV296_LSBT, DIV296_VLSBT, DIV296_TIER1_EXTRA, DIV296_TIER2_EXTRA
//   utils.js   → marginalRate(income)
//
// inputs:
//   salary              - annual pre-tax salary ($)
//   currentAge          - integer
//   retirementAge       - integer (typically 60)
//   monthlyPreTax       - monthly pre-tax salary sacrifice to super ($)
//   employerSuperRate   - decimal e.g. 0.115
//   currentSuperBalance - existing super balance ($)
//   totalReturn         - expected annual total return, decimal e.g. 0.08
//   dividendYield       - income (dividends/interest) portion of return, decimal e.g. 0.04

function superProjection(inputs) {
  const {
    salary             = 0,
    currentAge         = 0,
    retirementAge      = 60,
    monthlyPreTax      = 0,
    employerSuperRate  = 0,
    currentSuperBalance = 0,
    totalReturn        = 0,
    dividendYield      = 0,
  } = inputs;

  const years = retirementAge - currentAge;

  // --- Contributions tax ---
  const annualSacrifice = monthlyPreTax * 12;
  const employerAnnual = salary * employerSuperRate;          // gross employer contribution
  const totalConcessional = annualSacrifice + employerAnnual; // both sacrifice + employer

  // Div 293: base = salary + employer contributions (sacrifice nets out)
  const div293Base = salary + employerAnnual;
  const div293Applies = div293Base > DIV293_THRESHOLD;
  const div293Taxable = div293Applies
    ? Math.min(totalConcessional, div293Base - DIV293_THRESHOLD)
    : 0;
  const div293ExtraTax = Math.max(0, div293Taxable) * DIV293_EXTRA_TAX;

  // Standard 15% contributions tax on sacrifice (employer contributions use same rate)
  const sacrificeStandardTax = annualSacrifice * STANDARD_CONTRIBUTIONS_TAX;
  const netAnnualContribution = annualSacrifice - sacrificeStandardTax -
    Math.min(div293ExtraTax, annualSacrifice * DIV293_EXTRA_TAX);
  // Modelling approximation: Div 293 is assessed on total concessional contributions; the sacrifice's
  // share is capped at sacrifice × 15% to avoid over-attributing the liability to the sacrifice alone.

  // Employer contribution net (standard 15% only — employer contributions never get marginal rate)
  const employerAnnualContribution = employerAnnual * (1 - STANDARD_CONTRIBUTIONS_TAX);

  // Effective contributions tax rate on sacrifice (for display)
  const sacrificeDiv293Tax = Math.min(div293ExtraTax, annualSacrifice * DIV293_EXTRA_TAX);
  const effectiveContributionsTaxRate = annualSacrifice > 0
    ? (sacrificeStandardTax + sacrificeDiv293Tax) / annualSacrifice
    : STANDARD_CONTRIBUTIONS_TAX;

  // --- After-tax return inside super ---
  // Income (dividends/interest): taxed at 15%
  // Capital gains (held >12 months): 15% × 2/3 = 10% effective
  // Excludes Div 296 — that additional tax is applied year-by-year in the projection loop
  // because it varies with the balance. totalReturn and dividendYield are gross (pre-tax) inputs.
  const superAfterTaxReturn =
    dividendYield * (1 - SUPER_EARNINGS_INCOME_TAX) +
    (totalReturn - dividendYield) * (1 - SUPER_CGT_TAX);

  // --- Annual tax saving vs paying marginal rate on the sacrifice ---
  const mr = marginalRate(salary);
  const annualTaxSaving = (mr - effectiveContributionsTaxRate) * annualSacrifice;

  // --- Concessional cap check ---
  const capBreached = totalConcessional > CONCESSIONAL_CAP;

  // --- Edge case: no projection period ---
  if (years <= 0) {
    return {
      snapshots: [],
      finalBalance: 0,
      contributionsTaxRate: effectiveContributionsTaxRate,
      div293Applies,
      netAnnualContribution,
      employerAnnualContribution,
      annualTaxSaving,
      superAfterTaxReturn,
      capBreached,
    };
  }

  // --- Year-by-year projection ---
  // contributions assumed at start of year, then compounded
  const snapshots = [];
  let superBalance = currentSuperBalance;
  let div296Applies = false;
  let div296TotalTax = 0;

  for (let y = 1; y <= years; y++) {
    const balWithContribs = superBalance + netAnnualContribution + employerAnnualContribution;
    const afterTaxEarnings = balWithContribs * superAfterTaxReturn;

    // Div 296: annual additional tax on gross earnings for the portion of balance in each tier.
    // The ATO assesses this each financial year (30 June TSB comparison). totalReturn is gross,
    // so div296Tax is computed on the same gross base that superAfterTaxReturn was derived from —
    // the two are additive, not overlapping.
    // Proportional split is valid under uniform-return assumption: earnings are attributed to each
    // dollar of balance equally, so tier fractions x gross earnings = tier earnings.
    let div296Tax = 0;
    if (balWithContribs > DIV296_LSBT) {
      div296Applies = true;
      const grossEarnings = balWithContribs * totalReturn;
      const tier1Amount = Math.min(balWithContribs, DIV296_VLSBT) - DIV296_LSBT;
      const tier2Amount = Math.max(0, balWithContribs - DIV296_VLSBT);
      div296Tax = grossEarnings * (
        (tier1Amount / balWithContribs) * DIV296_TIER1_EXTRA +
        (tier2Amount / balWithContribs) * DIV296_TIER2_EXTRA
      );
      div296TotalTax += div296Tax; // sum of annual assessments across the projection horizon
    }

    superBalance = balWithContribs + afterTaxEarnings - div296Tax;
    snapshots.push({ year: y, age: currentAge + y, superBalance });
  }

  return {
    snapshots,
    finalBalance: superBalance,
    contributionsTaxRate: effectiveContributionsTaxRate,
    div293Applies,
    div296Applies,
    div296TotalTax,
    netAnnualContribution,
    employerAnnualContribution,
    annualTaxSaving,
    superAfterTaxReturn,
    capBreached,
  };
}

if (typeof module !== 'undefined') module.exports = { superProjection };
