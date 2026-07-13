/**
 * worker.js — 몬테카를로 시뮬레이션 전용 Web Worker (module worker).
 *
 * 프로토콜
 * - 수신: { type: 'run', params, opts: { n, seed } }
 * - 송신: { type: 'progress', done, total }  — 1,000 시나리오마다
 *         { type: 'result', data }           — 집계 결과만 전송(원시 경로 전송 금지)
 *         { type: 'error', message }
 */
import { runRetirementMC } from './js/core/mc.js';

self.onmessage = (ev) => {
  const msg = ev.data;
  if (!msg || msg.type !== 'run') return;
  try {
    const opts = {
      n: msg.opts?.n ?? 10000,
      seed: msg.opts?.seed ?? 20260713,
      progressEvery: 1000,
      onProgress: (done, total) => {
        self.postMessage({ type: 'progress', done, total });
      },
    };
    const data = runRetirementMC(msg.params, opts);
    self.postMessage({ type: 'result', data });
  } catch (err) {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
  }
};
