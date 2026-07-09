// app.js — DOM controller for the super-compare KashVector calculator.
// ONLY file allowed to touch the DOM, window, or localStorage.
// Zero calculation logic — all calc is delegated to pure functions in calc/*.js.

// ─── Post-payoff investment mode (persisted with the rest of the inputs) ─────

let postPayoffMode = 'etf';

// ─── Result display options (persisted; default off) ────────────────────────

let realDollars      = false; // deflate retirement-year figures by CGT_INFLATION_RATE p.a.
let showSensitivity   = false; // show a ±2% return sensitivity check
let showSplit         = false; // show a 50/50 split comparison line/note

// Tracks whether a real calculation has run yet — gates silent live recalculation
// so first-time visitors still have to click Calculate, per design intent.
let hasCalculated = false;

// ─── Carry-forward toggle ─────────────────────────────────────────────────────

function toggleCarryForward() {
  const enabled = document.getElementById('carryForwardEnabled').checked;
  document.getElementById('carryForwardFields').classList.toggle('hidden', !enabled);
  saveInputs();
  scheduleLiveUpdate();
}

function setPostPayoffMode(val) {
  postPayoffMode = val;
  saveInputs();
  calculate(true); // silent — results are already in view, no need to scroll
}

// Note: no explicit saveInputs() here — the blanket 'input' listener bound to
// every <input> in DOMContentLoaded already covers these checkboxes.
function toggleRealDollars() {
  realDollars = document.getElementById('realDollarsToggle').checked;
  if (hasCalculated) calculate(true);
}

function toggleSensitivity() {
  showSensitivity = document.getElementById('sensitivityToggle').checked;
  if (hasCalculated) calculate(true);
}

function toggleSplit() {
  showSplit = document.getElementById('splitToggle').checked;
  if (hasCalculated) calculate(true);
}

// ─── localStorage persistence ────────────────────────────────────────────────

const LS_KEY = 'kv_super_compare_inputs';

// ─── Cross-tool scenario links & shared profile ──────────────────────────────

const FIELD_MAP = {
  salary:          { param: 'i',  profileKey: 'income' },
  superBalance:    { param: 'sb', profileKey: 'superBalance' },
  mortgageBalance: { param: 'b',  profileKey: 'mortgageBalance' },
  mortgageRate:    { param: 'r',  profileKey: 'mortgageRate' },
};

const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
let scenarioParamsApplied = false;
const hadSavedStateOnLoad = !!localStorage.getItem(LS_KEY); // captured before restoreInputs() runs

// Tracks which shared-profile fields the user has genuinely edited in this
// session. Only touched fields are pushed to the shared profile — this
// prevents an untouched, still-blank field from clobbering a value another
// tool legitimately wrote to the shared profile. Set to true only inside real
// user-input event handlers — never during restoreInputs, applyScenarioParams,
// or applyProfilePrefill, which apply values programmatically rather than via
// genuine user interaction.
const touchedProfileFields = { income: false, superBalance: false, mortgageBalance: false, mortgageRate: false };

function applyScenarioParams() {
  if (isNative || !window.kvScenario) return;
  const params = window.kvScenario.readParams(FIELD_MAP);
  if (Object.keys(params).length === 0) return;
  if (params.salary)          document.getElementById('salary').value          = params.salary;
  if (params.superBalance)    document.getElementById('superBalance').value    = params.superBalance;
  if (params.mortgageBalance) document.getElementById('mortgageBalance').value = params.mortgageBalance;
  if (params.mortgageRate)    document.getElementById('mortgageRate').value    = params.mortgageRate;
  scenarioParamsApplied = true;
}

function applyProfilePrefill() {
  if (isNative || !window.kvScenario || scenarioParamsApplied) return;
  if (hadSavedStateOnLoad) return; // tool's own saved value always wins
  const profile = window.kvScenario.getProfile();
  let prefilled = false;
  if (profile.fields.income) {
    document.getElementById('salary').value = formatMoneyVal(profile.fields.income);
    prefilled = true;
  }
  if (profile.fields.superBalance) {
    document.getElementById('superBalance').value = formatMoneyVal(profile.fields.superBalance);
    prefilled = true;
  }
  if (profile.fields.mortgageBalance) {
    document.getElementById('mortgageBalance').value = formatMoneyVal(profile.fields.mortgageBalance);
    prefilled = true;
  }
  if (profile.fields.mortgageRate) {
    document.getElementById('mortgageRate').value = String(profile.fields.mortgageRate);
    prefilled = true;
  }
  if (prefilled) showPrefillChip();
}

function showPrefillChip() {
  const chip = document.createElement('div');
  chip.className = 'kv-prefill-chip';
  chip.innerHTML = 'Pre-filled from your other tools · <button type="button" id="clearPrefillBtn">clear</button>';
  document.getElementById('salary').closest('.field').insertAdjacentElement('afterend', chip);
  document.getElementById('clearPrefillBtn').addEventListener('click', function () {
    document.getElementById('salary').value          = '';
    document.getElementById('superBalance').value    = '';
    document.getElementById('mortgageBalance').value = '';
    document.getElementById('mortgageRate').value    = '';
    chip.remove();
    saveInputs(); // local-only — never pushes to the shared profile
    updateDerived();
  });
}

function bindCopyLinkButton() {
  const btn = document.getElementById('copyLinkBtn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    const getValue = (inputId) => {
      const el = document.getElementById(inputId);
      return el ? el.value : '';
    };
    const link = window.kvScenario.buildLink(FIELD_MAP, getValue);
    navigator.clipboard.writeText(link).then(function () {
      btn.textContent = '✓ Copied!';
      btn.classList.add('copied');
      setTimeout(function () {
        btn.textContent = '🔗 Create link to share this scenario';
        btn.classList.remove('copied');
      }, 2000);
    });
  });
}

function pushProfileUpdate() {
  if (isNative || !window.kvScenario) return;
  const profileUpdate = {};
  if (touchedProfileFields.income)          profileUpdate.income          = parseMoney(document.getElementById('salary'));
  if (touchedProfileFields.superBalance)    profileUpdate.superBalance    = parseMoney(document.getElementById('superBalance'));
  if (touchedProfileFields.mortgageBalance) profileUpdate.mortgageBalance = parseMoney(document.getElementById('mortgageBalance'));
  if (touchedProfileFields.mortgageRate) {
    const v = parseFloat(document.getElementById('mortgageRate').value);
    profileUpdate.mortgageRate = isFinite(v) ? v : 0;
  }
  if (Object.keys(profileUpdate).length > 0) window.kvScenario.saveProfile(profileUpdate);
}

