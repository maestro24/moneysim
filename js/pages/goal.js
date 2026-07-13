/**
 * goal.js — 목돈 목표 역산 계산기 (필요 월 저축액, 닫힌형).
 * 금액 단위: 만원. 월 이율 = 실효 (1+R)^(1/12)-1, 기말불 적립.
 */
import { requiredPayment, effectiveMonthlyRate, fvCombined } from '../core/finance.js';
import { initField, allValid } from '../ui/field.js';
import { formatManwon, formatManwonShort, comma } from '../ui/format.js';
import { readQueryParams, writeQueryParams, bindShareButton } from '../ui/share.js';
import { createLineChart } from '../chart/linechart.js';

const q = readQueryParams(['target', 'years', 'rate', 'init']);

const fields = {
  target: initField('f-target', { min: 100, max: 1000000, step: 100, value: q.target ?? 10000, onChange: recompute }),
  years: initField('f-years', { min: 1, max: 40, step: 1, value: q.years ?? 10, onChange: recompute }),
  rate: initField('f-rate', { min: 0, max: 15, step: 0.1, value: q.rate ?? 5, onChange: recompute }),
  init: initField('f-init', { min: 0, max: 1000000, step: 100, value: q.init ?? 0, onChange: recompute }),
};

const chart = createLineChart(document.getElementById('chart-paths'), {
  formatX: (v) => `${Math.round(v)}년`,
  formatY: formatManwonShort,
});

const SENSITIVITY_COLORS = { 3: '#94a3b8', 5: '#3b82f6', 7: '#0e9f6e' };

function pathSeries(pv, pmt, annualRate, years) {
  const m = effectiveMonthlyRate(annualRate);
  const data = [{ x: 0, y: pv }];
  let balance = pv;
  for (let y = 1; y <= years; y++) {
    for (let mo = 0; mo < 12; mo++) balance = balance * (1 + m) + pmt;
    data.push({ x: y, y: balance });
  }
  return data;
}

function recompute() {
  if (!allValid(fields)) return;
  const target = fields.target.get();
  const years = fields.years.get();
  const annual = fields.rate.get() / 100;
  const init = fields.init.get();
  const n = years * 12;

  writeQueryParams({ target, years, rate: fields.rate.get(), init });

  const m = effectiveMonthlyRate(annual);
  const pmt = requiredPayment(target, m, n, init);

  document.getElementById('result').classList.add('show');
  const bigEl = document.getElementById('required-pmt');
  if (pmt === 0) {
    bigEl.textContent = '추가 저축 불필요';
    bigEl.className = 'result-big grade-good';
    document.getElementById('pmt-sub').textContent = '초기 자금만으로 목표를 달성합니다.';
  } else {
    bigEl.textContent = `월 ${formatManwon(pmt)}`;
    bigEl.className = 'result-big grade-good';
    document.getElementById('pmt-sub').textContent =
      `${years}년 동안 매월 말 저축 시 ${formatManwon(target)} 달성 (연 ${fields.rate.get()}% 가정)`;
  }

  const totalDeposit = init + pmt * n;
  document.getElementById('stat-deposit').textContent = formatManwon(totalDeposit);
  document.getElementById('stat-interest').textContent = formatManwon(target - totalDeposit);
  document.getElementById('stat-check').textContent = formatManwon(fvCombined(init, pmt, m, n));

  // 수익률 민감도 표 (3% / 5% / 7% + 사용자 입력)
  const rates = [...new Set([3, 5, 7, fields.rate.get()])].sort((a, b) => a - b);
  const tbody = document.getElementById('table-body');
  tbody.innerHTML = '';
  for (const rPct of rates) {
    const mr = effectiveMonthlyRate(rPct / 100);
    const p = requiredPayment(target, mr, n, init);
    const dep = init + p * n;
    const tr = document.createElement('tr');
    if (rPct === fields.rate.get()) tr.className = 'highlight';
    tr.innerHTML =
      `<td>연 ${rPct}%${rPct === fields.rate.get() ? ' (입력값)' : ''}</td>` +
      `<td class="num">${comma(p)}만원</td>` +
      `<td class="num">${comma(dep)}만원</td>` +
      `<td class="num">${dep > 0 ? (((target - dep) / target) * 100).toFixed(1) : '-'}%</td>`;
    tbody.appendChild(tr);
  }

  // 성장 경로 차트: 3/5/7% 각각 "그 수익률에 필요한 월 저축"으로 목표 도달 경로
  const series = rates.filter((r) => SENSITIVITY_COLORS[r] || r === fields.rate.get()).map((rPct) => {
    const mr = effectiveMonthlyRate(rPct / 100);
    const p = requiredPayment(target, mr, n, init);
    return {
      type: 'line',
      name: `연 ${rPct}% (월 ${comma(p)}만원)`,
      color: SENSITIVITY_COLORS[rPct] ?? '#057a55',
      width: rPct === fields.rate.get() ? 2.5 : 1.5,
      data: pathSeries(init, p, rPct / 100, years),
    };
  });
  series.push({
    type: 'line', name: `목표 ${formatManwon(target)}`, color: '#d97706',
    width: 1.5, dash: [6, 4],
    data: [{ x: 0, y: target }, { x: years, y: target }],
  });
  chart.update(series);
}

bindShareButton(document.getElementById('btn-share'));
recompute();
