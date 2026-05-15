// Australian income tax + Medicare levy 2026-27 (effective 1 July 2026)
function marginalRate(income) {
  const n = (income != null && isFinite(income)) ? Number(income) : 0;
  if (n <= 18200)   return 0;    // tax-free threshold (covers zero/negative inputs)
  if (n <= 45000)   return 0.17; // 15% base + 2% Medicare
  if (n <= 135000)  return 0.32; // 30% base + 2% Medicare
  if (n <= 190000)  return 0.39; // 37% base + 2% Medicare
  return 0.47;                   // 45% base + 2% Medicare
}

function safe(v) {
  return (v != null && isFinite(v)) ? Number(v) : 0;
}

function fmt(v, decimals = 0) {
  const n = (v != null && isFinite(v)) ? Number(v) : null;
  if (n === null) return 'N/A';
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-AU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (n < 0 ? '-$' : '$') + formatted;
}

function fmtM(v) {
  const n = (v != null && isFinite(v)) ? Number(v) : null;
  if (n === null) return 'N/A';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    const formatted = m % 1 === 0 ? m.toFixed(0) : m.toFixed(1);
    return sign + '$' + formatted + 'M';
  }
  if (abs >= 10_000) {
    const k = abs / 1_000;
    const formatted = k % 1 === 0 ? k.toFixed(0) : k.toFixed(1);
    return sign + '$' + formatted + 'k';
  }
  return sign + '$' + abs.toLocaleString('en-AU');
}

function parseMoney(el) {
  return parseInt(el.value.replace(/,/g, '')) || 0;
}

function formatMoneyInput(el) {
  const pos = el.selectionStart;
  const oldVal = el.value;
  const digitsBeforeCursor = (oldVal.slice(0, pos).match(/\d/g) || []).length;
  const raw = oldVal.replace(/[^\d]/g, '');
  if (!raw) { el.value = ''; return; }
  const formatted = Number(raw).toLocaleString('en-AU');
  el.value = formatted;
  let digitCount = 0, newPos = formatted.length;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) digitCount++;
    if (digitCount === digitsBeforeCursor) { newPos = i + 1; break; }
  }
  el.setSelectionRange(newPos, newPos);
}

if (typeof module !== 'undefined') module.exports = {
  marginalRate,
  safe,
  fmt,
  fmtM,
  parseMoney,
  formatMoneyInput,
};