function saveInputs() {
  const data = {};
  ['salary', 'monthlyPreTax', 'superBalance', 'mortgageBalance',
   'carryForwardTotal', 'carryForwardPerYear'].forEach(id => {
    data[id] = document.getElementById(id).value;
  });
  ['currentAge', 'retirementAge', 'employerRate', 'mortgageRate', 'mortgageTerm',
    'totalReturn', 'dividendYield', 'frankingPct'].forEach(id => {
    data[id] = document.getElementById(id).value;
  });
  data.carryForwardEnabled = document.getElementById('carryForwardEnabled').checked;
  data.realDollarsToggle   = document.getElementById('realDollarsToggle').checked;
  data.sensitivityToggle   = document.getElementById('sensitivityToggle').checked;
  data.splitToggle         = document.getElementById('splitToggle').checked;
  data.postPayoffMode      = postPayoffMode;
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

function restoreInputs() {
  try {
    const data = JSON.parse(localStorage.getItem(LS_KEY));
    if (!data) return;
    Object.keys(data).forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') {
        el.checked = !!data[id];
      } else if (data[id]) {
        el.value = data[id];
      }
    });
    // Show/hide carry-forward sub-fields based on restored checkbox state
    const cfEnabled = document.getElementById('carryForwardEnabled').checked;
    document.getElementById('carryForwardFields').classList.toggle('hidden', !cfEnabled);
    // Sync module-level state from the restored checkboxes/value (the generic
    // loop above only sets DOM state — these globals drive calculate()).
    realDollars     = document.getElementById('realDollarsToggle').checked;
    showSensitivity = document.getElementById('sensitivityToggle').checked;
    showSplit       = document.getElementById('splitToggle').checked;
    if (data.postPayoffMode) postPayoffMode = data.postPayoffMode;
  } catch (e) {
    console.warn('Failed to restore inputs from localStorage:', e);
  }
}

// ─── Live derived updates (debounced) ────────────────────────────────────────

let liveTimer = null;

function scheduleLiveUpdate() {
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => {
    updateDerived();
    // Silent live recalc — only once the user has already calculated once.
    if (hasCalculated) calculate(true);
  }, 300);
}

function updateDerived() {
  const salary = parseMoney(document.getElementById('salary'));
  const monthly = parseMoney(document.getElementById('monthlyPreTax'));
  const empRateRaw = parseFloat(document.getElementById('employerRate').value);
  const empRate = isNaN(empRateRaw) ? DEFAULT_EMPLOYER_SUPER_RATE * 100 : empRateRaw;
  const superBal = parseMoney(document.getElementById('superBalance'));
  const cfEnabled = document.getElementById('carryForwardEnabled').checked;
  const carryForwardTotal = cfEnabled ? parseMoney(document.getElementById('carryForwardTotal')) : 0;
  const carryForwardPerYear = cfEnabled ? parseMoney(document.getElementById('carryForwardPerYear')) : 0;
  const mr = marginalRate(salary);
  const mrPct = Math.round(mr * 100);

  // salaryDerived
  let salaryText = mrPct > 0
    ? `Marginal rate: ${mrPct}% (incl. 2% Medicare)`
    : 'Below tax-free threshold';
  if (salary > DIV293_THRESHOLD) salaryText += ' · Div 293 applies';
  document.getElementById('salaryDerived').textContent = salaryText;

  // afterTaxDerived — bracket-aware: monthly sacrifice may cross a tax threshold
  const taxSavedMonthly = taxOnSacrifice(salary, monthly * 12) / 12;
  const afterTax = monthly - taxSavedMonthly;
  document.getElementById('afterTaxDerived').textContent =
    monthly > 0 ? `After-tax equivalent: ${fmt(afterTax)}/mo` : '';

  // Concessional cap check (live)
  // Use the effective cap: carry-forward raises it for year 1 when TSB < $500k.
  const annualSacrifice = monthly * 12;
  const employerAnnual = salary * (empRate / 100);
  const totalConcessional = annualSacrifice + employerAnnual;
  const carryForwardEligibleLive = superBal < CARRY_FORWARD_TSB_THRESHOLD;
  const boost1Live = carryForwardEligibleLive ? Math.min(carryForwardPerYear, carryForwardTotal) : 0;
  const effectiveLiveCap = CONCESSIONAL_CAP + boost1Live;
  const capLabel = `$${Math.round(effectiveLiveCap).toLocaleString('en-AU')} cap`;
  const capEl = document.getElementById('capDerived');
  if (totalConcessional > effectiveLiveCap) {
    capEl.textContent = `⚠ Employer $${Math.round(employerAnnual).toLocaleString()} + sacrifice $${Math.round(annualSacrifice).toLocaleString()} = $${Math.round(totalConcessional).toLocaleString()} exceeds ${capLabel}`;
    capEl.classList.remove('hidden');
    capEl.classList.remove('derived-info');
  } else if (salary > 0 && totalConcessional < effectiveLiveCap) {
    const remaining = effectiveLiveCap - totalConcessional;
    capEl.textContent = `💡 $${Math.round(remaining).toLocaleString()} of the ${capLabel} unused — consider increasing salary sacrifice to maximise your tax benefit`;
    capEl.classList.remove('hidden');
    capEl.classList.add('derived-info');
  } else {
    capEl.classList.add('hidden');
    capEl.classList.remove('derived-info');
  }

  // Carry-forward hint — only relevant when the sub-fields are visible
  const cfDerived = document.getElementById('carryForwardDerived');
  if (cfEnabled) {
    if (superBal >= CARRY_FORWARD_TSB_THRESHOLD) {
      cfDerived.textContent = '⚠ TSB ≥ $500k — carry-forward rule does not apply';
      cfDerived.classList.remove('derived-info');
    } else if (carryForwardTotal > 0 && carryForwardPerYear > 0) {
      const cfYears = Math.ceil(carryForwardTotal / carryForwardPerYear);
      const capLabel = `$${(CONCESSIONAL_CAP + boost1Live).toLocaleString('en-AU')}`;
      cfDerived.textContent = `Cap: ${capLabel}/yr for ${cfYears} yr${cfYears !== 1 ? 's' : ''} — reverts to $30,000 after`;
      cfDerived.classList.add('derived-info');
    } else {
      cfDerived.textContent = '';
      cfDerived.classList.remove('derived-info');
    }
  } else {
    cfDerived.textContent = '';
    cfDerived.classList.remove('derived-info');
  }
}

