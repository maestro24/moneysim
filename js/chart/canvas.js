/**
 * canvas.js — Canvas 2D 공통 기반: devicePixelRatio 대응 + ResizeObserver 반응형.
 */

export const REDUCED_MOTION =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * 컨테이너에 반응형 고해상도 캔버스를 마운트한다.
 * @param {HTMLElement} container .chart-box 요소
 * @param {number} aspectRatio 높이 = 너비 × ratio
 * @param {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} draw
 * @returns {{canvas: HTMLCanvasElement, redraw: () => void, destroy: () => void, size: () => {w:number,h:number}}}
 */
export function mountCanvas(container, aspectRatio, draw) {
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let cssW = 0;
  let cssH = 0;

  function resize() {
    const w = container.clientWidth;
    if (w <= 0) return;
    const h = Math.max(160, Math.round(w * aspectRatio));
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    cssW = w;
    cssH = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, cssW, cssH);
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(container);
  resize();

  return {
    canvas,
    redraw() {
      if (cssW > 0) draw(ctx, cssW, cssH);
      else resize();
    },
    size: () => ({ w: cssW, h: cssH }),
    destroy() {
      ro.disconnect();
      canvas.remove();
    },
  };
}

/** DOM 툴팁 요소 생성 + 위치 지정 헬퍼 */
export function createTooltip(container) {
  const el = document.createElement('div');
  el.className = 'chart-tooltip';
  container.appendChild(el);
  return {
    show(html, x, y, containerW) {
      el.innerHTML = html;
      el.style.opacity = '1';
      // 좌우 잘림 방지
      const half = el.offsetWidth / 2;
      const clampedX = Math.min(Math.max(x, half + 4), containerW - half - 4);
      el.style.left = clampedX + 'px';
      el.style.top = Math.max(0, y) + 'px';
    },
    hide() { el.style.opacity = '0'; },
    destroy() { el.remove(); },
  };
}

/** 진입 애니메이션 진행값 관리 (reduced-motion·백그라운드 탭은 rAF가 멈추므로 즉시 1) */
export function animateIn(durationMs, onFrame) {
  if (REDUCED_MOTION || document.hidden) {
    onFrame(1);
    return;
  }
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / durationMs);
    const eased = 1 - Math.pow(1 - t, 3);
    onFrame(eased);
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
