import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fvLumpSum, fvAnnuity, fvCombined, requiredPayment,
  amortizedPayment, scheduleAmortized, scheduleEqualPrincipal, scheduleBullet,
  realRate, effectiveMonthlyRate, nominalMonthlyRate,
} from '../js/core/finance.js';

function assertClose(actual, expected, relTol = 1e-9, msg = '') {
  const denom = Math.max(Math.abs(expected), 1e-12);
  assert.ok(
    Math.abs(actual - expected) / denom <= relTol,
    `${msg} expected≈${expected}, got ${actual} (relErr=${Math.abs(actual - expected) / denom})`,
  );
}

// ---- FV 일시금 ----

test('fvLumpSum: 100만원 연5% 10년 = 1,628,894.6267...', () => {
  assertClose(fvLumpSum(1_000_000, 0.05, 10), 1_628_894.6267774422);
});

test('fvLumpSum: 이율 0이면 원금 그대로', () => {
  assert.equal(fvLumpSum(500_000, 0, 30), 500_000);
});

test('fvLumpSum: 기간 0이면 원금 그대로', () => {
  assert.equal(fvLumpSum(500_000, 0.07, 0), 500_000);
});

// ---- FV 연금(적립식) ----

test('fvAnnuity 기말불: 월10만·월1%·12회 = 1,268.2503... (100 단위)', () => {
  assertClose(fvAnnuity(100, 0.01, 12), 1268.2503013196977);
});

test('fvAnnuity 기수불 = 기말불 × (1+r)', () => {
  const end = fvAnnuity(100, 0.01, 12);
  const due = fvAnnuity(100, 0.01, 12, { due: true });
  assertClose(due, end * 1.01);
});

test('fvAnnuity: 기수불 > 기말불 (이율 > 0)', () => {
  assert.ok(fvAnnuity(100, 0.005, 24, { due: true }) > fvAnnuity(100, 0.005, 24));
});

test('fvAnnuity: 이율 0이면 납입액 × 횟수', () => {
  assert.equal(fvAnnuity(300_000, 0, 120), 36_000_000);
});

test('fvCombined = fvLumpSum + fvAnnuity', () => {
  const r = 0.004, n = 240;
  assertClose(
    fvCombined(10_000_000, 500_000, r, n),
    fvLumpSum(10_000_000, r, n) + fvAnnuity(500_000, r, n),
  );
});

// ---- 필요 납입액 역산 ----

test('requiredPayment 왕복 검증: 역산한 pmt로 다시 FV 계산하면 목표액', () => {
  const r = effectiveMonthlyRate(0.05), n = 120, target = 100_000_000, pv = 5_000_000;
  const pmt = requiredPayment(target, r, n, pv);
  assertClose(fvCombined(pv, pmt, r, n), target);
});

test('requiredPayment: 일시금만으로 목표 초과 달성이면 0', () => {
  assert.equal(requiredPayment(1_000_000, 0.01, 12, 10_000_000), 0);
});

test('requiredPayment: 이율 0이면 (목표-원금)/n', () => {
  assert.equal(requiredPayment(12_000_000, 0, 12, 0), 1_000_000);
});

// ---- 대출: 원리금균등 ----

test('원리금균등 월 상환액: 3억/30년/연4% = 1,432,245.886... (공식 자체 산출값)', () => {
  assertClose(amortizedPayment(300_000_000, nominalMonthlyRate(0.04), 360), 1_432_245.8863963615, 1e-9);
});

test('원리금균등: 이율 0이면 원금/개월수', () => {
  assert.equal(amortizedPayment(120_000_000, 0, 120), 1_000_000);
});

test('원리금균등 스케줄: 360회에 잔액 0, 회차 수 360', () => {
  const s = scheduleAmortized(300_000_000, 0.04 / 12, 360);
  assert.equal(s.months, 360);
  assert.ok(Math.abs(s.rows[s.rows.length - 1].balance) < 1e-4);
});

test('원리금균등 스케줄: 원금 상환 합계 = 대출 원금', () => {
  const s = scheduleAmortized(100_000_000, 0.035 / 12, 240);
  const sumPrincipal = s.rows.reduce((a, r) => a + r.principalPaid, 0);
  assertClose(sumPrincipal, 100_000_000, 1e-8);
});

test('원리금균등 스케줄: 총이자 = 총상환액 - 원금', () => {
  const s = scheduleAmortized(200_000_000, 0.045 / 12, 360);
  assertClose(s.totalInterest, s.totalPaid - 200_000_000, 1e-8);
});

// ---- 대출: 원금균등 / 만기일시 ----

test('원금균등 총이자 < 원리금균등 총이자 (동일 조건)', () => {
  const a = scheduleAmortized(300_000_000, 0.04 / 12, 360);
  const e = scheduleEqualPrincipal(300_000_000, 0.04 / 12, 360);
  assert.ok(e.totalInterest < a.totalInterest);
});

test('원금균등: 첫 달 상환액 > 마지막 달 상환액', () => {
  const e = scheduleEqualPrincipal(100_000_000, 0.05 / 12, 120);
  assert.ok(e.rows[0].payment > e.rows[e.rows.length - 1].payment);
});

test('만기일시 총이자 = 원금 × 월이율 × 개월수', () => {
  const b = scheduleBullet(300_000_000, 0.04 / 12, 360);
  assertClose(b.totalInterest, 300_000_000 * (0.04 / 12) * 360, 1e-8);
});

test('만기일시: 마지막 회차에 원금 전액 상환, 잔액 0', () => {
  const b = scheduleBullet(50_000_000, 0.06 / 12, 36);
  const last = b.rows[b.rows.length - 1];
  assertClose(last.principalPaid, 50_000_000, 1e-9);
  assert.equal(last.balance, 0);
});

test('원리금균등 총이자 순위: 만기일시 > 원리금균등 > 원금균등', () => {
  const P = 200_000_000, r = 0.04 / 12, n = 240;
  const a = scheduleAmortized(P, r, n).totalInterest;
  const e = scheduleEqualPrincipal(P, r, n).totalInterest;
  const b = scheduleBullet(P, r, n).totalInterest;
  assert.ok(b > a && a > e);
});

// ---- 중도상환 ----

test('중도상환: 총이자 감소 + 기간 단축 (원리금균등)', () => {
  const base = scheduleAmortized(300_000_000, 0.04 / 12, 360);
  const pre = scheduleAmortized(300_000_000, 0.04 / 12, 360, {
    prepayments: [{ month: 60, amount: 50_000_000 }],
  });
  assert.ok(pre.totalInterest < base.totalInterest);
  assert.ok(pre.months < base.months);
});

test('중도상환: 상환 원금 합계는 여전히 대출 원금과 일치', () => {
  const pre = scheduleAmortized(100_000_000, 0.05 / 12, 240, {
    prepayments: [{ month: 24, amount: 20_000_000 }],
  });
  const sumPrincipal = pre.rows.reduce((a, r) => a + r.principalPaid, 0);
  assertClose(sumPrincipal, 100_000_000, 1e-8);
});

// ---- 기타 ----

test('realRate: 명목5%·물가2% → (1.05/1.02)-1', () => {
  assertClose(realRate(0.05, 0.02), 1.05 / 1.02 - 1);
});

test('effectiveMonthlyRate: 12제곱 복리하면 연이율 복원', () => {
  const m = effectiveMonthlyRate(0.07);
  assertClose(Math.pow(1 + m, 12) - 1, 0.07);
});
