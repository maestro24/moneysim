/**
 * linechart.js — 라인/영역/밴드 차트 (툴팁·범례·진입 애니메이션 포함).
 *
 * 시리즈 형식
 * - line:  { type:'line', name, color, data:[{x,y}], width? , dash? }
 * - area:  { type:'area', name, color, data:[{x,y}], fillTo? (기본 0) }
 * - band:  { type:'band', name, color, data:[{x,y0,y1}] }
 * 모든 시리즈는 x가 오름차순이라고 가정한다.
 */
import { niceTicks, linearScale } from './axis.js';
import { mountCanvas, createTooltip, animateIn } from './canvas.js';

const GRID = '#e4ebe8';
const AXIS_TEXT = '#52606d';
const FONT = '11px -apple-system, "Malgun Gothic", "Noto Sans KR", sans-serif';

export function createLineChart(container, config = {}) {
  const aspect = config.aspect ?? 0.52;
  const formatX = config.formatX ?? ((v) => String(v));
  const formatY = config.formatY ?? ((v) => String(v));
  const includeZero = config.includeZero !== false;

  let series = [];
  let progress = 1;
  let hoverX = null; // 데이터 좌표
  let legendEl = null;
  let lastScale = null; // draw에서 저장한 실제 x 스케일 정보

  const tooltip = createTooltip(container);
  const mounted = mountCanvas(container, aspect, draw);

  function extent() {
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const s of series) {
      for (const d of s.data) {
        if (d.x < xMin) xMin = d.x;
        if (d.x > xMax) xMax = d.x;
        const ys = s.type === 'band' ? [d.y0, d.y1] : [d.y];
        for (const y of ys) {
          if (y < yMin) yMin = y;
          if (y > yMax) yMax = y;
        }
      }
    }
    if (!Number.isFinite(xMin)) { xMin = 0; xMax = 1; yMin = 0; yMax = 1; }
    if (includeZero) { yMin = Math.min(0, yMin); yMax = Math.max(0, yMax); }
    return { xMin, xMax, yMin, yMax };
  }

  function draw(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    if (series.length === 0) return;
    const { xMin, xMax, yMin, yMax } = extent();
    const yT = niceTicks(yMin, yMax, 5);
    const xT = niceTicks(xMin, xMax, Math.min(8, Math.max(3, Math.floor(w / 90))));

    ctx.font = FONT;
    let leftPad = 34;
    for (const t of yT.ticks) leftPad = Math.max(leftPad, ctx.measureText(formatY(t)).width + 12);
    const m = { top: 14, right: 14, bottom: 30, left: Math.ceil(leftPad) };
    const sx = linearScale(xMin, xMax, m.left, w - m.right);
    const sy = linearScale(yT.min, yT.max, h - m.bottom, m.top);
    lastScale = { xMin, xMax, left: m.left, right: m.right };

    // 그리드 + Y 눈금
    ctx.strokeStyle = GRID;
    ctx.fillStyle = AXIS_TEXT;
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const t of yT.ticks) {
      const y = Math.round(sy(t)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(m.left, y);
      ctx.lineTo(w - m.right, y);
      ctx.stroke();
      ctx.fillText(formatY(t), m.left - 6, y);
    }
    // X 눈금
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const t of xT.ticks) {
      if (t < xMin || t > xMax) continue;
      const x = sx(t);
      ctx.fillText(formatX(t), x, h - m.bottom + 8);
    }

    // 진입 애니메이션: 좌→우 클리핑
    const clipW = m.left + (w - m.left - m.right) * progress;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, clipW, h);
    ctx.clip();

    for (const s of series) {
      if (s.type === 'band') {
        ctx.beginPath();
        s.data.forEach((d, i) => {
          const x = sx(d.x), y = sy(d.y1);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        for (let i = s.data.length - 1; i >= 0; i--) {
          ctx.lineTo(sx(s.data[i].x), sy(s.data[i].y0));
        }
        ctx.closePath();
        ctx.fillStyle = s.color;
        ctx.globalAlpha = s.alpha ?? 0.18;
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (s.type === 'area') {
        const base = sy(s.fillTo ?? 0);
        ctx.beginPath();
        s.data.forEach((d, i) => {
          const x = sx(d.x), y = sy(d.y);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.lineTo(sx(s.data[s.data.length - 1].x), base);
        ctx.lineTo(sx(s.data[0].x), base);
        ctx.closePath();
        ctx.fillStyle = s.color;
        ctx.globalAlpha = s.alpha ?? 0.22;
        ctx.fill();
        ctx.globalAlpha = 1;
        strokeLine(ctx, s, sx, sy);
      } else {
        strokeLine(ctx, s, sx, sy);
      }
    }
    ctx.restore();

    // 호버 크로스헤어
    if (hoverX !== null) {
      const x = Math.round(sx(hoverX)) + 0.5;
      ctx.strokeStyle = '#9aa5b1';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, m.top);
      ctx.lineTo(x, h - m.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const s of series) {
        const d = nearestPoint(s.data, hoverX);
        if (!d) continue;
        const ys = s.type === 'band' ? [d.y0, d.y1] : [d.y];
        for (const yv of ys) {
          ctx.beginPath();
          ctx.arc(sx(d.x), sy(yv), 3.5, 0, Math.PI * 2);
          ctx.fillStyle = s.color;
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }
  }

  function strokeLine(ctx, s, sx, sy) {
    ctx.beginPath();
    s.data.forEach((d, i) => {
      const x = sx(d.x), y = sy(d.y);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width ?? 2;
    if (s.dash) ctx.setLineDash(s.dash);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function nearestPoint(data, xVal) {
    if (!data || data.length === 0) return null;
    let best = data[0], bestDist = Math.abs(data[0].x - xVal);
    for (const d of data) {
      const dist = Math.abs(d.x - xVal);
      if (dist < bestDist) { best = d; bestDist = dist; }
    }
    return best;
  }

  function renderLegend() {
    if (legendEl) legendEl.remove();
    legendEl = document.createElement('div');
    legendEl.className = 'chart-legend';
    for (const s of series) {
      if (s.legend === false) continue;
      const item = document.createElement('span');
      item.className = 'item';
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = s.color;
      item.appendChild(sw);
      item.appendChild(document.createTextNode(s.name));
      legendEl.appendChild(item);
    }
    container.insertBefore(legendEl, container.firstChild);
  }

  // 포인터(마우스·터치) 툴팁
  function onPointer(ev) {
    if (series.length === 0 || !lastScale) return;
    const rect = mounted.canvas.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const { xMin, xMax, left, right } = lastScale;
    const { w } = mounted.size();
    const frac = Math.min(1, Math.max(0, (px - left) / (w - left - right)));
    const xVal = xMin + frac * (xMax - xMin);
    // 첫 시리즈 x 그리드에 스냅
    const ref = series[0].data;
    const snap = nearestPoint(ref, xVal);
    if (!snap) return;
    hoverX = snap.x;
    mounted.redraw();
    let html = `<strong>${formatX(snap.x)}</strong>`;
    for (const s of series) {
      const d = nearestPoint(s.data, hoverX);
      if (!d) continue;
      if (s.type === 'band') {
        html += `<br><span style="color:${s.color}">●</span> ${s.name}: ${formatY(d.y0)} ~ ${formatY(d.y1)}`;
      } else {
        html += `<br><span style="color:${s.color}">●</span> ${s.name}: ${formatY(d.y)}`;
      }
    }
    tooltip.show(html, px, 6, w);
  }

  function onLeave() {
    hoverX = null;
    tooltip.hide();
    mounted.redraw();
  }

  mounted.canvas.addEventListener('pointermove', onPointer);
  mounted.canvas.addEventListener('pointerdown', onPointer);
  mounted.canvas.addEventListener('pointerleave', onLeave);

  return {
    update(newSeries) {
      series = newSeries;
      hoverX = null;
      renderLegend();
      animateIn(450, (p) => {
        progress = p;
        mounted.redraw();
      });
    },
    destroy() {
      mounted.canvas.removeEventListener('pointermove', onPointer);
      mounted.canvas.removeEventListener('pointerleave', onLeave);
      tooltip.destroy();
      if (legendEl) legendEl.remove();
      mounted.destroy();
    },
  };
}
