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
//   carryForwardTotal   - total unused concessional cap available from past 5 years ($, default 0)
//   carryForwardPerYear - amount of carry-forward to draw down each year ($, default 0)
//                         Both only applied when currentSuperBalance < CARRY_FORWARD_TSB_THRESHOLD ($500k)

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
    carryForwardTotal   = 0,
    carryForwardPerYear = 0,
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

  const mr = marginalRate(salary);

  const sacrificeStandardTax = annualSacrifice * STANDARD_CONTRIBUTIONS_TAX;
  // Div 293 share is capped at sacrifice × 15% to avoid over-attributing the liability.
  const sacrificeDiv293Tax   = Math.min(div293ExtraTax, annualSacrifice * DIV293_EXTRA_TAX);

  // --- Concessional cap ---
  // Carry-forward only applies when TSB at prior 30 June was under $500k (ATO rule).
  // We use currentSuperBalance as the proxy — close enough for projection purposes.
  const carryForwardEligible = currentSuperBalance < CARRY_FORWARD_TSB_THRESHOLD;
  const availableCF  = carryForwardEligible ? Math.max(0, carryForwardTotal)   : 0;
  const annualCFUse  = carryForwardEligible ? Math.max(0, carryForwardPerYear) : 0;

  // Year 1 boost — used for tax-saving display and result card note.
  const boost1            = Math.min(annualCFUse, availableCF);
  const effectiveCarryForward = boost1;
  const carryForwardYears = annualCFUse > 0 ? Math.ceil(availableCF / annualCFUse) : 0;

  // Helper: compute after-cap-tax contribution amounts for a given effective cap.
  function capAmounts(cap) {
    const excess      = Math.max(0, totalConcessional - cap);
    const extraTax    = excess * Math.max(0, mr - STANDARD_CONTRIBUTIONS_TAX);
    const sacExtraTax = totalConcessional > 0 ? extraTax * (annualSacrifice / totalConcessional) : 0;
    return {
      netContrib: annualSacrifice - sacrificeStandardTax - sacrificeDiv293Tax - sacExtraTax,
      empContrib: employerAnnual * (1 - STANDARD_CONTRIBUTIONS_TAX) - (extraTax - sacExtraTax),
    };
  }

  // Ongoing (no carry-forward) amounts — returned for reference and used when CF exhausted.
  const { netContrib: netAnnualContribution, empContrib: employerAnnualContribution } = capAmounts(CONCESSIONAL_CAP);

  // capBreached reflects the ongoing situation (when carry-forward is exhausted) — used for banner.
  const capBreached = totalConcessional > CONCESSIONAL_CAP;

  // Effective contributions tax rate — computed on within-cap sacrifice for Year 1 display.
  const withinCapSacrifice = totalConcessional > 0
    ? annualSacrifice * Math.min(totalConcessional, CONCESSIONAL_CAP + boost1) / totalConcessional
    : annualSacrifice;
  const effectiveContributionsTaxRate = withinCapSacrifice > 0
    ? (withinCapSacrifice * STANDARD_CONTRIBUTIONS_TAX + sacrificeDiv293Tax) / withinCapSacrifice
    : STANDARD_CONTRIBUTIONS_TAX;

  // --- After-tax return inside super ---
  // Income (dividends/interest): taxed at 15%
  // Capital gains (held >12 months): 15% × 2/3 = 10% effective
  // Excludes Div 296 — that additional tax is applied year-by-year in the projection loop
  // because it varies with the balance. totalReturn and dividendYield are gross (pre-tax) inputs.
  const superAfterTaxReturn =
    dividendYield * (1 - SUPER_EARNINGS_INCOME_TAX) +
    (totalReturn - dividendYield) * (1 - SUPER_CGT_TAX);

  // Only within-cap sacrifice has a concessional advantage; uses bracket-aware tax for threshold crossings.
  const annualTaxSaving = taxOnSacrifice(salary, withinCapSacrifice)
    - withinCapSacrifice * effectiveContributionsTaxRate;

  // --- Edge case: no projection period ---
  if (years <= 0) {
    return {
      snapshots: [],
      finalBalance: currentSuperBalance,
      contributionsTaxRate: effectiveContributionsTaxRate,
      div293Applies,
      div296Applies: false,
      div296TotalTax: 0,
      netAnnualContribution,
      employerAnnualContribution,
      annualTaxSaving,
      superAfterTaxReturn,
      capBreached,
      carryForwardEligible,
      effectiveCarryForward,
      carryForwardYears,
    };
  }

  // --- Year-by-year projection ---
  // contributions assumed at start of year, then compounded
  const snapshots = [];
  let superBalance = currentSuperBalance;
  let div296Applies = false;
  let div296TotalTax = 0;
  let remainingCF = availableCF;

  for (let y = 1; y <= years; y++) {
    // Draw down carry-forward each year until the pool is exhausted.
    const boost = Math.min(annualCFUse, remainingCF);
    remainingCF = Math.max(0, remainingCF - boost);
    const { netContrib, empContrib } = capAmounts(CONCESSIONAL_CAP + boost);
    const balWithContribs = superBalance + netContrib + empContrib;
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
      const grossEarnings = Math.max(0, balWithContribs * totalReturn); // negative returns incur no Div 296
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
    carryForwardEligible,
    effectiveCarryForward,
    carryForwardYears,
  };
}

if (typeof module !== 'undefined') module.exports = { superProjection };
