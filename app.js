// app.js — DOM controller for the super-compare KashVector calculator.
// ONLY file allowed to touch the DOM, window, or localStorage.
// Zero calculation logic — all calc is delegated to pure functions in calc/*.js.

// ─── localStorage persistence ────────────────────────────────────────────────

const LS_KEY = 'kv_super_compare_inputs';

function saveInputs() {
  const data = {};
  ['salary', 'monthlyPreTax', 'superBalance', 'mortgageBalance'].forEach(id => {
    data[id] = document.getElementById(id).value;
  });
  ['currentAge', 'retirementAge', 'employerRate', 'mortgageRate', 'mortgageTerm',
    'totalReturn', 'dividendYield', 'frankingPct'].forEach(id => {
    data[id] = document.getElementById(id).value;
  });
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

function restoreInputs() {
  try {
    const data = JSON.parse(localStorage.getItem(LS_KEY));
    if (!data) return;
    Object.keys(data).forEach(id => {
      const el = document.getElementById(id);
      if (el && data[id]) el.value = data[id];
    });
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
  const empRate = parseFloat(document.getElementById('employerRate').value) || DEFAULT_EMPLOYER_SUPER_RATE * 100;
  const mr = marginalRate(salary);
  const mrPct = Math.round(mr * 100);

  // salaryDerived
  let salaryText = mrPct > 0
    ? `Marginal rate: ${mrPct}% (incl. 2% Medicare)`
    : 'Below tax-free threshold';
  if (salary > DIV293_THRESHOLD) salaryText += ' · Div 293 applies';
  document.getElementById('salaryDerived').textContent = salaryText;

  // afterTaxDerived
  const afterTax = monthly * (1 - mr);
  document.getElementById('afterTaxDerived').textContent =
    monthly > 0 ? `After-tax equivalent: ${fmt(afterTax)}/mo` : '';

  // Concessional cap check (live)
  const annualSacrifice = monthly * 12;
  const employerAnnual = salary * (empRate / 100);
  const totalConcessional = annualSacrifice + employerAnnual;
  const capEl = document.getElementById('capDerived');
  if (totalConcessional > CONCESSIONAL_CAP) {
    capEl.textContent = `⚠ Employer $${Math.round(employerAnnual).toLocaleString()} + sacrifice $${Math.round(annualSacrifice).toLocaleString()} = $${Math.round(totalConcessional).toLocaleString()} exceeds $30,000 cap`;
    capEl.classList.remove('hidden');
  } else {
    capEl.classList.add('hidden');
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
  const offFinal      = offsetResult.finalWealth;

  // Determine winner — use === maxVal so ties show multiple winners
  const maxVal = Math.max(superFinal, etfFinal, offFinal);
  const superWins  = superFinal === maxVal;
  const etfWins    = etfFinal   === maxVal;
  const offsetWins = offFinal   === maxVal;

  const currentAge = parseInt(document.getElementById('currentAge').value) || 35;
  const years = retirementAge - currentAge;

  const etfSub   = `After CGT (${fmt(etfResult.cgt)} est.)`;
  const offSub   = offsetResult.mortgagePaidOffYear
    ? `Mortgage paid off year ${offsetResult.mortgagePaidOffYear}`
    : `Interest saved: ${fmt(offsetResult.totalInterestSaved)}`;

  container.innerHTML =
    `<div class="card summary-card card-super${superWins ? ' pass' : ''}">
      <div class="card-label">Super</div>
      <div class="card-value">${fmt(superFinal)}</div>
      <div class="card-sub">Without sacrifice: ${fmtM(superBaseline)}</div>
      <div class="card-sub">Sacrifice adds: +${fmtM(superAdded)}</div>
    </div>` +
    `<div class="card summary-card card-etf${etfWins ? ' pass' : ''}">
      <div class="card-label">ETFs (after CGT)</div>
      <div class="card-value">${fmt(etfFinal)}</div>
      <div class="card-sub">${etfSub}</div>
    </div>` +
    `<div class="card summary-card card-offset${offsetWins ? ' pass' : ''}">
      <div class="card-label">Offset</div>
      <div class="card-value">${fmt(offFinal)}</div>
      <div class="card-sub">${offSub}</div>
    </div>`;
}

// ─── Chart ───────────────────────────────────────────────────────────────────

let projChart = null;

function renderChart(superResult, etfResult, offsetResult, currentAge, retirementAge) {
  const years = retirementAge - currentAge;
  if (years <= 0) return;

  const labels   = superResult.snapshots.map(s => `Age ${s.age}`);
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
  const resultsPanel = document.getElementById('resultsPanel');
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

  if (retirementAge <= currentAge) return;
  const employerSuperRate  = (parseFloat(document.getElementById('employerRate').value)  || 12) / 100;
  const currentSuperBalance = parseMoney(document.getElementById('superBalance'));
  const mortgageBalance    = parseMoney(document.getElementById('mortgageBalance'));
  const mortgageRate       = (parseFloat(document.getElementById('mortgageRate').value)  || 6.0) / 100;
  const mortgageTerm       = parseInt(document.getElementById('mortgageTerm').value)     || 25;
  const totalReturn        = (parseFloat(document.getElementById('totalReturn').value)   || 8.0) / 100;
  const dividendYield      = (parseFloat(document.getElementById('dividendYield').value) || 4.0) / 100;
  const frankingPct        = (parseFloat(document.getElementById('frankingPct').value)   || 70)  / 100;

  // Run projections
  const superResult = superProjection({
    salary, currentAge, retirementAge, monthlyPreTax,
    employerSuperRate, currentSuperBalance, totalReturn, dividendYield,
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
  });

  // Banners
  toggleBanner('bannerDiv293', superResult.div293Applies);
  toggleBanner('bannerCapBreached', superResult.capBreached);

  // Show results
  document.getElementById('placeholder').classList.add('hidden');
  document.getElementById('results').classList.remove('hidden');
  document.getElementById('retireAgeLabel').textContent = retirementAge;

  // Render sections
  renderAnnualCards(superResult, etfResult, offsetResult, mortgageBalance);
  renderWealthCards(superResult, superBaseResult, etfResult, offsetResult, retirementAge);
  renderChart(superResult, etfResult, offsetResult, currentAge, retirementAge);
  renderYearTable(superResult, etfResult, offsetResult);

  requestAnimationFrame(scrollResultsIntoView);
}

// ─── DOMContentLoaded init ───────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Bind formatMoneyInput to all money inputs (formatting first)
  ['salary', 'monthlyPreTax', 'superBalance', 'mortgageBalance'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => formatMoneyInput(el));
  });

  // Bind live derived updates (debounced)
  const liveInputIds = ['salary', 'monthlyPreTax', 'currentAge', 'retirementAge', 'employerRate'];
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
