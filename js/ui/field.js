/**
 * field.js — 숫자 입력 + 슬라이더 동기화 필드.
 *
 * HTML 구조 규약:
 * <div class="field" id="f-{name}">
 *   <label>...</label>
 *   <div class="row"><input type="number"> <span class="unit">만원</span></div>
 *   <input type="range">
 *   <div class="error"></div>
 * </div>
 */
import { parseNumber } from './format.js';

/**
 * 필드 초기화. 슬라이더·숫자 입력을 양방향 동기화하고 검증한다.
 * @param {string} id .field 요소 id
 * @param {{min: number, max: number, step?: number, value: number, onChange?: (v:number)=>void, label?: string}} opts
 * @returns {{get: () => number, set: (v:number) => void, isValid: () => boolean, el: HTMLElement}}
 */
export function initField(id, opts) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`field not found: ${id}`);
  const numberEl = el.querySelector('input[type="number"]');
  const sliderEl = el.querySelector('input[type="range"]');
  const errorEl = el.querySelector('.error');
  const { min, max } = opts;
  const step = opts.step ?? 1;
  let value = opts.value;
  let valid = true;

  numberEl.min = String(min);
  numberEl.max = String(max);
  numberEl.step = String(step);
  if (sliderEl) {
    sliderEl.min = String(min);
    sliderEl.max = String(max);
    sliderEl.step = String(step);
  }

  function render() {
    numberEl.value = String(value);
    if (sliderEl) sliderEl.value = String(value);
  }

  function setError(msg) {
    valid = !msg;
    el.classList.toggle('invalid', !valid);
    if (errorEl) errorEl.textContent = msg || '';
  }

  function commit(raw, { clamp = false } = {}) {
    let v = parseNumber(String(raw));
    if (!Number.isFinite(v)) {
      setError('숫자를 입력해 주세요.');
      return;
    }
    if (clamp) v = Math.min(max, Math.max(min, v));
    if (v < min) {
      setError(`${fmt(min)} 이상이어야 합니다.`);
      return;
    }
    if (v > max) {
      setError(`${fmt(max)} 이하여야 합니다.`);
      return;
    }
    setError(null);
    value = v;
    render();
    if (opts.onChange) opts.onChange(v);
  }

  numberEl.addEventListener('input', () => commit(numberEl.value));
  numberEl.addEventListener('blur', () => {
    if (!valid) {
      commit(numberEl.value, { clamp: true });
      if (!valid) { // 여전히 숫자가 아니면 기존 값 복원
        setError(null);
        render();
      }
    }
  });
  if (sliderEl) {
    sliderEl.addEventListener('input', () => commit(sliderEl.value));
  }

  render();

  return {
    get: () => value,
    set: (v) => commit(v, { clamp: true }),
    isValid: () => valid,
    el,
  };
}

/** 모든 필드가 유효한지 */
export function allValid(fields) {
  return Object.values(fields).every((f) => f.isValid());
}

function fmt(n) {
  return Number(n).toLocaleString('ko-KR');
}
