/**
 * barchart.js — 범주형 막대 차트 + 히스토그램 (툴팁 포함).
 */
import { niceTicks, linearScale } from './axis.js';
import { mountCanvas, createTooltip, animateIn } from './canvas.js';

const GRID = '#e4ebe8';
const AXIS_TEXT = '#52606d';
const FONT = '11px -apple-system, "Malgun Gothic", "Noto Sans KR", sans-serif';

/**
 * 범주형 막대 차트. update([{label, value, color}])
 */
export function createBarChart(container, config = {}) {
  const aspect = config.aspect ?? 0.45;
  const formatY = config.formatY ?? ((v) => String(v));
  let bars = [];
  let progress = 1;
  let hoverIdx = null;
  let geom = [];

  const tooltip = createTooltip(container);
  const mounted = mountCanvas(container, aspect, draw);

  function draw(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    if (bars.length === 0) return;
    const maxV = Math.max(...bars.map((b) => b.value), 0);
    const yT = niceTicks(0, maxV, 5);
    ctx.font = FONT;
    let leftPad = 34;
    for (const t of yT.ticks) leftPad = Math.max(leftPad, ctx.measureText(formatY(t)).width + 12);
    const m = { top: 14, right: 14, bottom: 30, left: Math.ceil(leftPad) };
    const sy = linearScale(yT.min, yT.max, h - m.bottom, m.top);

    ctx.strokeStyle = GRID;
    ctx.fillStyle = AXIS_TEXT;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const t of yT.ticks) {
      const y = Math.round(sy(t)) + 0.5;
      ctx.beginPath(); ctx.moveTo(m.left, y); ctx.lineTo(w - m.right, y); ctx.stroke();
      ctx.fillText(formatY(t), m.left - 6, y);
    }

    const plotW = w - m.left - m.right;
    const slot = plotW / bars.length;
    const barW = Math.min(90, slot * 0.55);
    const y0 = sy(0);
    geom = [];
    bars.forEach((b, i) => {
      const cx = m.left + slot * i + slot / 2;
      const fullH = y0 - sy(b.value);
      const bh = fullH * progress;
      const x = cx - barW / 2;
      const y = y0 - bh;
      ctx.fillStyle = b.color;
      ctx.globalAlpha = hoverIdx === null || hoverIdx === i ? 1 : 0.45;
      roundRect(ctx, x, y, barW, bh, 5);
      ctx.fill();
      ctx.globalAlpha = 1;
      geom.push({ x, y: sy(b.value), w: barW, cx });
      // 라벨
      ctx.fillStyle = AXIS_TEXT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(b.label, cx, h - m.bottom + 8);
      // 값 라벨
      if (progress === 1) {
        ctx.fillStyle = '#1f2933';
        ctx.textBaseline = 'bottom';
        ctx.fillText(formatY(b.value), cx, sy(b.value) - 4);
      }
    });
  }

  function onPointer(ev) {
    const rect = mounted.canvas.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    let idx = null;
    geom.forEach((g, i) => {
      if (px >= g.x - 8 && px <= g.x + g.w + 8) idx = i;
    });
    if (idx !== hoverIdx) {
      hoverIdx = idx;
      mounted.redraw();
    }
    if (idx !== null) {
      const b = bars[idx];
      tooltip.show(`<strong>${b.label}</strong><br>${formatY(b.value)}`, geom[idx].cx, 6, mounted.size().w);
    } else {
      tooltip.hide();
    }
  }
  function onLeave() {
    hoverIdx = null;
    tooltip.hide();
    mounted.redraw();
  }
  mounted.canvas.addEventListener('pointermove', onPointer);
  mounted.canvas.addEventListener('pointerdown', onPointer);
  mounted.canvas.addEventListener('pointerleave', onLeave);

  return {
    update(newBars) {
      bars = newBars;
      animateIn(400, (p) => { progress = p; mounted.redraw(); });
    },
    destroy() {
      tooltip.destroy();
      mounted.destroy();
    },
  };
}

