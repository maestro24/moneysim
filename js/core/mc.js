/**
 * mc.js — 몬테카를로 시뮬레이션 엔진.
 *
 * 수익률 모델 (기하브라운운동, GBM)
 * - 연 수익률: r = exp(μ_log + σ·z) − 1,  z ~ N(0,1)
 * - μ_log = ln(1+μ) − σ²/2  (로그정규 보정: E[1+r] = 1+μ 가 되도록,
 *   즉 시나리오의 산술평균 수익률이 입력 기대수익률 μ와 일치)
 * - 엔진 내부는 월 단위 이산화를 사용한다:
 *   r_m = exp(μ_log/12 + (σ/√12)·z) − 1
 *   이때 E[1+r_m] = (1+μ)^(1/12) 가 정확히 성립하므로(로그정규 적률 공식),
 *   월 적립·인출 시나리오의 기대값이 닫힌형 공식과 정확히 일치한다.
 * - σ=0이면 r_m = (1+μ)^(1/12) − 1 로 결정론적 — 닫힌형과 완전 일치.
 */

/** mulberry32 시드 RNG. 같은 시드 → 같은 수열 (재현성 보장). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Box-Muller 표준정규 생성기 팩토리.
 * 반환된 함수는 호출마다 z ~ N(0,1) 하나를 반환(쌍 생성 후 캐시).
 */
export function makeNormal(rng) {
  let cache = null;
  return function normal() {
    if (cache !== null) {
      const z = cache;
      cache = null;
      return z;
    }
    let u1 = rng();
    // log(0) 방지
    while (u1 <= Number.EPSILON) u1 = rng();
    const u2 = rng();
    const mag = Math.sqrt(-2 * Math.log(u1));
    cache = mag * Math.sin(2 * Math.PI * u2);
    return mag * Math.cos(2 * Math.PI * u2);
  };
}

/** 로그 드리프트: μ_log = ln(1+μ) − σ²/2 */
export function logDrift(mu, sigma) {
  return Math.log(1 + mu) - (sigma * sigma) / 2;
}

/** 연 수익률 시나리오 1개: r = exp(μ_log + σ·z) − 1 */
export function sampleAnnualReturn(mu, sigma, z) {
  return Math.exp(logDrift(mu, sigma) + sigma * z) - 1;
}

/** 월 수익률 시나리오 1개 (연 파라미터의 1/12 스케일). */
export function sampleMonthlyReturn(mu, sigma, z) {
  return Math.exp(logDrift(mu, sigma) / 12 + (sigma / Math.sqrt(12)) * z) - 1;
}

/**
 * 은퇴 시나리오 1개 경로 시뮬레이션 (월 단위).
 *
 * 규약
 * - 저축·인출은 월말(기말불) 반영: balance = balance*(1+r_m) ± 현금흐름
 * - 월 저축액은 명목 고정(물가 미반영 — 보수적 가정).
 * - 인출액은 "현재 화폐가치 기준"으로 입력받아 t=0부터 물가상승률로 증액
 *   (은퇴 시점에는 이미 (1+π)^은퇴까지년수 만큼 커져 있음).
 *
 * @param {object} p
 * @param {number} p.initialAssets   현재 자산
 * @param {number} p.monthlySaving   월 저축액(적립 기간)
 * @param {number} p.yearsAccum      은퇴까지 년수
 * @param {number} p.yearsRetire     은퇴 후 년수
 * @param {number} p.mu              기대 연 수익률(산술평균)
 * @param {number} p.sigma           연 변동성
 * @param {number} p.monthlyWithdrawal 은퇴 후 월 인출액(현재가치)
 * @param {number} p.inflation       연 물가상승률
 * @param {() => number} normal     표준정규 샘플러
 * @returns {{yearlyBalances: number[], depletionMonth: number|null, finalBalance: number}}
 *   yearlyBalances[0] = 시작 자산, 이후 매년 말 잔액 (길이 yearsAccum+yearsRetire+1)
 */
