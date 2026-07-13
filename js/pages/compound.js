/**
 * compound.js — 복리 계산기 (일시금 + 월 적립, 연/월 복리).
 * 금액 단위: 만원.
 */
import { nominalMonthlyRate, effectiveMonthlyRate } from '../core/finance.js';
import { initField, allValid } from '../ui/field.js';
import { formatManwon, formatManwonShort, comma } from '../ui/format.js';
import { readQueryParams, writeQueryParams, bindShareButton } from '../ui/share.js';
import { createLineChart } from '../chart/linechart.js';

const q = readQueryParams(['pv', 'pmt', 'rate', 'years', 'comp']);

const fields = {
  pv: initField('f-pv', { min: 0, max: 1000000, step: 100, value: q.pv ?? 1000, onChange: recompute }),
  pmt: initField('f-pmt', { min: 0, max: 5000, step: 10, value: q.pmt ?? 50, onChange: recompute }),
  rate: initField('f-rate', { min: 0, max: 20, step: 0.1, value: q.rate ?? 6, onChange: recompute }),
  years: initField('f-years', { min: 1, max: 50, step: 1, value: q.years ?? 20, onChange: recompute }),
};

const compSelect = document.getElementById('f-comp');
if (q.comp === 1) compSelect.value = 'monthly';
compSelect.addEventListener('change', recompute);

const chart = createLineChart(document.getElementById('chart-growth'), {
  formatX: (v) => `${Math.round(v)}년`,
  formatY: formatManwonShort,
});

function recompute() {
  if (!allValid(fields)) return;
  const pv = fields.pv.get();
  const pmt = fields.pmt.get();
  const annual = fields.rate.get() / 100;
  const years = fields.years.get();
  const monthlyComp = compSelect.value === 'monthly';
  // 연복리: 실효 월 이율 (연간 실효수익률 = 입력값), 월복리: 명목 r/12 (실효 > 입력값)
  const m = monthlyComp ? nominalMonthlyRate(annual) : effectiveMonthlyRate(annual);

  writeQueryParams({
    pv, pmt, rate: fields.rate.get(), years, comp: monthlyComp ? 1 : 0,
  });

  // 월 단위 시뮬레이션 (닫힌형과 동일하지만 연도별 스냅샷 필요)
  const principalSeries = [{ x: 0, y: pv }];
  const totalSeries = [{ x: 0, y: pv }];
  const rows = [];
  let balance = pv;
  let contributed = pv;
  for (let y = 1; y <= years; y++) {
    for (let mo = 0; mo < 12; mo++) {
      balance = balance * (1 + m) + pmt;
      contributed += pmt;
    }
    principalSeries.push({ x: y, y: contributed });
    totalSeries.push({ x: y, y: balance });
    rows.push({ year: y, contributed, interest: balance - contributed, total: balance });
  }

  // 결과 패널
  const finalRow = rows[rows.length - 1];
  document.getElementById('result').classList.add('show');
  document.getElementById('final-total').textContent = formatManwon(finalRow.total);
  document.getElementById('final-total').className = 'result-big grade-good';
  document.getElementById('stat-principal').textContent = formatManwon(finalRow.contributed);
  document.getElementById('stat-interest').textContent = formatManwon(finalRow.interest);
  document.getElementById('stat-ratio').textContent =
    finalRow.total > 0 ? ((finalRow.interest / finalRow.total) * 100).toFixed(1) + '%' : '-';

  // 차트: 원금 영역 + 이자 밴드(원금~총액)
  const interestBand = totalSeries.map((d, i) => ({ x: d.x, y0: principalSeries[i].y, y1: d.y }));
  chart.update([
    { type: 'area', name: '납입 원금', color: '#64748b', alpha: 0.25, data: principalSeries },
    { type: 'band', name: '이자(수익)', color: '#0e9f6e', alpha: 0.3, data: interestBand },
    { type: 'line', name: '총자산', color: '#057a55', width: 2.5, data: totalSeries },
  ]);

  // 연도별 표 (최대 50행)
  const tbody = document.getElementById('table-body');
  tbody.innerHTML = '';
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${r.year}년</td>` +
      `<td class="num">${comma(r.contributed)}만원</td>` +
      `<td class="num">${comma(r.interest)}만원</td>` +
      `<td class="num">${comma(r.total)}만원</td>`;
    tbody.appendChild(tr);
  }
}

bindShareButton(document.getElementById('btn-share'));
recompute();
