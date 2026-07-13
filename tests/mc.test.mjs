import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mulberry32, makeNormal, logDrift, sampleAnnualReturn, sampleMonthlyReturn,
  simulateRetirementPath, runRetirementMC,
} from '../js/core/mc.js';
import { fvCombined, fvLumpSum, fvAnnuity, effectiveMonthlyRate } from '../js/core/finance.js';

function assertClose(actual, expected, relTol, msg = '') {
  const denom = Math.max(Math.abs(expected), 1e-12);
  assert.ok(
    Math.abs(actual - expected) / denom <= relTol,
    `${msg} expected≈${expected}, got ${actual} (relErr=${Math.abs(actual - expected) / denom})`,
  );
}

// ---- RNG ----

test('mulberry32: 같은 시드 → 같은 수열 (재현성)', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
});

test('mulberry32: 다른 시드 → 다른 수열', () => {
  const a = mulberry32(1), b = mulberry32(2);
  const seqA = [a(), a(), a()], seqB = [b(), b(), b()];
  assert.notDeepEqual(seqA, seqB);
});

test('mulberry32: 출력이 [0, 1) 범위', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 10000; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

// ---- Box-Muller 정규분포 ----

test('makeNormal: 표본 평균 ≈ 0, 표준편차 ≈ 1 (n=100,000)', () => {
  const normal = makeNormal(mulberry32(123));
  const n = 100_000;
  let sum = 0, sumSq = 0;
  for (let i = 0; i < n; i++) {
    const z = normal();
    sum += z;
    sumSq += z * z;
  }
  const mean = sum / n;
  const std = Math.sqrt(sumSq / n - mean * mean);
  assert.ok(Math.abs(mean) < 0.02, `mean=${mean}`);
  assert.ok(Math.abs(std - 1) < 0.02, `std=${std}`);
});

// ---- GBM 수익률 시나리오 ----

test('logDrift: μ_log = ln(1+μ) − σ²/2', () => {
  assertClose(logDrift(0.06, 0.15), Math.log(1.06) - 0.15 * 0.15 / 2, 1e-12);
});

test('sampleAnnualReturn: σ=0이면 정확히 μ', () => {
  assertClose(sampleAnnualReturn(0.06, 0, 0), 0.06, 1e-12);
  assertClose(sampleAnnualReturn(0.06, 0, 3.5), 0.06, 1e-12); // z 무관
});

test('sampleAnnualReturn: 표본 산술평균이 μ에 수렴 (n=200,000, ±1%)', () => {
  const normal = makeNormal(mulberry32(777));
  const mu = 0.06, sigma = 0.15, n = 200_000;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += sampleAnnualReturn(mu, sigma, normal());
  assertClose(sum / n, mu, 0.01, 'E[r]≈μ');
});

test('sampleMonthlyReturn: σ=0이면 (1+μ)^(1/12)−1', () => {
  assertClose(sampleMonthlyReturn(0.06, 0, 0), Math.pow(1.06, 1 / 12) - 1, 1e-12);
});

// ---- σ=0: 닫힌형과 완전 일치 ----

test('σ=0 적립 경로 = 닫힌형 fvCombined 완전 일치', () => {
  const params = {
    initialAssets: 10_000_000, monthlySaving: 500_000,
    yearsAccum: 30, yearsRetire: 0,
    mu: 0.06, sigma: 0, monthlyWithdrawal: 0, inflation: 0.02,
  };
  const path = simulateRetirementPath(params, makeNormal(mulberry32(1)));
  const m = effectiveMonthlyRate(0.06);
  const expected = fvCombined(10_000_000, 500_000, m, 360);
  assertClose(path.finalBalance, expected, 1e-9);
  assert.equal(path.depletionMonth, null);
});

test('σ=0 인출 경로 = 닫힌형 (FV잔액 − 인출연금FV) 완전 일치', () => {
  // 물가 0, σ=0: 은퇴 후 잔액 = B·(1+m)^N − w·((1+m)^N−1)/m
  const params = {
    initialAssets: 500_000_000, monthlySaving: 0,
    yearsAccum: 0, yearsRetire: 20,
    mu: 0.04, sigma: 0, monthlyWithdrawal: 2_000_000, inflation: 0,
  };
  const path = simulateRetirementPath(params, makeNormal(mulberry32(1)));
  const m = effectiveMonthlyRate(0.04);
  const expected = fvLumpSum(500_000_000, m, 240) - fvAnnuity(2_000_000, m, 240);
  assertClose(path.finalBalance, expected, 1e-9);
  assert.equal(path.depletionMonth, null);
});

test('σ=0: 인출이 과도하면 결정론적으로 고갈', () => {
  const params = {
    initialAssets: 100_000_000, monthlySaving: 0,
    yearsAccum: 0, yearsRetire: 30,
    mu: 0.03, sigma: 0, monthlyWithdrawal: 5_000_000, inflation: 0,
  };
  const path = simulateRetirementPath(params, makeNormal(mulberry32(1)));
  assert.notEqual(path.depletionMonth, null);
  assert.equal(path.finalBalance, 0);
  // 대략 100M / 5M ≈ 20~22개월 부근에서 고갈
  assert.ok(path.depletionMonth >= 20 && path.depletionMonth <= 24, `depleted at ${path.depletionMonth}`);
});

// ---- 몬테카를로 집계 ----

const MC_PARAMS = {
  initialAssets: 100_000_000, monthlySaving: 1_000_000,
  yearsAccum: 15, yearsRetire: 25,
  mu: 0.06, sigma: 0.12, monthlyWithdrawal: 2_500_000, inflation: 0.02,
};

test('runRetirementMC: 같은 시드 → 완전히 같은 결과 (재현성)', () => {
  const r1 = runRetirementMC(MC_PARAMS, { n: 2000, seed: 555 });
  const r2 = runRetirementMC(MC_PARAMS, { n: 2000, seed: 555 });
  assert.equal(r1.successRate, r2.successRate);
  assert.deepEqual(r1.p50, r2.p50);
  assert.deepEqual(r1.depletionYearCounts, r2.depletionYearCounts);
});

test('runRetirementMC: 다른 시드 → 다른 결과', () => {
  const r1 = runRetirementMC(MC_PARAMS, { n: 2000, seed: 1 });
  const r2 = runRetirementMC(MC_PARAMS, { n: 2000, seed: 2 });
  assert.notDeepEqual(r1.p50, r2.p50);
});

test('runRetirementMC: σ>0 10,000회 평균이 닫힌형 기대값 ±1% 수렴', () => {
  // 적립만(인출 0): E[FV] = 닫힌형 fvCombined (월 이산화로 정확히 성립)
  const params = {
    initialAssets: 10_000_000, monthlySaving: 500_000,
    yearsAccum: 30, yearsRetire: 0,
    mu: 0.06, sigma: 0.12, monthlyWithdrawal: 0, inflation: 0.02,
  };
  const res = runRetirementMC(params, { n: 10_000, seed: 20260713 });
  const m = effectiveMonthlyRate(0.06);
  const expected = fvCombined(10_000_000, 500_000, m, 360);
  assertClose(res.meanFinal, expected, 0.01, 'E[FV] 수렴');
});

test('runRetirementMC: 백분위 단조성 p10 ≤ p50 ≤ p90 (전 연도)', () => {
  const res = runRetirementMC(MC_PARAMS, { n: 3000, seed: 99 });
  for (let y = 0; y < res.years.length; y++) {
    assert.ok(res.p10[y] <= res.p50[y] + 1e-9, `year ${y}: p10 > p50`);
    assert.ok(res.p50[y] <= res.p90[y] + 1e-9, `year ${y}: p50 > p90`);
  }
});

test('runRetirementMC: 고갈 히스토그램 합 = 실패 시나리오 수', () => {
  const res = runRetirementMC(MC_PARAMS, { n: 3000, seed: 42 });
  const failures = res.depletionYearCounts.reduce((a, b) => a + b, 0);
  assert.equal(failures, Math.round(3000 * (1 - res.successRate)));
});

test('runRetirementMC: 인출 0이면 성공률 100%', () => {
  const params = { ...MC_PARAMS, monthlyWithdrawal: 0 };
  const res = runRetirementMC(params, { n: 1000, seed: 3 });
  assert.equal(res.successRate, 1);
});

test('runRetirementMC: 진행률 콜백이 progressEvery마다 호출', () => {
  const calls = [];
  runRetirementMC(MC_PARAMS, {
    n: 3000, seed: 5, progressEvery: 1000,
    onProgress: (done, total) => calls.push([done, total]),
  });
  assert.deepEqual(calls, [[1000, 3000], [2000, 3000], [3000, 3000]]);
});

test('runRetirementMC: 연도 배열 길이 = 적립+은퇴 년수 + 1', () => {
  const res = runRetirementMC(MC_PARAMS, { n: 500, seed: 8 });
  assert.equal(res.years.length, MC_PARAMS.yearsAccum + MC_PARAMS.yearsRetire + 1);
  assert.equal(res.p10.length, res.years.length);
});