// ─── Banner helper ───────────────────────────────────────────────────────────

function toggleBanner(id, show) {
  document.getElementById(id).classList.toggle('hidden', !show);
}

// ─── Display-transform helpers ────────────────────────────────────────────────

// Deflates a future-dollar figure to today's purchasing power using the same
// inflation assumption the ETF/offset CGT indexation already uses (config.js).
// Only applied to point-in-time retirement figures — not to per-year flows
// (contributions, carry-forward amounts) or lifetime-cumulative totals
// (interest saved over the life of the loan), which would need a full
// year-by-year deflation-and-sum to be accurate.
function deflate(value, yearsFromNow) {
  if (!realDollars || !yearsFromNow) return value;
  return value / Math.pow(1 + CGT_INFLATION_RATE, yearsFromNow);
}

// Ranks the applicable strategies by final wealth, highest first. Offset is
// only a real candidate when a mortgage was actually entered — otherwise its
// $0 placeholder would never legitimately "win" or "lose" against the others.
function pickWinner(superFinal, etfFinal, offFinal, mortgageBalance) {
  const candidates = [
    { name: 'Super', value: superFinal },
    { name: 'ETFs', value: etfFinal },
  ];
  if (mortgageBalance > 0) candidates.push({ name: 'Offset', value: offFinal });
  return candidates.sort((a, b) => b.value - a.value);
}

// ─── Comparison-basis note ────────────────────────────────────────────────────

// Explains why the three Year 1 figures aren't directly comparable at face
// value: super receives the pre-tax amount, ETFs/offset receive the after-tax
// equivalent. Without this, the numbers look like an unfair comparison.
function renderBasisNote(salary, monthlyPreTax) {
  const el = document.getElementById('basisNote');
  if (!el) return;
  if (monthlyPreTax <= 0) { el.textContent = ''; return; }
  const mrPct = Math.round(marginalRate(salary) * 100);
  const taxSavedMonthly = taxOnSacrifice(salary, monthlyPreTax * 12) / 12;
  const afterTaxMonthly = monthlyPreTax - taxSavedMonthly;
  el.innerHTML =
    `Each strategy starts from the same ${fmt(monthlyPreTax)}/mo pre-tax. Super receives it directly; ` +
    `ETFs and the mortgage offset receive the after-tax equivalent of ${fmt(afterTaxMonthly)}/mo ` +
    `(after tax at your ${mrPct}% marginal rate) — that's the fair like-for-like comparison.`;
}

// ─── Print-only inputs summary ────────────────────────────────────────────────

function renderPrintInputs(vals) {
  const el = document.getElementById('printInputs');
  if (!el) return;
  const rows = [
    ['Annual salary', fmt(vals.salary)],
    ['Extra amount (pre-tax/mo)', fmt(vals.monthlyPreTax)],
    ['Current age', vals.currentAge],
    ['Retirement age', vals.retirementAge],
    ['Employer super rate', `${(vals.employerSuperRate * 100).toFixed(1)}%`],
    ['Current super balance', fmt(vals.currentSuperBalance)],
    ['Mortgage balance', fmt(vals.mortgageBalance)],
    ['Mortgage rate', `${(vals.mortgageRate * 100).toFixed(1)}%`],
    ['Mortgage term', `${vals.mortgageTerm} yrs`],
    ['Expected return', `${(vals.totalReturn * 100).toFixed(1)}%`],
    ['Dividend yield', `${(vals.dividendYield * 100).toFixed(1)}%`],
    ['Franking', `${(vals.frankingPct * 100).toFixed(0)}%`],
  ];
  el.innerHTML =
    `<div class="card-title">Your inputs</div>` +
    `<div class="print-inputs-grid">` +
    rows.map(([label, value]) =>
      `<div class="print-inputs-label">${label}</div><div class="print-inputs-value">${value}</div>`
    ).join('') +
    `</div>`;
}

// ─── Card rendering ──────────────────────────────────────────────────────────

function renderAnnualCards(superResult, etfResult, offsetResult, mortgageBalance) {
  const container = document.getElementById('annualCards');

  // Super — Year 1 tax saving
  const superValue = fmt(superResult.annualTaxSaving);
  const superSub = superResult.div293Applies
    ? 'Contributions taxed at 30% (Div 293)'
    : 'Contributions taxed at 15%';
  const superCarryNote = superResult.effectiveCarryForward > 0
    ? `<div class="card-sub">Carry-forward: ${fmt(superResult.effectiveCarryForward)}/yr for ${superResult.carryForwardYears} yr${superResult.carryForwardYears !== 1 ? 's' : ''} — cap reverts to $30,000 after</div>`
    : '';

  // ETF — Year 1 net portfolio growth
  let etfValue = fmt(0);
  let etfSub = 'after dividend tax';
  if (etfResult.snapshots.length > 0) {
    const year1Growth = etfResult.snapshots[0].portfolio - etfResult.netAnnualContribution;
    etfValue = fmt(Math.max(0, year1Growth));
  }

  // Offset — Year 1 interest saved
  let offValue = '$0 — no mortgage';
  let offSub = 'tax-free saving';
  if (mortgageBalance > 0 && offsetResult.snapshots.length > 0) {
    offValue = fmt(offsetResult.snapshots[0].interestSaved);
  }

  container.innerHTML =
    `<div class="card summary-card card-super">
      <div class="card-label">Super salary sacrifice</div>
      <div class="card-value">${superValue}</div>
      <div class="card-sub">${superSub}</div>
      ${superCarryNote}
    </div>` +
    `<div class="card summary-card card-etf">
      <div class="card-label">Invest after tax</div>
      <div class="card-value">${etfValue}</div>
      <div class="card-sub">${etfSub}</div>
    </div>` +
    `<div class="card summary-card card-offset">
      <div class="card-label">Mortgage offset</div>
      <div class="card-value">${offValue}</div>
      <div class="card-sub">${offSub}</div>
    </div>`;
}

