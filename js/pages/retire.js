/**
 * retire.js — 은퇴 시뮬레이터 페이지 로직 (Web Worker 몬테카를로).
 * 금액 단위: 만원.
 */
import { initField, allValid } from '../ui/field.js';
import { formatManwon, formatManwonShort, formatPercent } from '../ui/format.js';
import { readQueryParams, writeQueryParams, bindShareButton } from '../ui/share.js';
import { createLineChart } from '../chart/linechart.js';
import { createHistogram } from '../chart/barchart.js';

const N_SCENARIOS = 10000;
const SEED = 20260713;

const PRESETS = {
  conservative: { mu: 4, sigma: 8 },
  neutral: { mu: 6, sigma: 12 },
  aggressive: { mu: 8, sigma: 18 },
};

const q = readQueryParams(['asset', 'save', 'y1', 'y2', 'mu', 'sigma', 'draw', 'infl']);

const fields = {
  asset: initField('f-asset', { min: 0, max: 1000000, step: 100, value: q.asset ?? 10000, onChange: scheduleRun }),
  save: initField('f-save', { min: 0, max: 5000, step: 10, value: q.save ?? 150, onChange: scheduleRun }),
  y1: initField('f-y1', { min: 0, max: 50, step: 1, value: q.y1 ?? 20, onChange: scheduleRun }),
  y2: initField('f-y2', { min: 1, max: 60, step: 1, value: q.y2 ?? 30, onChange: scheduleRun }),
  mu: initField('f-mu', { min: 0, max: 15, step: 0.5, value: q.mu ?? 6, onChange: scheduleRun }),
  sigma: initField('f-sigma', { min: 0, max: 40, step: 0.5, value: q.sigma ?? 12, onChange: scheduleRun }),
  draw: initField('f-draw', { min: 0, max: 5000, step: 10, value: q.draw ?? 250, onChange: scheduleRun }),
  infl: initField('f-infl', { min: 0, max: 10, step: 0.1, value: q.infl ?? 2, onChange: scheduleRun }),
};

// 프리셋 버튼
document.querySelectorAll('.preset-btn[data-preset]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const p = PRESETS[btn.dataset.preset];
    if (!p) return;
    document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    fields.mu.set(p.mu);
    fields.sigma.set(p.sigma);
    run();
  });
});

// ---- Worker ----
let worker = null;
let workerFailed = false;
function getWorker() {
  if (worker || workerFailed) return worker;
  try {
    worker = new Worker('./worker.js', { type: 'module' });
    worker.onmessage = onWorkerMessage;
    worker.onerror = () => { workerFailed = true; worker = null; };
  } catch {
    workerFailed = true;
  }
  return worker;
}

// ---- 차트 ----
const bandChart = createLineChart(document.getElementById('chart-band'), {
  formatX: (v) => `${Math.round(v)}년`,
  formatY: formatManwonShort,
});
const histChart = createHistogram(document.getElementById('chart-hist'), {
  formatX: (v) => `${Math.round(v)}년`,
  formatCount: (v) => String(Math.round(v)),
  color: '#dc2626',
});

const runBtn = document.getElementById('btn-run');
const progressWrap = document.getElementById('progress');
const progressFill = progressWrap.querySelector('.progress-fill');
const progressText = progressWrap.querySelector('.progress-text');
const resultPanel = document.getElementById('result');

let running = false;
let debounceTimer = null;

function scheduleRun() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(run, 500);
}

function currentParams() {
  return {
    initialAssets: fields.asset.get(),
    monthlySaving: fields.save.get(),
    yearsAccum: fields.y1.get(),
    yearsRetire: fields.y2.get(),
    mu: fields.mu.get() / 100,
    sigma: fields.sigma.get() / 100,
    monthlyWithdrawal: fields.draw.get(),
    inflation: fields.infl.get() / 100,
  };
}

