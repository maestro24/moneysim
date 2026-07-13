/**
 * axis.js — 축 눈금 자동 산출(1/2/5 스텝) + 스케일 헬퍼.
 */

/**
 * nice 눈금 계산: 1, 2, 5 × 10^k 스텝.
 * @param {number} min
 * @param {number} max
 * @param {number} [targetCount=5] 목표 눈금 수
 * @returns {{ticks: number[], min: number, max: number, step: number}}
 */
export function niceTicks(min, max, targetCount = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { ticks: [0, 1], min: 0, max: 1, step: 1 };
  }
  if (min === max) {
    if (min === 0) { min = 0; max = 1; }
    else if (min > 0) { min = 0; max *= 1.1; }
    else { max = 0; min *= 1.1; }
  }
  if (min > max) [min, max] = [max, min];
  const span = max - min;
  const rawStep = span / Math.max(1, targetCount);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  let step;
  if (norm <= 1) step = 1 * mag;
  else if (norm <= 2) step = 2 * mag;
  else if (norm <= 5) step = 5 * mag;
  else step = 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  // 부동소수 누적 방지: 인덱스 곱으로 생성
  const count = Math.round((hi - lo) / step);
  for (let i = 0; i <= count; i++) ticks.push(lo + i * step);
  return { ticks, min: lo, max: hi, step };
}

/** 선형 스케일 팩토리: domain [d0,d1] → range [r0,r1] */
export function linearScale(d0, d1, r0, r1) {
  const dd = d1 - d0 || 1;
  return (v) => r0 + ((v - d0) / dd) * (r1 - r0);
}