function renderWealthCards(superResult, superBaseResult, etfResult, offsetResult, currentAge, retirementAge) {
  const container = document.getElementById('wealthCards');
  const years = retirementAge - currentAge;

  // deflate() no-ops when the "today's dollars" toggle is off, so these are
  // nominal figures by default and inflation-adjusted only when requested.
  const superFinal    = deflate(superResult.finalBalance, years);
  const superBaseline = deflate(superBaseResult.finalBalance, years);
  const superAdded    = superFinal - superBaseline;
  const etfFinal      = deflate(etfResult.finalAfterTax, years);

  // Offset card always shows the mortgage-phase-only balance (fixed — does not change with mode).
  // Post-payoff reinvestment total (finalWealth) is shown separately in the insights card.
  const offFinal = deflate(offsetResult.mortgagePhaseWealth, years);

  // Combined "Offset → [mode]" total shown as a supplemental comparison line.
  const combinedTotal = deflate(offsetResult.finalWealth, years);
  const paidOffEarly  = !!offsetResult.mortgagePaidOffYear;
  const activeMode    = offsetResult.postPayoffMode;

  const offSub = offsetResult.mortgagePaidOffYear
    ? `Mortgage cleared year ${offsetResult.mortgagePaidOffYear} · balance at payoff`
    : `Interest saved: ${fmt(offsetResult.interestSavedOverLife)}`;

  const superContribNote = superResult.div293Applies
    ? 'Contributions taxed at 30% (Div 293)'
    : 'Contributions taxed at 15%';
  const wealthCarryNote = superResult.effectiveCarryForward > 0
    ? `<div class="card-sub">Carry-forward: ${fmt(superResult.effectiveCarryForward)}/yr for ${superResult.carryForwardYears} yr${superResult.carryForwardYears !== 1 ? 's' : ''} — cap reverts to $30,000 after</div>`
    : '';

  const superCombinedLine = paidOffEarly && activeMode === 'super'
    ? `<div class="card-sub card-sub-combined">Offset → Super total at retirement: ${fmt(combinedTotal)}</div>`
    : '';
  const etfCombinedLine = paidOffEarly && activeMode === 'etf'
    ? `<div class="card-sub card-sub-combined">Offset → ETF total at retirement: ${fmt(combinedTotal)}</div>`
    : '';

  const maxVal = Math.max(superFinal, etfFinal, offFinal);
  const superWins  = superFinal === maxVal;
  const etfWins    = etfFinal   === maxVal;
  const offsetWins = offFinal   === maxVal;

  container.innerHTML =
    `<div class="card summary-card card-super${superWins ? ' pass' : ''}">
      <div class="card-label">Super</div>
      <div class="card-value">${fmt(superFinal)}</div>
      <div class="card-sub">${superContribNote}</div>
      <div class="card-sub">of which salary sacrifice: ${fmtM(superAdded)}</div>
      ${wealthCarryNote}
      ${superCombinedLine}
    </div>` +
    `<div class="card summary-card card-etf${etfWins ? ' pass' : ''}">
      <div class="card-label">ETFs (after CGT)</div>
      <div class="card-value">${fmt(etfFinal)}</div>
      <div class="card-sub">After CGT (${fmt(etfResult.cgt)} est.)</div>
      ${etfCombinedLine}
    </div>` +
    `<div class="card summary-card card-offset${offsetWins ? ' pass' : ''}">
      <div class="card-label">Offset</div>
      <div class="card-value">${fmt(offFinal)}</div>
      <div class="card-sub">${offSub}</div>
    </div>`;

  // Deflated final values, returned so the verdict line can state the same
  // headline comparison without recomputing it.
  return { superFinal, etfFinal, offFinal };
}

// ─── Verdict line ────────────────────────────────────────────────────────────

// One-sentence takeaway above the wealth cards — answers "so which wins?"
// without making the user do the subtraction between three cards themselves.
function renderVerdictLine(superFinal, etfFinal, offFinal, mortgageBalance, retirementAge) {
  const el = document.getElementById('verdictLine');
  if (!el) return;

  const candidates = pickWinner(superFinal, etfFinal, offFinal, mortgageBalance);
  const winner   = candidates[0];
  const runnerUp = candidates[1];
  const margin    = winner.value - runnerUp.value;
  const marginPct = runnerUp.value > 0 ? (margin / runnerUp.value) * 100 : 0;

  let text;
  if (runnerUp.value > 0 && marginPct < 2) {
    text = `<strong>It's close:</strong> the top strategies land within ${fmt(margin)} of each other by retirement — other factors like access to your money and risk tolerance may matter more than the dollar difference here.`;
  } else {
    text = `<strong>${winner.name} comes out ahead</strong> by ${fmt(margin)}${marginPct ? ` (+${marginPct.toFixed(0)}%)` : ''} at retirement (age ${retirementAge}).`;
  }
  if (winner.name === 'Super' && retirementAge < 60) {
    text += ` Keep in mind super is locked away until age 60 — this money won't be accessible at your chosen retirement age.`;
  }
  el.innerHTML = text;
}

// ─── Sensitivity check (±2% return) ──────────────────────────────────────────

function runReturnScenario(superInputs, etfInputs, offsetInputs, totalReturn) {
  const s = superProjection({ ...superInputs, totalReturn });
  const e = etfProjection({ ...etfInputs, totalReturn });
  const o = offsetProjection({ ...offsetInputs, totalReturn });
  return { superFinal: s.finalBalance, etfFinal: e.finalAfterTax, offFinal: o.mortgagePhaseWealth };
}

