# 📈 머니시뮬 (MoneySim)

몬테카를로 재테크 시뮬레이터 — 10,000개의 미래를 시뮬레이션하는 무료 정적 사이트.
https://maestro24.github.io/moneysim/

## 도구

| 페이지 | 내용 |
|---|---|
| `retire.html` | 은퇴 시뮬레이터: MC 10,000 시나리오 → 성공확률·자산 밴드·고갈 히스토그램 |
| `compound.html` | 복리 계산기: 일시금+월 적립, 연/월 복리, 원금·이자 분리 차트 |
| `dividend.html` | 배당 재투자: 스노우볼 차트, 월 배당 목표 도달 시점 |
| `loan.html` | 대출 상환: 원리금균등/원금균등/만기일시 비교 + 중도상환 효과 |
| `goal.html` | 목돈 목표: 필요 월 저축액 역산(닫힌형) + 수익률 민감도 |

## 구조

- `js/core/` — 수학 코어(DOM 무관, Node 테스트 대상): `finance.js`(닫힌형), `mc.js`(GBM 몬테카를로), `stats.js`(집계)
- `js/chart/` — 자체 Canvas 차트(외부 라이브러리 0): DPR·ResizeObserver·툴팁·1/2/5 눈금
- `js/ui/` — 포맷(만원/억원)·필드 동기화·URL 공유
- `js/pages/` — 페이지 배선
- `worker.js` — module Web Worker. MC 실행, 1,000회마다 진행률, 집계 결과만 전송
- 상세 설계: `docs/PLAN.md`

## 테스트

```bash
node --test tests/finance.test.mjs tests/mc.test.mjs tests/stats.test.mjs
```

61개 테스트: 닫힌형 알려진 값 대조(예: 3억/30년/4% 원리금균등 = 월 1,432,245.89원),
시드 재현성, σ=0 닫힌형 완전 일치, σ>0 10,000회 ±1% 수렴, 백분위 단조성 등.

## 유지 규칙

1. **코어 수정 시 테스트 필수** — `js/core/*` 변경은 반드시 테스트 추가/통과 후 반영.
2. **반올림은 UI 층에서만** — 코어는 부동소수 그대로 반환.
3. **원시 MC 경로를 메인 스레드로 보내지 말 것** — Worker 안에서 집계.
4. **전 페이지 공통**: GA4 스니펫, canonical, 투자조언 아님 고지, 쿠팡 배너+가드, 사이드 레일.
5. 새 페이지 추가 시 `sitemap.xml`에 URL 추가 (404 제외).
