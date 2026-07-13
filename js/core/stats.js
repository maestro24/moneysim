/**
 * stats.js — 백분위·성공률·히스토그램 집계.
 * 모든 함수는 입력 배열을 변형하지 않는다(불변).
 */

/**
 * 선형 보간 백분위 (numpy 'linear' 방식).
 * @param {number[]} values 원본 배열(정렬 불필요, 변형하지 않음)
 * @param {number} p 0~100
 * @returns {number} 빈 배열이면 NaN
 */
export function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return percentileSorted(sorted, p);
}

/**
 * 이미 오름차순 정렬된 배열에 대한 백분위(선형 보간).
 */
export function percentileSorted(sorted, p) {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const clamped = Math.min(100, Math.max(0, p));
  const idx = (clamped / 100) * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/**
 * 여러 백분위를 한 번의 정렬로 계산.
 * @param {number[]} values
 * @param {number[]} ps 예: [10, 50, 90]
 * @returns {number[]} ps와 같은 순서
 */
export function percentiles(values, ps) {
  if (!Array.isArray(values) || values.length === 0) return ps.map(() => NaN);
  const sorted = [...values].sort((a, b) => a - b);
  return ps.map((p) => percentileSorted(sorted, p));
}

/**
 * 성공률: predicate를 만족하는 비율(0~1). 빈 배열이면 NaN.
 */
export function successRate(outcomes, predicate) {
  if (!Array.isArray(outcomes) || outcomes.length === 0) return NaN;
  let ok = 0;
  for (const o of outcomes) if (predicate(o)) ok += 1;
  return ok / outcomes.length;
}

/**
 * 히스토그램 빈 계산.
 * @param {number[]} values
 * @param {{binCount?: number, min?: number, max?: number}} [opts]
 * @returns {{bins: Array<{x0:number,x1:number,count:number}>, total: number}}
 *   모든 bin count의 합 = values.length (min/max 지정 시 범위 밖 값은 경계 bin에 포함)
 */
export function histogram(values, opts = {}) {
  const binCount = Math.max(1, Math.floor(opts.binCount ?? 10));
  if (!Array.isArray(values) || values.length === 0) {
    return { bins: [], total: 0 };
  }
  let min = opts.min ?? Math.min(...values);
  let max = opts.max ?? Math.max(...values);
  if (min === max) {
    // 모든 값이 동일: 단일 빈
    return { bins: [{ x0: min, x1: max, count: values.length }], total: values.length };
  }
  if (min > max) [min, max] = [max, min];
  const width = (max - min) / binCount;
  const counts = new Array(binCount).fill(0);
  for (const v of values) {
    let idx = Math.floor((v - min) / width);
    if (idx < 0) idx = 0;
    if (idx >= binCount) idx = binCount - 1; // max 및 범위 밖 값은 마지막 빈
    counts[idx] += 1;
  }
  const bins = counts.map((count, i) => ({
    x0: min + i * width,
    x1: min + (i + 1) * width,
    count,
  }));
  return { bins, total: values.length };
}

/** 평균. 빈 배열이면 NaN */
export function mean(values) {
  if (!Array.isArray(values) || values.length === 0) return NaN;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}
