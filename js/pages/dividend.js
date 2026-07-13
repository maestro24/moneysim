/**
 * dividend.js — 배당 재투자 스노우볼 계산기.
 * 모델: 주가 P는 주가성장률로, 주당 배당 D는 배당성장률로 독립 성장.
 *       배당은 매월 1/12씩 지급되고 전액 재투자(vs 미재투자 비교).
 * 금액 단위: 만원.
 */
import { initField, allValid } from '../ui/field.js';
import { formatManwon, formatManwonShort, formatMonths, comma } from '../ui/format.js';
import { readQueryParams, writeQueryParams, bindShareButton } from '../ui/share.js';
import { createLineChart } from '../chart/linechart.js';

const HORIZON_YEARS = 30;

const q = readQueryParams(['init', 'yield', 'dg', 'pg', 'pmt', 'target']);

const fields = {
  init: initField('f-init', { min: 0, max: 1000000, step: 100, value: q.init ?? 5000, onChange: recompute }),
  yield: initField('f-yield', { min: 0, max: 15, step: 0.1, value: q.yield ?? 3.5, onChange: recompute }),
  dg: initField('f-dg', { min: 0, max: 20, step: 0.5, value: q.dg ?? 5, onChange: recompute }),
  pg: initField('f-pg', { min: -5, max: 20, step: 0.5, value: q.pg ?? 5, onChange: recompute }),
  pmt: initField('f-pmt', { min: 0, max: 5000, step: 10, value: q.pmt ?? 100, onChange: recompute }),
  target: initField('f-target', { min: 1, max: 3000, step: 10, value: q.target ?? 100, onChange: recompute }),
};

const valueChart = createLineChart(document.getElementById('chart-value'), {
  formatX: (v) => `${Math.round(v)}년`,
  formatY: formatManwonShort,
});
const divChart = createLineChart(document.getElementById('chart-dividend'), {
  formatX: (v) => `${Math.round(v)}년`,
  formatY: (v) => comma(v) + '만',
});

/**
 * 월 단위 시뮬레이션.
 * @param {boolean} reinvest 배당 재투자 여부
 */
function simulate(p, reinvest) {
  const P0 = 1; // 주가 정규화
  const priceM = Math.pow(1 + p.priceGrowth, 1 / 12);
  const divM = Math.pow(1 + p.divGrowth, 1 / 12);
  let shares = p.initial / P0;
  let price = P0;
  let divPerShareMonthly = (P0 * p.yield0) / 12; // 주당 월 배당
  const valueSeries = [{ x: 0, y: p.initial }];
  const monthlyDivSeries = [{ x: 0, y: shares * divPerShareMonthly }];
  let reachMonth = null;
  let cumDividends = 0;

  for (let m = 1; m <= HORIZON_YEARS * 12; m++) {
    price *= priceM;
    divPerShareMonthly *= divM;
    const divIncome = shares * divPerShareMonthly;
    cumDividends += divIncome;
    const invest = p.monthly + (reinvest ? divIncome : 0);
    if (invest > 0) shares += invest / price;
    if (reachMonth === null && divIncome >= p.target) reachMonth = m;
    if (m % 12 === 0) {
      valueSeries.push({ x: m / 12, y: shares * price });
      monthlyDivSeries.push({ x: m / 12, y: shares * divPerShareMonthly });
    }
  }
  return { valueSeries, monthlyDivSeries, reachMonth, cumDividends, finalValue: shares * price };
}

function recompute() {
  if (!allValid(fields)) return;
  const p = {
    initial: fields.init.get(),
    yield0: fields.yield.get() / 100,
    divGrowth: fields.dg.get() / 100,
    priceGrowth: fields.pg.get() / 100,
    monthly: fields.pmt.get(),
    target: fields.target.get(),
  };
  writeQueryParams({
    init: p.initial, yield: fields.yield.get(), dg: fields.dg.get(),
    pg: fields.pg.get(), pmt: p.monthly, target: p.target,
  });

  const re = simulate(p, true);
  const noRe = simulate(p, false);

  document.getElementById('result').classList.add('show');
  const reachEl = document.getElementById('reach-time');
  if (re.reachMonth !== null) {
    reachEl.textContent = formatMonths(re.reachMonth);
    reachEl.className = 'result-big grade-good';
    document.getElementById('reach-sub').textContent =
      `배당 재투자 시 월 배당 ${comma(p.target)}만원에 도달하는 시점입니다`;
  } else {
    reachEl.textContent = `${HORIZON_YEARS}년 내 미도달`;
    reachEl.className = 'result-big grade-bad';
    document.getElementById('reach-sub').textContent =
      `${HORIZON_YEARS}년 안에 월 배당 ${comma(p.target)}만원에 도달하지 못합니다`;
  }

  const lastDiv = re.monthlyDivSeries[re.monthlyDivSeries.length - 1].y;
  const div10 = re.monthlyDivSeries.find((d) => d.x === 10);
  document.getElementById('stat-final').textContent = formatManwon(re.finalValue);
  document.getElementById('stat-div10').textContent = div10 ? formatManwon(div10.y) : '-';
  document.getElementById('stat-div30').textContent = formatManwon(lastDiv);
  document.getElementById('stat-snowball').textContent = formatManwon(re.finalValue - noRe.finalValue);

  valueChart.update([
    { type: 'area', name: '재투자 안 함', color: '#64748b', alpha: 0.15, data: noRe.valueSeries },
    { type: 'area', name: '배당 재투자(스노우볼)', color: '#0e9f6e', alpha: 0.2, data: re.valueSeries },
  ]);

  const targetLine = re.monthlyDivSeries.map((d) => ({ x: d.x, y: p.target }));
  divChart.update([
    { type: 'line', name: '월 배당(재투자)', color: '#057a55', width: 2.5, data: re.monthlyDivSeries },
    { type: 'line', name: '월 배당(재투자 안 함)', color: '#64748b', width: 1.5, dash: [3, 3], data: noRe.monthlyDivSeries },
    { type: 'line', name: `목표 ${comma(p.target)}만원`, color: '#d97706', width: 1.5, dash: [6, 4], data: targetLine },
  ]);
}

bindShareButton(document.getElementById('btn-share'));
recompute();