function renderSensitivity(superInputs, etfInputs, offsetInputs, totalReturn, mortgageBalance) {
  const container = document.getElementById('sensitivityCard');
  if (!container) return;
  if (!showSensitivity) { container.classList.add('hidden'); container.innerHTML = ''; return; }
  container.classList.remove('hidden');

  const years = superInputs.retirementAge - superInputs.currentAge;
  const lowReturn  = Math.max(0, totalReturn - 0.02);
  const highReturn = totalReturn + 0.02;
  const low  = runReturnScenario(superInputs, etfInputs, offsetInputs, lowReturn);
  const high = runReturnScenario(superInputs, etfInputs, offsetInputs, highReturn);

  // Deflating is a uniform scalar per side (same years for all three
  // candidates), so it never changes which one wins — only the displayed
  // dollar figures, kept consistent with the wealth cards above.
  const lowWinner  = pickWinner(deflate(low.superFinal, years), deflate(low.etfFinal, years), deflate(low.offFinal, years), mortgageBalance)[0];
  const highWinner = pickWinner(deflate(high.superFinal, years), deflate(high.etfFinal, years), deflate(high.offFinal, years), mortgageBalance)[0];
  const flips = lowWinner.name !== highWinner.name;
  const winnerClass = (name) => name === 'Super' ? 'td-super' : name === 'ETFs' ? 'td-etf' : 'td-offset';

  container.innerHTML =
    `<div class="card-title">Sensitivity check — return ±2%</div>` +
    `<div class="offset-stats">
      <div class="offset-stat">
        <div class="offset-stat-label">At ${(lowReturn * 100).toFixed(1)}% return</div>
        <div class="offset-stat-value ${winnerClass(lowWinner.name)}">${lowWinner.name} wins</div>
        <div class="offset-stat-sub">${fmt(lowWinner.value)} at retirement</div>
      </div>
      <div class="offset-stat">
        <div class="offset-stat-label">At ${(highReturn * 100).toFixed(1)}% return</div>
        <div class="offset-stat-value ${winnerClass(highWinner.name)}">${highWinner.name} wins</div>
        <div class="offset-stat-sub">${fmt(highWinner.value)} at retirement</div>
      </div>
    </div>` +
    `<div class="offset-note">${flips
      ? `The winner flips depending on returns: <strong>${lowWinner.name}</strong> wins at lower returns, <strong>${highWinner.name}</strong> at higher returns. Your ${(totalReturn * 100).toFixed(1)}% assumption sits close to the crossover point.`
      : `<strong>${lowWinner.name}</strong> wins across the full ±2% range — a fairly robust result regardless of exact market performance.`
    }</div>`;
}

// ─── 50/50 split comparison ───────────────────────────────────────────────────

// Splits the monthly contribution evenly between Super and whichever of
// Offset/ETFs is actually applicable (Offset when a mortgage was entered,
// otherwise ETFs), then sums the two year-by-year for a combined wealth line.
function computeSplitResult(superInputs, etfInputs, offsetInputs, monthlyPreTax, mortgageBalance) {
  const halfMonthly = monthlyPreTax / 2;
  const splitSuper = superProjection({ ...superInputs, monthlyPreTax: halfMonthly });

  let splitSecond, secondLabel, secondKey;
  if (mortgageBalance > 0) {
    splitSecond = offsetProjection({ ...offsetInputs, monthlyPreTax: halfMonthly });
    secondLabel = 'Offset';
    secondKey = 'offsetBalance';
  } else {
    splitSecond = etfProjection({ ...etfInputs, monthlyPreTax: halfMonthly });
    secondLabel = 'ETFs';
    secondKey = 'etfAfterTax';
  }

  const secondFinal = mortgageBalance > 0 ? splitSecond.finalWealth : splitSecond.finalAfterTax;
  const years = superInputs.retirementAge - superInputs.currentAge;
  const splitFinal = deflate(splitSuper.finalBalance + secondFinal, years);
  const splitSeries = splitSuper.snapshots.map((s, i) => {
    const secondSnap = splitSecond.snapshots[i];
    const raw = s.superBalance + (secondSnap ? secondSnap[secondKey] : 0);
    return deflate(raw, s.year);
  });

  return { splitFinal, splitSeries, secondLabel };
}

// superFinal/etfFinal/offFinal are the already-deflated (or nominal, if the
// toggle is off) figures from renderWealthCards's return value — not raw
// projection output — so the "best single strategy" comparison below is on
// the same scale as splitResult.splitFinal (also deflated in computeSplitResult).
function renderSplitNote(splitResult, superFinal, etfFinal, offFinal, mortgageBalance) {
  const el = document.getElementById('splitNote');
  if (!el) return;
  if (!showSplit || !splitResult) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.classList.remove('hidden');

  const winner = pickWinner(superFinal, etfFinal, offFinal, mortgageBalance)[0];
  const diff = splitResult.splitFinal - winner.value;
  const better = diff >= 0;

  el.innerHTML =
    `<div class="card-title">50/50 split comparison</div>` +
    `<div class="offset-note" style="border-top:none;padding-top:0;margin-top:0;">` +
    `A 50/50 split between Super and ${splitResult.secondLabel} reaches <strong>${fmt(splitResult.splitFinal)}</strong> by retirement — ` +
    `${better ? 'more' : 'less'} than going all-in on ${winner.name} by ${fmt(Math.abs(diff))}.` +
    `</div>`;
}

// ─── Offset insights card ────────────────────────────────────────────────────

