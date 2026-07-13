/**
 * finance.js — 닫힌형(closed-form) 금융 공식 모음.
 *
 * 규약
 * - 모든 함수는 부동소수(float)를 그대로 반환한다. 반올림·원화 표시는 UI 층 책임.
 * - 이율 표기: 소수(0.05 = 연 5%).
 * - 월 이율 변환은 두 가지 규약을 명시적으로 제공한다.
 *   - nominalMonthlyRate: r/12 (대출 관행 — 한국 대출 이자 계산 표준)
 *   - effectiveMonthlyRate: (1+r)^(1/12) - 1 (투자 복리 — 연 수익률과 정합)
 */

/** 명목 월 이율(대출 관행): 연이율 / 12 */
export function nominalMonthlyRate(annualRate) {
  return annualRate / 12;
}

/** 실효 월 이율(투자 복리): (1+연이율)^(1/12) - 1 */
export function effectiveMonthlyRate(annualRate) {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

/**
 * 일시금 미래가치: FV = PV * (1+r)^n
 * @param {number} pv 현재 일시금
 * @param {number} rate 기간당 이율
 * @param {number} n 기간 수
 */
export function fvLumpSum(pv, rate, n) {
  return pv * Math.pow(1 + rate, n);
}

/**
 * 정기 적립(연금) 미래가치.
 * 기말불(ordinary annuity, 기본): FV = PMT * ((1+r)^n - 1) / r
 * 기수불(annuity due, due=true): 위 값 * (1+r)
 * r=0이면 FV = PMT * n.
 * @param {number} pmt 기간당 납입액
 * @param {number} rate 기간당 이율
 * @param {number} n 납입 횟수
 * @param {{due?: boolean}} [opts] due=true면 기수불(기간 초 납입)
 */
export function fvAnnuity(pmt, rate, n, opts = {}) {
  const due = opts.due === true;
  if (n <= 0) return 0;
  if (rate === 0) return pmt * n;
  const factor = (Math.pow(1 + rate, n) - 1) / rate;
  return pmt * factor * (due ? 1 + rate : 1);
}

/**
 * 일시금 + 정기 적립 결합 미래가치.
 */
export function fvCombined(pv, pmt, rate, n, opts = {}) {
  return fvLumpSum(pv, rate, n) + fvAnnuity(pmt, rate, n, opts);
}

/**
 * 목표 미래가치 달성에 필요한 기간당 납입액(역산, 닫힌형).
 * PMT = (FV - PV*(1+r)^n) / annuityFactor
 * 이미 일시금만으로 목표를 넘으면 0을 반환.
 */
export function requiredPayment(targetFV, rate, n, pv = 0, opts = {}) {
  if (n <= 0) return NaN;
  const remaining = targetFV - fvLumpSum(pv, rate, n);
  if (remaining <= 0) return 0;
  if (rate === 0) return remaining / n;
  const due = opts.due === true;
  const factor = ((Math.pow(1 + rate, n) - 1) / rate) * (due ? 1 + rate : 1);
  return remaining / factor;
}

/**
 * 원리금균등 월 상환액: A = P * r(1+r)^n / ((1+r)^n - 1)
 * r=0이면 P/n.
 * @param {number} principal 대출 원금 P
 * @param {number} rate 기간당(월) 이율 r
 * @param {number} n 상환 횟수
 */
export function amortizedPayment(principal, rate, n) {
  if (n <= 0) return NaN;
  if (rate === 0) return principal / n;
  const pow = Math.pow(1 + rate, n);
  return (principal * rate * pow) / (pow - 1);
}

/**
 * 원리금균등 상환 스케줄.
 * 중도상환(prepayment) 지원: 해당 회차 정기 상환 직후 원금을 추가 상환하고,
 * 월 상환액은 유지한 채 기간을 단축한다(기간단축형).
 * @param {number} principal 원금
 * @param {number} rate 월 이율
 * @param {number} n 개월 수
 * @param {{prepayments?: Array<{month: number, amount: number}>}} [opts]
 * @returns {{rows: Array<{month:number,payment:number,interest:number,principalPaid:number,balance:number}>, totalInterest: number, totalPaid: number, months: number}}
 */
export function scheduleAmortized(principal, rate, n, opts = {}) {
  const prepayMap = buildPrepayMap(opts.prepayments);
  const basePayment = amortizedPayment(principal, rate, n);
  const eps = payoffEpsilon(principal);
  const rows = [];
  let balance = principal;
  let totalInterest = 0;
  let totalPaid = 0;
  let month = 0;
  const maxMonths = n + 600; // 안전 상한
  while (balance > eps && month < maxMonths) {
    month += 1;
    const interest = balance * rate;
    let payment = basePayment;
    let principalPaid = payment - interest;
    if (principalPaid >= balance - eps) {
      principalPaid = balance;
      payment = interest + principalPaid;
    }
    balance -= principalPaid;
    const extra = applyPrepay(prepayMap, month, balance);
    balance -= extra;
    principalPaid += extra;
    payment += extra;
    totalInterest += interest;
    totalPaid += payment;
    rows.push({ month, payment, interest, principalPaid, balance });
  }
  return { rows, totalInterest, totalPaid, months: month };
}

/**
 * 원금균등 상환 스케줄: 매월 원금 P/n 고정 + 잔액 이자.
 * 중도상환은 남은 원금·잔여 회차 기준으로 월 원금을 재계산하지 않고
 * 잔액에서 차감(기간단축형).
 */
export function scheduleEqualPrincipal(principal, rate, n, opts = {}) {
  const prepayMap = buildPrepayMap(opts.prepayments);
  const monthlyPrincipal = principal / n;
  const eps = payoffEpsilon(principal);
  const rows = [];
  let balance = principal;
  let totalInterest = 0;
  let totalPaid = 0;
  let month = 0;
  const maxMonths = n + 600;
  while (balance > eps && month < maxMonths) {
    month += 1;
    const interest = balance * rate;
    let principalPaid = monthlyPrincipal >= balance - eps ? balance : monthlyPrincipal;
    balance -= principalPaid;
    const extra = applyPrepay(prepayMap, month, balance);
    balance -= extra;
    principalPaid += extra;
    const payment = interest + principalPaid;
    totalInterest += interest;
    totalPaid += payment;
    rows.push({ month, payment, interest, principalPaid, balance });
  }
  return { rows, totalInterest, totalPaid, months: month };
}

/**
 * 만기일시 상환(전 기간 거치): 매월 이자만 납부, 만기에 원금 일시 상환.
 * 중도상환 시 잔액이 줄어 이후 이자가 감소한다.
 */
export function scheduleBullet(principal, rate, n, opts = {}) {
  const prepayMap = buildPrepayMap(opts.prepayments);
  const rows = [];
  let balance = principal;
  let totalInterest = 0;
  let totalPaid = 0;
  for (let month = 1; month <= n; month++) {
    const interest = balance * rate;
    let principalPaid = 0;
    if (month === n) {
      principalPaid = balance;
      balance = 0;
    } else {
      const extra = applyPrepay(prepayMap, month, balance);
      balance -= extra;
      principalPaid = extra;
    }
    const payment = interest + principalPaid;
    totalInterest += interest;
    totalPaid += payment;
    rows.push({ month, payment, interest, principalPaid, balance });
    if (balance <= 1e-9 && month < n) break;
  }
  return { rows, totalInterest, totalPaid, months: rows.length };
}

/**
 * 실질수익률(피셔 방정식): (1+명목) / (1+물가) - 1
 */
export function realRate(nominalRate, inflationRate) {
  return (1 + nominalRate) / (1 + inflationRate) - 1;
}

// ---- 내부 유틸 ----

/** 부동소수 잔여를 상환 완료로 간주하는 임계값(원금 대비 상대값). */
function payoffEpsilon(principal) {
  return Math.max(Math.abs(principal) * 1e-9, 1e-12);
}

function buildPrepayMap(prepayments) {
  const map = new Map();
  if (!Array.isArray(prepayments)) return map;
  for (const p of prepayments) {
    if (!p || !(p.amount > 0) || !(p.month >= 1)) continue;
    map.set(Math.floor(p.month), (map.get(Math.floor(p.month)) || 0) + p.amount);
  }
  return map;
}

function applyPrepay(prepayMap, month, balance) {
  const amount = prepayMap.get(month) || 0;
  if (amount <= 0) return 0;
  return Math.min(amount, balance);
}
