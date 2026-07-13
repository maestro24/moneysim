/**
 * share.js — URL 쿼리로 시나리오 공유/복원.
 */

/**
 * URL 쿼리에서 숫자 파라미터를 읽는다. 없거나 숫자가 아니면 undefined.
 * @param {string[]} keys
 * @returns {Record<string, number>}
 */
export function readQueryParams(keys) {
  const out = {};
  const sp = new URLSearchParams(location.search);
  for (const k of keys) {
    if (!sp.has(k)) continue;
    const v = Number(sp.get(k));
    if (Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/**
 * 현재 시나리오를 URL 쿼리에 기록(히스토리 오염 없이 replaceState).
 * @param {Record<string, number|string>} params
 */
export function writeQueryParams(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const qs = sp.toString();
  const url = location.pathname + (qs ? '?' + qs : '');
  history.replaceState(null, '', url);
}

/**
 * 공유 버튼 바인딩: 현재 URL을 클립보드에 복사.
 * @param {HTMLElement} button
 */
export function bindShareButton(button) {
  if (!button) return;
  const original = button.textContent;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      button.textContent = '✓ 링크 복사됨';
    } catch {
      // 클립보드 권한 없으면 프롬프트 폴백
      window.prompt('아래 링크를 복사하세요:', location.href);
      button.textContent = original;
      return;
    }
    setTimeout(() => { button.textContent = original; }, 1800);
  });
}