function renderOffsetInsights(offsetResult, mortgageBalance, currentAge, retirementAge) {
  const container = document.getElementById('offsetInsights');

  if (!mortgageBalance || mortgageBalance <= 0) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');

  const {
    termSavedYears,
    effectiveTermYears,
    originalTermYears,
    interestSavedOverLife,
    mortgagePaidOffYear,
    afterTaxReturn,
    postPayoffReturn,
    postPayoffMode: activeMode,
    finalWealth,
    snapshots,
    remainingBalanceAtRetirement,
    remainingTermAtRetirement,
  } = offsetResult;

  // finalWealth and remainingBalanceAtRetirement are both point-in-time
  // retirement-year figures, so they deflate the same way the wealth cards
  // do. interestSavedOverLife is deliberately left nominal — it's a
  // lifetime-cumulative sum, not a single future value (see deflate() comment).
  const years = retirementAge - currentAge;
  const finalWealthDisplay = fmt(deflate(finalWealth, years));
  const remainingBalanceDisplay = fmt(deflate(remainingBalanceAtRetirement, years));

  const termSavedRounded    = Math.round(termSavedYears);
  const effectiveTermRounded = Math.round(effectiveTermYears);
  const paidOffEarly        = termSavedYears >= 0.5;
  const returnPct           = (postPayoffReturn * 100).toFixed(1);

  // Balance at the effective payoff year
  let balanceAtPayoff = 0;
  if (mortgagePaidOffYear && snapshots.length >= mortgagePaidOffYear) {
    balanceAtPayoff = snapshots[mortgagePaidOffYear - 1].offsetBalance;
  }

  // Term stat — check outlasts-retirement first; paidOffEarly uses full-term amortization
  // which can show "paid off at year 17" even when retirement is at year 15.
  const termHtml = remainingBalanceAtRetirement > 0
    ? `<div class="offset-stat">
        <div class="offset-stat-label">Loan term</div>
        <div class="offset-stat-value">${originalTermYears} yrs
          <span class="offset-stat-badge offset-stat-badge-warn">${remainingTermAtRetirement} yr${remainingTermAtRetirement !== 1 ? 's' : ''} past retirement</span>
        </div>
        <div class="offset-stat-sub">Loan ends after your retirement age</div>
      </div>`
    : paidOffEarly
    ? `<div class="offset-stat">
        <div class="offset-stat-label">Loan paid off</div>
        <div class="offset-stat-value">Year ${effectiveTermRounded}
          <span class="offset-stat-badge">${termSavedRounded} yr${termSavedRounded !== 1 ? 's' : ''} early</span>
        </div>
        <div class="offset-stat-sub">Original term: ${originalTermYears} years</div>
      </div>`
    : `<div class="offset-stat">
        <div class="offset-stat-label">Loan term</div>
        <div class="offset-stat-value">${originalTermYears} yrs</div>
        <div class="offset-stat-sub">Increase contributions to pay off early</div>
      </div>`;

  const interestHtml =
    `<div class="offset-stat">
      <div class="offset-stat-label">Interest saved (life of loan)</div>
      <div class="offset-stat-value">${fmt(interestSavedOverLife)}</div>
      <div class="offset-stat-sub">vs. no offset account${realDollars ? ' · shown in nominal dollars' : ''}</div>
    </div>`;

  // Mode selector — only shown when mortgage is paid off before retirement
  let modeSelectorHtml = '';
  if (mortgagePaidOffYear) {
    modeSelectorHtml =
      `<div class="offset-mode-selector">
        <span class="offset-mode-label">After payoff, reinvest in:</span>
        <select class="offset-mode-select" onchange="setPostPayoffMode(this.value)">
          <option value="etf"  ${activeMode === 'etf'   ? 'selected' : ''}>ETFs (after-tax)</option>
          <option value="super" ${activeMode === 'super' ? 'selected' : ''}>Super salary sacrifice</option>
        </select>
      </div>`;
  }

  // Post-payoff note
  let noteHtml = '';
  if (mortgagePaidOffYear && balanceAtPayoff > 0) {
    const payoffAge = currentAge + mortgagePaidOffYear;
    const strategyName = activeMode === 'super' ? 'Super salary sacrifice' : 'ETFs';
    const rateNote = activeMode === 'super'
      ? `${returnPct}% p.a. after super earnings tax (contributions taxed at 15%)`
      : `${returnPct}% p.a. after tax`;
    noteHtml =
      `<div class="offset-note">
        <strong>Debt-free at age ${payoffAge} (year ${mortgagePaidOffYear}):</strong>
        from here your savings reinvest as <strong>${strategyName}</strong> at ${rateNote}.
        The "Offset → ${strategyName}" path as a whole reaches
        <strong>${finalWealthDisplay}</strong> by retirement — an alternative to going
        straight into ${strategyName} from day one.
      </div>`;
  } else if (remainingBalanceAtRetirement > 0) {
    noteHtml =
      `<div class="offset-note offset-note-warn">
        <strong>⚠ Mortgage not cleared by retirement:</strong>
        at retirement you will still have approximately
        <strong>${remainingBalanceDisplay}</strong> outstanding
        with <strong>${remainingTermAtRetirement} year${remainingTermAtRetirement !== 1 ? 's' : ''}</strong>
        remaining on the loan.
        The offset account has saved ${fmt(interestSavedOverLife)} in interest over the life of the loan.
      </div>`;
  } else {
    noteHtml =
      `<div class="offset-note">
        The offset account saves interest each year and the accumulated balance of ${finalWealthDisplay} is
        available at retirement. Increase your monthly contribution to unlock early payoff.
      </div>`;
  }

  container.innerHTML =
    `<div class="card-title">Offset strategy — mortgage impact</div>
    ${modeSelectorHtml}
    <div class="offset-stats">
      ${termHtml}
      ${interestHtml}
    </div>
    ${noteHtml}`;
}

// ─── Chart ───────────────────────────────────────────────────────────────────

let projChart = null;

function renderChart(superResult, etfResult, offsetResult, currentAge, retirementAge, splitSeries, splitLabel) {
  const years = retirementAge - currentAge;
  if (years <= 0) return;

  // Each point deflates by its own elapsed years (s.year), not the total
  // horizon — matches how the wealth cards deflate their single retirement-
  // year figure, just applied per year along the line.
  const labels    = superResult.snapshots.map(s => `Age ${s.age}`);
  const superData = superResult.snapshots.map(s => deflate(s.superBalance, s.year));
  const etfData   = etfResult.snapshots.map(s => deflate(s.etfAfterTax, s.year));
  const offData   = offsetResult.snapshots.map(s => deflate(s.offsetBalance, s.year));

  const datasets = [
    {
      label: 'Super',
      data: superData,
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59,130,246,0.08)',
      borderWidth: 2,
      pointRadius: 0,
      fill: false,
      tension: 0.3,
    },
    {
      label: 'ETFs (after CGT)',
      data: etfData,
      borderColor: '#22c55e',
      backgroundColor: 'rgba(34,197,94,0.08)',
      borderWidth: 2,
      pointRadius: 0,
      fill: false,
      tension: 0.3,
    },
    {
      label: 'Offset',
      data: offData,
      borderColor: '#f59e0b',
      backgroundColor: 'rgba(245,158,11,0.08)',
      borderWidth: 2,
      pointRadius: 0,
      fill: false,
      tension: 0.3,
    },
  ];

  if (splitSeries && splitSeries.length) {
    datasets.push({
      label: `50/50 split (Super + ${splitLabel})`,
      data: splitSeries,
      borderColor: '#818cf8',
      backgroundColor: 'rgba(129,140,248,0.08)',
      borderWidth: 2,
      borderDash: [6, 4],
      pointRadius: 0,
      fill: false,
      tension: 0.3,
    });
  }

  if (projChart) projChart.destroy();

  const ctx = document.getElementById('projectionChart').getContext('2d');
  projChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${fmtM(ctx.raw)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', maxTicksLimit: 8 },
          grid: { color: 'rgba(51,65,85,0.5)' },
        },
        y: {
          afterFit: scale => { scale.width = 88; },
          ticks: {
            color: '#94a3b8',
            maxTicksLimit: 6,
            callback: v => fmtM(v),
          },
          grid: { color: 'rgba(51,65,85,0.5)' },
        },
      },
    },
  });
}

