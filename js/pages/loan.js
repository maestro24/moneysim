/**
 * loan.js — 대출 상환 3방식 비교 (원리금균등 / 원금균등 / 만기일시).
 * 금액 단위: 만원. 월 이율 = 연이율/12 (대출 관행).
 */
import {
  nominalMonthlyRate, scheduleAmortized, scheduleEqualPrincipal, scheduleBullet,
} from '../core/finance.js';
import { initField, allValid } from '../ui/field.js';
import { formatManwon, formatManwonShort, comma } from '../ui/format.js';
import { readQueryParams, writeQueryParams, bindShareButton } from '../ui/share.js';
import { createLineChart } from '../chart/linechart.js';
import { createBarChart } from '../chart/barchart.js';

const q = readQueryParams(['p', 'rate', 'years', 'pm', 'pa']);

const fields = {
  p: initField('f-p', { min: 100, max: 500000, step: 100, value: q.p ?? 30000, onChange: recompute }),
  rate: initField('f-rate', { min: 0, max: 20, step: 0.1, value: q.rate ?? 4, onChange: recompute }),
  years: initField('f-years', { min: 1, max: 40, step: 1, value: q.years ?? 30, onChange: recompute }),
  pm: initField('f-pm', { min: 0, max: 480, step: 1, value: q.pm ?? 0, onChange: recompute }),
  pa: initField('f-pa', { min: 0, max: 500000, step: 100, value: q.pa ?? 0, onChange: recompute }),
};

const balanceChart = createLineChart(document.getElementById('chart-balance'), {
  formatX: (v) => `${Math.round(v)}년`,
  formatY: formatManwonShort,
});
const interestChart = createBarChart(document.getElementById('chart-interest'), {
  formatY: formatManwonShort,
});

const METHODS = [
  { key: 'amort', name: '원리금균등', color: '#0e9f6e', fn: scheduleAmortized },
  { key: 'equal', name: '원금균등', color: '#3b82f6', fn: scheduleEqualPrincipal },
  { key: 'bullet', name: '만기일시(거치)', color: '#d97706', fn: scheduleBullet },
];

function yearlyBalanceSeries(schedule, principal) {
  const series = [{ x: 0, y: principal }];
  for (const row of schedule.rows) {
    if (row.month % 12 === 0) series.push({ x: row.month / 12, y: row.balance });
  }
  const lastRow = schedule.rows[schedule.rows.length - 1];
  if (lastRow && lastRow.month % 12 !== 0) {
    series.push({ x: lastRow.month / 12, y: lastRow.balance });
  }
  return series;
}

function recompute() {
  if (!allValid(fields)) return;
  const principal = fields.p.get();
  const annual = fields.rate.get() / 100;
  const years = fields.years.get();
  const n = years * 12;
  const r = nominalMonthlyRate(annual);
  const prepayMonth = fields.pm.get();
  const prepayAmount = fields.pa.get();
  const hasPrepay = prepayMonth >= 1 && prepayMonth < n && prepayAmount > 0;
  const opts = hasPrepay ? { prepayments: [{ month: prepayMonth, amount: prepayAmount }] } : {};

  writeQueryParams({
    p: principal, rate: fields.rate.get(), years,
    pm: hasPrepay ? prepayMonth : 0, pa: hasPrepay ? prepayAmount : 0,
  });

  const results = METHODS.map((m) => ({ ...m, schedule: m.fn(principal, r, n, opts) }));

  // 결과 패널
  document.getElementById('result').classList.add('show');
  const amort = results[0].schedule;
  const equal = results[1].schedule;
  document.getElementById('monthly-payment').textContent = formatManwon(amort.rows[0].payment);
  document.getElementById('monthly-payment').className = 'result-big grade-good';
  document.getElementById('stat-total-amort').textContent = formatManwon(amort.totalInterest);
  document.getElementById('stat-total-equal').textContent = formatManwon(equal.totalInterest);
  document.getElementById('stat-diff').textContent = formatManwon(amort.totalInterest - equal.totalInterest);

  // 중도상환 효과
  const prepayCard = document.getElementById('prepay-effect');
  if (hasPrepay) {
    const base = scheduleAmortized(principal, r, n);
    const saved = base.totalInterest - amort.totalInterest;
    const shortened = base.months - amort.months;
    prepayCard.style.display = '';
    document.getElementById('prepay-desc').innerHTML =
      `${prepayMonth}개월 차에 <strong>${formatManwon(prepayAmount)}</strong>을 중도상환하면 ` +
      `(원리금균등 기준) 총이자를 <strong>${formatManwon(saved)}</strong> 아끼고 ` +
      `상환 기간이 <strong>${shortened}개월</strong> 단축됩니다.`;
  } else {
    prepayCard.style.display = 'none';
  }

  // 잔액 곡선
  balanceChart.update(results.map((m) => ({
    type: 'line', name: m.name, color: m.color, width: 2,
    data: yearlyBalanceSeries(m.schedule, principal),
  })));

  // 총이자 막대
  interestChart.update(results.map((m) => ({
    label: m.name, value: m.schedule.totalInterest, color: m.color,
  })));

  // 월 상환액 표
  const tbody = document.getElementById('table-body');
  tbody.innerHTML = '';
  for (const m of results) {
    const s = m.schedule;
    const first = s.rows[0];
    const last = s.rows[s.rows.length - 1];
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${m.name}</td>` +
      `<td class="num">${comma(first.payment)}만원</td>` +
      `<td class="num">${comma(last.payment)}만원</td>` +
      `<td class="num">${comma(s.totalInterest)}만원</td>` +
      `<td class="num">${comma(principal + s.totalInterest)}만원</td>`;
    tbody.appendChild(tr);
  }
}

bindShareButton(document.getElementById('btn-share'));
recompute();