export function simulateRetirementPath(p, normal) {
  const totalYears = p.yearsAccum + p.yearsRetire;
  const totalMonths = totalYears * 12;
  const accumMonths = p.yearsAccum * 12;
  const inflMonthly = Math.pow(1 + p.inflation, 1 / 12);
  const muLogM = logDrift(p.mu, p.sigma) / 12;
  const sigmaM = p.sigma / Math.sqrt(12);

  const yearlyBalances = new Array(totalYears + 1);
  yearlyBalances[0] = p.initialAssets;

  let balance = p.initialAssets;
  let withdrawal = p.monthlyWithdrawal; // t=0 시점 가치, 매월 물가 반영 증액
  let depletionMonth = null;

  for (let m = 1; m <= totalMonths; m++) {
    withdrawal *= inflMonthly;
    if (depletionMonth === null) {
      const r = sigmaM === 0
        ? Math.exp(muLogM) - 1
        : Math.exp(muLogM + sigmaM * normal()) - 1;
      balance *= 1 + r;
      if (m <= accumMonths) {
        balance += p.monthlySaving;
      } else {
        balance -= withdrawal;
        if (balance <= 0) {
          balance = 0;
          depletionMonth = m;
        }
      }
    } else if (sigmaM !== 0) {
      // 고갈 후에도 난수 소비를 유지해 경로 간 독립성 보존(선택적) — 소비하지 않음.
    }
    if (m % 12 === 0) yearlyBalances[m / 12] = balance;
  }
  return { yearlyBalances, depletionMonth, finalBalance: balance };
}

/**
 * 은퇴 몬테카를로 실행 + 집계.
 * 원시 경로는 반환하지 않고 백분위 밴드·성공률·고갈 히스토그램만 집계해 반환한다.
 *
 * @param {object} params simulateRetirementPath 파라미터
 * @param {{n?: number, seed?: number, onProgress?: (done:number,total:number)=>void, progressEvery?: number}} [opts]
 * @returns {{
 *   years: number[],
 *   p10: number[], p50: number[], p90: number[],
 *   successRate: number,
 *   depletionYearCounts: number[],  // index = 경과 년수(1~totalYears), 값 = 해당 연도에 고갈된 시나리오 수
 *   meanFinal: number,
 *   n: number, seed: number
 * }}
 */
export function runRetirementMC(params, opts = {}) {
  const n = opts.n ?? 10000;
  const seed = opts.seed ?? 20260713;
  const progressEvery = opts.progressEvery ?? 1000;
  const rng = mulberry32(seed);
  const normal = makeNormal(rng);

  const totalYears = params.yearsAccum + params.yearsRetire;
  // 연도별 잔액 수집: (totalYears+1) x n
  const byYear = [];
  for (let y = 0; y <= totalYears; y++) byYear.push(new Float64Array(n));
  const depletionYearCounts = new Array(totalYears + 1).fill(0);
  let successes = 0;
  let sumFinal = 0;

  for (let i = 0; i < n; i++) {
    const path = simulateRetirementPath(params, normal);
    for (let y = 0; y <= totalYears; y++) byYear[y][i] = path.yearlyBalances[y];
    if (path.depletionMonth === null) {
      successes += 1;
    } else {
      const year = Math.ceil(path.depletionMonth / 12);
      depletionYearCounts[Math.min(year, totalYears)] += 1;
    }
    sumFinal += path.finalBalance;
    if (opts.onProgress && (i + 1) % progressEvery === 0) {
      opts.onProgress(i + 1, n);
    }
  }

  const p10 = new Array(totalYears + 1);
  const p50 = new Array(totalYears + 1);
  const p90 = new Array(totalYears + 1);
  const years = new Array(totalYears + 1);
  for (let y = 0; y <= totalYears; y++) {
    const sorted = Array.from(byYear[y]).sort((a, b) => a - b);
    p10[y] = quantileSorted(sorted, 0.10);
    p50[y] = quantileSorted(sorted, 0.50);
    p90[y] = quantileSorted(sorted, 0.90);
    years[y] = y;
  }

  return {
    years, p10, p50, p90,
    successRate: successes / n,
    depletionYearCounts,
    meanFinal: sumFinal / n,
    n, seed,
  };
}

// 선형 보간 분위수(내부용, stats.percentileSorted와 동일 규약)
function quantileSorted(sorted, q) {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const idx = q * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}
