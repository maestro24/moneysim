/**
 * format.js — 원화·숫자 표시 유틸. 반올림은 이 층에서만 수행한다.
 * 내부 계산 단위: 페이지 로직은 "만원"을 기본 화폐 단위로 사용하고,
 * 표시 시 formatManwon()으로 변환한다.
 */

/** 콤마 숫자 (정수 반올림) */
export function comma(n) {
  if (!Number.isFinite(n)) return '-';
  return Math.round(n).toLocaleString('ko-KR');
}

/**
 * 만원 단위 금액을 한국어 표기로. 예) 32450 → "3억 2,450만원", 850 → "850만원"
 * @param {number} man 만원 단위 값
 */
export function formatManwon(man) {
  if (!Number.isFinite(man)) return '-';
  const sign = man < 0 ? '-' : '';
  const abs = Math.round(Math.abs(man));
  if (abs >= 10000) {
    const eok = Math.floor(abs / 10000);
    const rest = abs % 10000;
    return rest === 0
      ? `${sign}${eok.toLocaleString('ko-KR')}억원`
      : `${sign}${eok.toLocaleString('ko-KR')}억 ${rest.toLocaleString('ko-KR')}만원`;
  }
  return `${sign}${abs.toLocaleString('ko-KR')}만원`;
}

/**
 * 축 라벨용 축약 표기 (만원 단위 입력). 예) 125000 → "12.5억", 5000 → "5,000만", 0 → "0"
 */
export function formatManwonShort(man) {
  if (!Number.isFinite(man)) return '-';
  if (man === 0) return '0';
  const sign = man < 0 ? '-' : '';
  const abs = Math.abs(man);
  if (abs >= 10000) {
    const eok = abs / 10000;
    const s = eok >= 100 ? Math.round(eok).toLocaleString('ko-KR') : (Math.round(eok * 10) / 10).toLocaleString('ko-KR');
    return `${sign}${s}억`;
  }
  return `${sign}${Math.round(abs).toLocaleString('ko-KR')}만`;
}

/** 퍼센트 표시. 0.9234 → "92.3%" */
export function formatPercent(ratio, digits = 1) {
  if (!Number.isFinite(ratio)) return '-';
  return (ratio * 100).toFixed(digits) + '%';
}

/** "N년 M개월" 표기 */
export function formatMonths(months) {
  if (!Number.isFinite(months)) return '-';
  const y = Math.floor(months / 12);
  const m = Math.round(months % 12);
  if (y === 0) return `${m}개월`;
  if (m === 0) return `${y}년`;
  return `${y}년 ${m}개월`;
}

/** 문자열 → 숫자 (콤마 제거). 실패 시 NaN */
export function parseNumber(str) {
  if (typeof str === 'number') return str;
  if (typeof str !== 'string') return NaN;
  const cleaned = str.replace(/,/g, '').trim();
  if (cleaned === '') return NaN;
  return Number(cleaned);
}
