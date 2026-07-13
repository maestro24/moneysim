import { test } from 'node:test';
import assert from 'node:assert/strict';
import { percentile, percentileSorted, percentiles, successRate, histogram, mean } from '../js/core/stats.js';

// ---- 백분위 ----

test('percentile: 빈 배열 → NaN', () => {
  assert.ok(Number.isNaN(percentile([], 50)));
});

test('percentile: 원소 1개 → 그 값 (모든 p)', () => {
  assert.equal(percentile([7], 0), 7);
  assert.equal(percentile([7], 50), 7);
  assert.equal(percentile([7], 100), 7);
});

test('percentile: 선형 보간 — [1,2,3,4]의 p50 = 2.5', () => {
  assert.equal(percentile([1, 2, 3, 4], 50), 2.5);
});

test('percentile: p0 = 최솟값, p100 = 최댓값', () => {
  const arr = [9, 1, 5, 3];
  assert.equal(percentile(arr, 0), 1);
  assert.equal(percentile(arr, 100), 9);
});

test('percentile: 보간 값 검증 — [10,20,30,40,50]의 p25 = 20', () => {
  assert.equal(percentile([10, 20, 30, 40, 50], 25), 20);
  assert.equal(percentile([10, 20, 30, 40, 50], 10), 14); // idx=0.4 → 10+0.4*10
});

test('percentile: 입력 배열을 변형하지 않음 (불변)', () => {
  const arr = [3, 1, 2];
  percentile(arr, 50);
  assert.deepEqual(arr, [3, 1, 2]);
});

test('percentile: 범위 밖 p는 0~100으로 클램프', () => {
  assert.equal(percentile([1, 2, 3], -10), 1);
  assert.equal(percentile([1, 2, 3], 150), 3);
});

test('percentileSorted: 정렬된 입력에 대해 percentile과 동일', () => {
  const sorted = [1, 2, 3, 4, 5];
  assert.equal(percentileSorted(sorted, 40), percentile([5, 3, 1, 4, 2], 40));
});

test('percentiles: 여러 백분위 한 번에, 순서 유지', () => {
  const result = percentiles([1, 2, 3, 4], [0, 50, 100]);
  assert.deepEqual(result, [1, 2.5, 4]);
});

// ---- 성공률 ----

test('successRate: 기본 동작 — 4개 중 3개 통과 = 0.75', () => {
  assert.equal(successRate([1, 2, 3, 0], (v) => v > 0), 0.75);
});

test('successRate: 빈 배열 → NaN', () => {
  assert.ok(Number.isNaN(successRate([], () => true)));
});

// ---- 히스토그램 ----

test('histogram: 모든 bin count 합 = 데이터 개수', () => {
  const data = Array.from({ length: 1000 }, (_, i) => (i * 7919) % 100);
  const h = histogram(data, { binCount: 12 });
  const sum = h.bins.reduce((a, b) => a + b.count, 0);
  assert.equal(sum, 1000);
  assert.equal(h.total, 1000);
});

test('histogram: 모든 값이 동일하면 단일 빈', () => {
  const h = histogram([5, 5, 5], { binCount: 10 });
  assert.equal(h.bins.length, 1);
  assert.equal(h.bins[0].count, 3);
});

test('histogram: 최댓값은 마지막 빈에 포함(경계 처리)', () => {
  const h = histogram([0, 5, 10], { binCount: 2 });
  assert.equal(h.bins[1].count, 2); // 5, 10
  assert.equal(h.bins[0].count, 1); // 0
});

test('histogram: min/max 지정 시 범위 밖 값은 경계 빈으로 클램프, 합 보존', () => {
  const h = histogram([-5, 2, 8, 100], { binCount: 2, min: 0, max: 10 });
  const sum = h.bins.reduce((a, b) => a + b.count, 0);
  assert.equal(sum, 4);
  assert.equal(h.bins[0].x0, 0);
  assert.equal(h.bins[1].x1, 10);
});

test('histogram: 빈 배열 → 빈 결과', () => {
  const h = histogram([], { binCount: 5 });
  assert.deepEqual(h, { bins: [], total: 0 });
});

// ---- 평균 ----

test('mean: 기본 동작 및 빈 배열 NaN', () => {
  assert.equal(mean([1, 2, 3, 4]), 2.5);
  assert.ok(Number.isNaN(mean([])));
});