/**
 * 히스토그램. update({bins:[{x0,x1,count}]})
 */
export function createHistogram(container, config = {}) {
  const aspect = config.aspect ?? 0.42;
  const formatX = config.formatX ?? ((v) => String(v));
  const formatCount = config.formatCount ?? ((v) => String(v));
  const color = config.color ?? '#0e9f6e';
  let bins = [];
  let progress = 1;
  let hoverIdx = null;

  const tooltip = createTooltip(container);
  const mounted = mountCanvas(container, aspect, draw);
  let lastGeom = { m: null, sx: null };

  function draw(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    if (bins.length === 0) return;
    const maxC = Math.max(...bins.map((b) => b.count));
    const yT = niceTicks(0, maxC, 4);
    const xMin = bins[0].x0, xMax = bins[bins.length - 1].x1;
    ctx.font = FONT;
    let leftPad = 30;
    for (const t of yT.ticks) leftPad = Math.max(leftPad, ctx.measureText(formatCount(t)).width + 12);
    const m = { top: 12, right: 14, bottom: 30, left: Math.ceil(leftPad) };
    const sx = linearScale(xMin, xMax, m.left, w - m.right);
    const sy = linearScale(yT.min, yT.max, h - m.bottom, m.top);
    lastGeom = { m, sx };

    ctx.strokeStyle = GRID;
    ctx.fillStyle = AXIS_TEXT;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const t of yT.ticks) {
      const y = Math.round(sy(t)) + 0.5;
      ctx.beginPath(); ctx.moveTo(m.left, y); ctx.lineTo(w - m.right, y); ctx.stroke();
      ctx.fillText(formatCount(t), m.left - 6, y);
    }
    // X 눈금(빈 경계 기반, 최대 8개)
    const xT = niceTicks(xMin, xMax, Math.min(8, bins.length));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const t of xT.ticks) {
      if (t < xMin || t > xMax) continue;
      ctx.fillText(formatX(t), sx(t), h - m.bottom + 8);
    }

    const y0 = sy(0);
    bins.forEach((b, i) => {
      const x = sx(b.x0) + 1;
      const bw = Math.max(1, sx(b.x1) - sx(b.x0) - 2);
      const bh = (y0 - sy(b.count)) * progress;
      ctx.fillStyle = color;
      ctx.globalAlpha = hoverIdx === null || hoverIdx === i ? 0.85 : 0.35;
      ctx.fillRect(x, y0 - bh, bw, bh);
      ctx.globalAlpha = 1;
    });
  }

  function onPointer(ev) {
    if (bins.length === 0 || !lastGeom.sx) return;
    const rect = mounted.canvas.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    let idx = null;
    bins.forEach((b, i) => {
      if (px >= lastGeom.sx(b.x0) && px <= lastGeom.sx(b.x1)) idx = i;
    });
    if (idx !== hoverIdx) { hoverIdx = idx; mounted.redraw(); }
    if (idx !== null) {
      const b = bins[idx];
      tooltip.show(
        `<strong>${formatX(b.x0)} ~ ${formatX(b.x1)}</strong><br>${formatCount(b.count)}건`,
        px, 6, mounted.size().w,
      );
    } else {
      tooltip.hide();
    }
  }
  function onLeave() { hoverIdx = null; tooltip.hide(); mounted.redraw(); }
  mounted.canvas.addEventListener('pointermove', onPointer);
  mounted.canvas.addEventListener('pointerdown', onPointer);
  mounted.canvas.addEventListener('pointerleave', onLeave);

  return {
    update(newBins) {
      bins = newBins;
      animateIn(400, (p) => { progress = p; mounted.redraw(); });
    },
    destroy() {
      tooltip.destroy();
      mounted.destroy();
    },
  };
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, Math.max(0, h));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}
