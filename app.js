// app.js — DOM controller for the super-compare KashVector calculator.
// ONLY file allowed to touch the DOM, window, or localStorage.
// Zero calculation logic — all calc is delegated to pure functions in calc/*.js.

// ─── Post-payoff investment mode (not persisted — resets on page load) ───────

let postPayoffMode = 'etf';

// ─── Carry-forward toggle ─────────────────────────────────────────────────────

function toggleCarryForward() {
  const enabled = document.getElementById('carryForwardEnabled').checked;
  document.getElementById('carryForwardFields').classList.toggle('hidden', !enabled);
  saveInputs();
  scheduleLiveUpdate();
}

function setPostPayoffMode(val) {
  postPayoffMode = val;
  calculate();
}

// ─── localStorage persistence ────────────────────────────────────────────────

const LS_KEY = 'kv_super_compare_inputs';

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
  } catch (e) {
    console.warn('Failed to restore inputs from localStorage:', e);
  }
}

// ─── Live derived updates (debounced) ────────────────────────────────────────

let liveTimer = null;

function scheduleLiveUpdate() {
  clearTimeout(liveTimer);
  liveTimer = setTimeout(updateDerived, 150);
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

function renderWealthCards(superResult, superBaseResult, etfResult, offsetResult, retirementAge) {
  const container = document.getElementById('wealthCards');

  const superFinal    = superResult.finalBalance;
  const superBaseline = superBaseResult.finalBalance;
  const superAdded    = superFinal - superBaseline;
  const etfFinal      = etfResult.finalAfterTax;

  // Offset card always shows the mortgage-phase-only balance (fixed — does not change with mode).
  // Post-payoff reinvestment total (finalWealth) is shown separately in the insights card.
  const offFinal = offsetResult.mortgagePhaseWealth;

  // Combined "Offset → [mode]" total shown as a supplemental comparison line.
  const combinedTotal = offsetResult.finalWealth;
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
}

// ─── Offset insights card ────────────────────────────────────────────────────

function renderOffsetInsights(offsetResult, mortgageBalance, currentAge) {
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
      <div class="offset-stat-sub">vs. no offset account</div>
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
        <strong>${fmt(finalWealth)}</strong> by retirement — an alternative to going
        straight into ${strategyName} from day one.
      </div>`;
  } else if (remainingBalanceAtRetirement > 0) {
    noteHtml =
      `<div class="offset-note offset-note-warn">
        <strong>⚠ Mortgage not cleared by retirement:</strong>
        at retirement you will still have approximately
        <strong>${fmt(remainingBalanceAtRetirement)}</strong> outstanding
        with <strong>${remainingTermAtRetirement} year${remainingTermAtRetirement !== 1 ? 's' : ''}</strong>
        remaining on the loan.
        The offset account has saved ${fmt(interestSavedOverLife)} in interest over the life of the loan.
      </div>`;
  } else {
    noteHtml =
      `<div class="offset-note">
        The offset account saves interest each year and the accumulated balance of ${fmt(finalWealth)} is
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

function renderChart(superResult, etfResult, offsetResult, currentAge, retirementAge) {
  const years = retirementAge - currentAge;
  if (years <= 0) return;

  const labels    = superResult.snapshots.map(s => `Age ${s.age}`);
  const superData = superResult.snapshots.map(s => s.superBalance);
  const etfData   = etfResult.snapshots.map(s => s.etfAfterTax);
  const offData   = offsetResult.snapshots.map(s => s.offsetBalance);

  if (projChart) projChart.destroy();

  const ctx = document.getElementById('projectionChart').getContext('2d');
  projChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
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
      ],
    },
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
    const superBal = s.superBalance  || 0;
    const etfPre   = e.portfolio     || 0;
    const etfPost  = e.etfAfterTax   || 0;
    const offBal   = o.offsetBalance || 0;

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

// ─── Main calculate entry point ──────────────────────────────────────────────

function calculate() {
  // Read inputs
  const salary             = parseMoney(document.getElementById('salary'));
  const monthlyPreTax      = parseMoney(document.getElementById('monthlyPreTax'));
  const currentAge         = parseInt(document.getElementById('currentAge').value)       || 35;
  const retirementAge      = parseInt(document.getElementById('retirementAge').value)    || 60;

  if (retirementAge <= currentAge) {
    document.getElementById('placeholder').classList.remove('hidden');
    document.getElementById('results').classList.add('hidden');
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

  // Run projections
  const superResult = superProjection({
    salary, currentAge, retirementAge, monthlyPreTax,
    employerSuperRate, currentSuperBalance, totalReturn, dividendYield,
    carryForwardTotal, carryForwardPerYear,
  });

  // Employer-only baseline (no salary sacrifice) for wealth card breakdown
  const superBaseResult = superProjection({
    salary, currentAge, retirementAge, monthlyPreTax: 0,
    employerSuperRate, currentSuperBalance, totalReturn, dividendYield,
  });

  const etfResult = etfProjection({
    salary, currentAge, retirementAge, monthlyPreTax,
    currentPortfolioBalance: 0, totalReturn, dividendYield, frankingPct,
  });

  const offsetResult = offsetProjection({
    salary, currentAge, retirementAge, monthlyPreTax,
    mortgageBalance, mortgageRate, mortgageTerm, totalReturn, dividendYield,
    postPayoffMode,
  });

  // If the mortgage isn't cleared before retirement, post-payoff mode is irrelevant —
  // reset so a stale 'super' selection from a previous calculation doesn't persist.
  if (!offsetResult.mortgagePaidOffYear) postPayoffMode = 'etf';

  // Banners
  toggleBanner('bannerDiv293', superResult.div293Applies);
  toggleBanner('bannerCapBreached', superResult.capBreached);
  toggleBanner('bannerDiv296', superResult.div296Applies);
  toggleBanner('bannerCarryForwardIneligible', cfEnabled && !superResult.carryForwardEligible);

  // Show results
  document.getElementById('placeholder').classList.add('hidden');
  document.getElementById('results').classList.remove('hidden');
  document.getElementById('retireAgeLabel').textContent = retirementAge;

  // Render sections
  renderAnnualCards(superResult, etfResult, offsetResult, mortgageBalance);
  renderWealthCards(superResult, superBaseResult, etfResult, offsetResult, retirementAge);
  renderOffsetInsights(offsetResult, mortgageBalance, currentAge);
  renderChart(superResult, etfResult, offsetResult, currentAge, retirementAge);
  renderYearTable(superResult, etfResult, offsetResult);

  requestAnimationFrame(scrollResultsIntoView);
}

// ─── DOMContentLoaded init ───────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Bind formatMoneyInput to all money inputs (formatting first)
  ['salary', 'monthlyPreTax', 'superBalance', 'mortgageBalance',
   'carryForwardTotal', 'carryForwardPerYear'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => formatMoneyInput(el));
  });

  // Bind live derived updates (debounced)
  const liveInputIds = ['salary', 'monthlyPreTax', 'currentAge', 'retirementAge', 'employerRate',
                        'superBalance', 'carryForwardTotal', 'carryForwardPerYear'];
  liveInputIds.forEach(id => {
    document.getElementById(id).addEventListener('input', scheduleLiveUpdate);
  });

  // Bind saveInputs to all inputs (after formatting binding so saves happen post-format)
  document.querySelectorAll('input').forEach(el => el.addEventListener('input', saveInputs));

  // Restore from localStorage
  restoreInputs();

  // Run live derived update once on load (reflect restored values)
  updateDerived();

  // Resize chart when year-by-year details section is toggled open (bound once)
  document.getElementById('yearDetails').addEventListener('toggle', () => {
    if (projChart) projChart.resize();
  });
});