// ─── Year-by-year table ──────────────────────────────────────────────────────

function renderYearTable(superResult, etfResult, offsetResult) {
  const tbody = document.getElementById('yearTableBody');
  const maxLen = Math.max(
    superResult.snapshots.length,
    etfResult.snapshots.length,
    offsetResult.snapshots.length
  );
  let html = '';
  for (let i = 0; i < maxLen; i++) {
    const s = superResult.snapshots[i] || {};
    const e = etfResult.snapshots[i] || {};
    const o = offsetResult.snapshots[i] || {};
    const year   = s.year || e.year || o.year || (i + 1);
    const age    = s.age  || e.age  || o.age  || '';
    // Deflating all three columns by the same per-row year preserves the
    // "Best" ranking below — it's a uniform scalar across the row.
    const superBal = deflate(s.superBalance  || 0, year);
    const etfPre   = deflate(e.portfolio     || 0, year);
    const etfPost  = deflate(e.etfAfterTax   || 0, year);
    const offBal   = deflate(o.offsetBalance || 0, year);

    const best = superBal >= etfPost && superBal >= offBal ? 'Super'
               : etfPost  >= offBal                        ? 'ETFs'
               :                                             'Offset';
    const bestClass = best === 'Super' ? 'td-super' : best === 'ETFs' ? 'td-etf' : 'td-offset';

    html += `<tr>
      <td>${year}</td>
      <td>${age}</td>
      <td>${fmtM(superBal)}</td>
      <td>${fmtM(etfPre)}</td>
      <td>${fmtM(etfPost)}</td>
      <td>${fmtM(offBal)}</td>
      <td class="${bestClass}">${best}</td>
    </tr>`;
  }
  tbody.innerHTML = html;
}

function scrollResultsIntoView() {
  const resultsPanel = document.getElementById('results');
  if (!resultsPanel) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  resultsPanel.scrollIntoView({
    behavior: reduceMotion ? 'auto' : 'smooth',
    block: 'start',
  });
}

function showPlaceholder(message) {
  document.getElementById('placeholderText').textContent = message;
  document.getElementById('placeholder').classList.remove('hidden');
  document.getElementById('results').classList.add('hidden');
  // Banners live outside #results and are only set by a successful calculate()
  // — without this they'd persist from a prior run while a "no results"
  // placeholder is showing, which live recalculation now makes easy to hit
  // (e.g. briefly clearing salary mid-edit after tripping a banner).
  ['bannerDiv293', 'bannerCapBreached', 'bannerDiv296', 'bannerCarryForwardIneligible', 'bannerPreservationAge']
    .forEach(id => toggleBanner(id, false));
}

// ─── Main calculate entry point ──────────────────────────────────────────────
//
// silent=true skips the scroll-into-view — used for live recalculation as the
// user types, changing a toggle/dropdown, or a silent auto-calculate on load,
// so the page doesn't jump around under the user (see kashvector-lessons.md
// "Pitfall — auto-calculate scroll").
function calculate(silent = false) {
  // Read inputs
  const salary             = parseMoney(document.getElementById('salary'));
  const monthlyPreTax      = parseMoney(document.getElementById('monthlyPreTax'));
  const currentAge         = parseInt(document.getElementById('currentAge').value)       || 35;
  const retirementAge      = parseInt(document.getElementById('retirementAge').value)    || 60;

  if (salary <= 0) {
    showPlaceholder('Enter your annual salary to see results.');
    return;
  }
  if (retirementAge <= currentAge) {
    showPlaceholder('Retirement age must be after your current age.');
    return;
  }
  // readPct: treats empty/NaN as the given default but preserves genuine zero entries.
  function readPct(id, def) {
    const v = parseFloat(document.getElementById(id).value);
    return (isNaN(v) ? def : v) / 100;
  }
  const employerSuperRate  = readPct('employerRate', 12);
  const currentSuperBalance  = parseMoney(document.getElementById('superBalance'));
  const cfEnabled            = document.getElementById('carryForwardEnabled').checked;
  const carryForwardTotal    = cfEnabled ? parseMoney(document.getElementById('carryForwardTotal'))    : 0;
  const carryForwardPerYear  = cfEnabled ? parseMoney(document.getElementById('carryForwardPerYear'))  : 0;
  const mortgageBalance      = parseMoney(document.getElementById('mortgageBalance'));
  const mortgageRate       = readPct('mortgageRate', 6.0);
  const mortgageTerm       = parseInt(document.getElementById('mortgageTerm').value) || 25;
  const totalReturn        = readPct('totalReturn', 8.0);
  const dividendYield      = readPct('dividendYield', 4.0);
  const frankingPct        = readPct('frankingPct', 70);

  // Run projections — inputs are named so sensitivity/split scenarios below
  // can re-run the same calc functions with one field overridden.
  const superInputs = {
    salary, currentAge, retirementAge, monthlyPreTax,
    employerSuperRate, currentSuperBalance, totalReturn, dividendYield,
    carryForwardTotal, carryForwardPerYear,
  };
  const superResult = superProjection(superInputs);

  // Employer-only baseline (no salary sacrifice) for wealth card breakdown
  const superBaseResult = superProjection({
    salary, currentAge, retirementAge, monthlyPreTax: 0,
    employerSuperRate, currentSuperBalance, totalReturn, dividendYield,
  });

  const etfInputs = {
    salary, currentAge, retirementAge, monthlyPreTax,
    currentPortfolioBalance: 0, totalReturn, dividendYield, frankingPct,
  };
  const etfResult = etfProjection(etfInputs);

  const offsetInputs = {
    salary, currentAge, retirementAge, monthlyPreTax,
    mortgageBalance, mortgageRate, mortgageTerm, totalReturn, dividendYield,
    postPayoffMode,
  };
  const offsetResult = offsetProjection(offsetInputs);

  // If the mortgage isn't cleared before retirement, post-payoff mode is irrelevant —
  // reset so a stale 'super' selection from a previous calculation doesn't persist.
  if (!offsetResult.mortgagePaidOffYear) postPayoffMode = 'etf';

  // Banners
  toggleBanner('bannerDiv293', superResult.div293Applies);
  toggleBanner('bannerCapBreached', superResult.capBreached);
  toggleBanner('bannerDiv296', superResult.div296Applies);
  toggleBanner('bannerCarryForwardIneligible', cfEnabled && !superResult.carryForwardEligible);
  toggleBanner('bannerPreservationAge', retirementAge < 60);

  // Show results
  document.getElementById('placeholder').classList.add('hidden');
  document.getElementById('results').classList.remove('hidden');
  document.getElementById('retireAgeLabel').textContent = retirementAge;

  // Optional scenarios — only computed when their toggle is on, to avoid
  // running extra projections on every keystroke for the common case.
  const splitResult = showSplit
    ? computeSplitResult(superInputs, etfInputs, offsetInputs, monthlyPreTax, mortgageBalance)
    : null;

  // Render sections
  renderPrintInputs({
    salary, monthlyPreTax, currentAge, retirementAge, employerSuperRate,
    currentSuperBalance, mortgageBalance, mortgageRate, mortgageTerm,
    totalReturn, dividendYield, frankingPct,
  });
  renderBasisNote(salary, monthlyPreTax);
  renderAnnualCards(superResult, etfResult, offsetResult, mortgageBalance);
  const wealthSummary = renderWealthCards(superResult, superBaseResult, etfResult, offsetResult, currentAge, retirementAge);
  renderVerdictLine(wealthSummary.superFinal, wealthSummary.etfFinal, wealthSummary.offFinal, mortgageBalance, retirementAge);
  renderOffsetInsights(offsetResult, mortgageBalance, currentAge, retirementAge);
  renderSensitivity(superInputs, etfInputs, offsetInputs, totalReturn, mortgageBalance);
  renderSplitNote(splitResult, wealthSummary.superFinal, wealthSummary.etfFinal, wealthSummary.offFinal, mortgageBalance);
  renderChart(superResult, etfResult, offsetResult, currentAge, retirementAge,
    splitResult ? splitResult.splitSeries : null, splitResult ? splitResult.secondLabel : null);
  renderYearTable(superResult, etfResult, offsetResult);
  renderNextStepSuggestion();

  hasCalculated = true;
  if (!silent) requestAnimationFrame(scrollResultsIntoView);
}

