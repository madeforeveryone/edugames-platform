# LDtk Auto-Layer Rules Assistant — 9-slice 설정 가이드

스크린샷에서 Assistant를 쓰는 걸 봤어. 이 문서는 **Forest_tileset 기준**으로
Assistant를 정확히 설정하는 법이야.

## 너의 타일셋은 표준 9-slice 구조다 (좋은 소식)

Forest_tileset의 좌측 잔디 영역(col 0-2, row 0-3)이 정확히 9-slice 레이아웃이야:

```
타일셋 좌표 (col,row):
(0,0) (1,0) (2,0)  ← 단독 블록일 때 위 (사방이 풀)
(0,1) (1,1) (2,1)  ← 윗변 가장자리 (위가 뚫림)
(0,2) (1,2) (2,2)  ← 좌측변 / 채움(속) / 우측변
(0,3) (1,3) (2,3)  ← 아랫변 가장자리 (아래가 뚫림)
```

## 두 가지 접근 — 하나를 선택

### 접근 A: Main만 사용 (권장 — 더 단순)

**OuterWall로 감쌀 필요 없이**, InsideWall 덩어리의 가장자리에 풀이 자동으로 나온다.

Assistant 설정:
- **Main IntGrid value: InsideWall (2)**
- **Outer IntGrid value: (비워둠 / None)**
- AUTO-RENDERED TILES 격자(3×3 코어)에 위 9-slice를 배치:

```
Assistant 격자        →  놓을 타일셋 좌표
┌─────┬─────┬─────┐
│ 위왼 │ 위  │위오 │      (0,1) (1,1) (2,1)   ← 윗변
├─────┼─────┼─────┤
│ 왼  │채움 │ 오  │      (0,2) (1,2) (2,2)   ← 중간
├─────┼─────┼─────┤
│아래왼│아래 │아래오│      (0,3) (1,3) (2,3)   ← 아랫변
└─────┴─────┴─────┘
```

> 9칸을 채우면 LDtk가 **모서리(코너)와 대칭은 자동 생성**한다.
> 이러면 InsideWall만 칠해도 가장자리에 풀이 둘러진다. OuterWall 불필요.

**이 접근을 쓰면:** 맵에서 InsideWall(2)만 칠하면 됨. OuterWall은 안 써도 됨.
충돌(InsideWall=2)과 그래픽이 정확히 일치 → 1칸 어긋남 문제 사라짐.

### 접근 B: Main + Outer (전환 타일이 필요할 때)

잔디(InsideWall)와 흙/다른 지형(OuterWall) **사이의 전환**을 그리고 싶을 때.
- **Main: InsideWall (2)**, **Outer: OuterWall (1)**
- 이 경우 가장자리는 "InsideWall이 OuterWall과 만나는 면"에만 생긴다.
- 네가 겪은 "OuterWall로 감싸야 가장자리가 나온다"가 바로 이 모드의 동작.

## 추천: 접근 A로 가라

CodeBreaker는 단순한 발판 게임이라 **접근 A**가 맞아:
- InsideWall(2)만 칠하면 가장자리 자동
- 충돌 = 그래픽 (1칸 어긋남 없음)
- 맵 그리기가 단순 (한 가지 값만)

엔진도 이미 InsideWall(2)=충돌로 맞춰뒀으니, 접근 A면 그래픽과 충돌이 완벽히 일치한다.

## Spike (가시) 규칙

가시는 **별도 그룹**으로:
- 새 Rule Group → Main: Spike (3), Outer: 없음
- 단일 타일 규칙: Spike(3) 칸에 가시 타일 (타일셋 (3,3) 등)
- 이 그룹을 **InsideWall 그룹보다 위로** 드래그 (우선순위) → 겹침 방지

## 설정 후

저장 → `npm run levels` → 게임에서 확인.
변환기가 autoLayerTiles를 읽어 그대로 렌더한다.