function run() {
  if (running || !allValid(fields)) return;
  running = true;
  runBtn.disabled = true;
  progressWrap.classList.add('show');
  progressFill.style.width = '0%';
  progressText.textContent = '시뮬레이션 준비 중…';

  writeQueryParams({
    asset: fields.asset.get(), save: fields.save.get(),
    y1: fields.y1.get(), y2: fields.y2.get(),
    mu: fields.mu.get(), sigma: fields.sigma.get(),
    draw: fields.draw.get(), infl: fields.infl.get(),
  });

  const params = currentParams();
  const w = getWorker();
  if (w) {
    w.postMessage({ type: 'run', params, opts: { n: N_SCENARIOS, seed: SEED } });
  } else {
    // Worker 미지원 폴백: 메인 스레드에서 실행
    import('../core/mc.js').then((mc) => {
      const data = mc.runRetirementMC(params, { n: N_SCENARIOS, seed: SEED });
      onResult(data);
    }).catch((err) => onError(String(err)));
  }
}

function onWorkerMessage(ev) {
  const msg = ev.data;
  if (msg.type === 'progress') {
    const pct = Math.round((msg.done / msg.total) * 100);
    progressFill.style.width = pct + '%';
    progressText.textContent = `${msg.done.toLocaleString('ko-KR')} / ${msg.total.toLocaleString('ko-KR')} 시나리오 (${pct}%)`;
  } else if (msg.type === 'result') {
    onResult(msg.data);
  } else if (msg.type === 'error') {
    onError(msg.message);
  }
}

function onError(message) {
  running = false;
  runBtn.disabled = false;
  progressWrap.classList.remove('show');
  progressText.textContent = '';
  alert('시뮬레이션 오류: ' + message);
}

function onResult(data) {
  running = false;
  runBtn.disabled = false;
  progressFill.style.width = '100%';
  setTimeout(() => progressWrap.classList.remove('show'), 300);
  resultPanel.classList.add('show');

  // 성공확률
  const rate = data.successRate;
  const bigEl = document.getElementById('success-rate');
  bigEl.textContent = formatPercent(rate, 1);
  bigEl.className = 'result-big ' + (rate >= 0.9 ? 'grade-good' : rate >= 0.7 ? 'grade-warn' : 'grade-bad');
  document.getElementById('success-sub').textContent =
    `10,000개 시나리오 중 ${Math.round(rate * 10000).toLocaleString('ko-KR')}개에서 자산이 고갈되지 않았습니다`;

  // 통계
  const last = data.years.length - 1;
  document.getElementById('stat-median').textContent = formatManwon(data.p50[last]);
  document.getElementById('stat-p10').textContent = formatManwon(data.p10[last]);
  document.getElementById('stat-p90').textContent = formatManwon(data.p90[last]);

  // 밴드 차트
  const bandData = data.years.map((y, i) => ({ x: y, y0: data.p10[i], y1: data.p90[i] }));
  const medianData = data.years.map((y, i) => ({ x: y, y: data.p50[i] }));
  bandChart.update([
    { type: 'band', name: '10~90% 구간', color: '#0e9f6e', data: bandData },
    { type: 'line', name: '중앙값(50%)', color: '#057a55', width: 2.5, data: medianData },
  ]);

  // 고갈 히스토그램
  const histCard = document.getElementById('hist-card');
  const failTotal = data.depletionYearCounts.reduce((a, b) => a + b, 0);
  if (failTotal > 0) {
    // .result-panel 클래스가 display:none이므로 인라인 block으로 덮어써야 보인다
    histCard.style.display = 'block';
    const bins = [];
    data.depletionYearCounts.forEach((count, year) => {
      if (year === 0) return;
      bins.push({ x0: year - 1, x1: year, count });
    });
    // 앞쪽의 0 구간 잘라내기
    let first = bins.findIndex((b) => b.count > 0);
    if (first < 0) first = 0;
    histChart.update(bins.slice(first));
    document.getElementById('hist-desc').textContent =
      `실패한 ${failTotal.toLocaleString('ko-KR')}개 시나리오의 고갈 시점 분포입니다 (지금부터 경과 년수).`;
  } else {
    histCard.style.display = 'none';
  }
}

bindShareButton(document.getElementById('btn-share'));
runBtn.addEventListener('click', run);

// 초기 실행
run();