// ─── Next-step suggestion: Salary Sacrifice / Super Compare → FIRE Calculator ─
//
// FIRE's own scenario link support (rollout Task 1) shares `superBalance` via
// param 'sb' (see www/fire/app.js FIELD_MAP). Super Compare's headline output
// is a derived "net extra contribution" (annual salary sacrifice minus tax
// saved) which has no counterpart field in FIRE's FIELD_MAP — carrying it
// would silently drop on arrival. superBalance is the one raw input both
// tools actually read from the shared profile, so we carry that instead,
// matching FIRE's param letter ('sb') exactly.
function renderNextStepSuggestion() {
  const container = document.getElementById('nextStepSuggestion');
  if (!container || isNative || !window.kvScenario) return;

  const superBalance = parseMoney(document.getElementById('superBalance'));
  if (!superBalance || superBalance <= 0) { container.innerHTML = ''; return; }

  const fireFieldMap = {
    superBalance: { param: 'sb' },
  };
  const getValue = (inputId) => ({
    superBalance: String(superBalance),
  }[inputId]);
  const href = window.kvScenario.buildLink(
    fireFieldMap,
    getValue,
    location.origin + '/fire/'
  );

  window.kvScenario.renderSuggestion(container, {
    text: 'See how these extra super contributions shift your FIRE timeline',
    href,
    dismissKey: 'super-compare:fire',
  });
}

// ─── DOMContentLoaded init ───────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Bind formatMoneyInput to all money inputs (formatting first)
  ['salary', 'monthlyPreTax', 'superBalance', 'mortgageBalance',
   'carryForwardTotal', 'carryForwardPerYear'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => formatMoneyInput(el));
  });

  // Bind live derived updates + live recalculation (debounced). Once the user
  // has calculated at least once, editing any calc-relevant input silently
  // re-runs calculate() so the results track their changes without another
  // click — the button stays required only for the first run.
  const liveInputIds = ['salary', 'monthlyPreTax', 'currentAge', 'retirementAge', 'employerRate',
                        'superBalance', 'carryForwardTotal', 'carryForwardPerYear',
                        'mortgageBalance', 'mortgageRate', 'mortgageTerm',
                        'totalReturn', 'dividendYield', 'frankingPct'];
  liveInputIds.forEach(id => {
    document.getElementById(id).addEventListener('input', scheduleLiveUpdate);
  });

  // Bind saveInputs to all inputs (after formatting binding so saves happen post-format)
  document.querySelectorAll('input').forEach(el => el.addEventListener('input', saveInputs));

  // Track genuine user edits to shared-profile fields and push them to the
  // shared profile. Registered after the formatting/save bindings above so it
  // sees the already-formatted value on the same 'input' event.
  Object.keys(FIELD_MAP).forEach(inputId => {
    const el = document.getElementById(inputId);
    if (!el) return;
    el.addEventListener('input', () => {
      touchedProfileFields[FIELD_MAP[inputId].profileKey] = true;
      pushProfileUpdate();
    });
  });

  // Restore from localStorage
  restoreInputs();

  // Cross-tool scenario links & profile pre-fill (URL params win over profile;
  // the tool's own saved state always wins over both)
  applyScenarioParams();
  applyProfilePrefill();

  // Run live derived update once on load (reflect restored/prefilled values)
  updateDerived();

  if (!isNative) {
    bindCopyLinkButton();
  } else {
    const copyLinkBtn = document.getElementById('copyLinkBtn');
    if (copyLinkBtn) copyLinkBtn.style.display = 'none';
  }

  // Silent auto-calculate when arriving via a shared scenario link, or when
  // returning with valid saved inputs from a previous visit — either way the
  // user shouldn't have to re-click Calculate to see results they already had.
  if (scenarioParamsApplied) {
    calculate(true);
  } else if (hadSavedStateOnLoad) {
    const salaryVal = parseMoney(document.getElementById('salary'));
    const curAgeVal = parseInt(document.getElementById('currentAge').value) || 0;
    const retAgeVal = parseInt(document.getElementById('retirementAge').value) || 0;
    if (salaryVal > 0 && retAgeVal > curAgeVal) calculate(true);
  }

  // Resize chart when year-by-year details section is toggled open (bound once)
  document.getElementById('yearDetails').addEventListener('toggle', () => {
    if (projChart) projChart.resize();
  });
});
