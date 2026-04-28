// Superannuation projection engine.
// Pure function — zero DOM access.
//
// Depends on globals (loaded before this file in the browser):
//   config.js  → DIV293_THRESHOLD, STANDARD_CONTRIBUTIONS_TAX, DIV293_EXTRA_TAX,
//                SUPER_EARNINGS_INCOME_TAX, SUPER_CGT_TAX
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
  // Note: div293 extra tax is shared across total concessional; sacrifice portion = min(div293ExtraTax, sacrifice * 0.15)

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

  for (let y = 1; y <= years; y++) {
    superBalance = (superBalance + netAnnualContribution + employerAnnualContribution) * (1 + superAfterTaxReturn);
    snapshots.push({
      year: y,
      age: currentAge + y,
      superBalance,
    });
  }

  return {
    snapshots,
    finalBalance: superBalance,
    contributionsTaxRate: effectiveContributionsTaxRate,
    div293Applies,
    netAnnualContribution,
    employerAnnualContribution,
    annualTaxSaving,
    superAfterTaxReturn,
    capBreached,
  };
}

if (typeof module !== 'undefined') module.exports = { superProjection };
