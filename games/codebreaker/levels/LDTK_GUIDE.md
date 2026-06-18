# LDtk로 스테이지 만들기 — 세팅 가이드

CodeBreaker의 모든 스테이지는 **LDtk에서 그리고 → 변환 스크립트로 생성**한다.
손으로 `stage_XX.js`를 편집하지 않는다 (변환 시 덮어쓰임).

워크플로우: **LDtk에서 그리기 → 저장 → `node tools/ldtk-import.js levels/codebreaker.ldtk` → 게임 새로고침**

---

## 1. LDtk 프로젝트 최초 설정 (한 번만)

`levels/codebreaker.ldtk` 를 LDtk로 연다. 새로 만들 경우 아래대로 설정.

### 프로젝트 설정
- **Default grid size**: `16` (우리 타일 크기)
- 레벨 크기는 자유 (예: 44×16 셀). 가로로 긴 맵 권장.

### 레이어 2개 만들기

**(1) IntGrid 레이어 — 이름 `Collision`**
지형을 그리는 격자. **값의 의미가 "충돌"과 "그래픽"으로 나뉜다** (중요):

| IntGrid 값 | 이름 | 역할 | 충돌 | 비고 |
|---|---|---|---|---|
| 1 | **OuterWall** | 테두리 **장식** | ❌ 통과 | 땅을 **한 칸 밖에서 감싸** 가장자리 그래픽을 만듦 |
| 2 | **InsideWall** | **밟는 땅** | ✅ solid | 실제로 플레이어가 서는 칸 |
| 3 | **Spike** | 가시 | ☠️ 죽음 | 닿으면 사망 |

**핵심 규칙 (스크린샷에서 검증됨):**
- **밟고 싶은 땅 = InsideWall(2)** 로 칠한다. 충돌은 이것만 친다.
- 그 InsideWall 덩어리를 **OuterWall(1)로 한 칸 둘러싼다.** 그래야 auto-layer가 잔디 가장자리/모서리를 제대로 그린다. OuterWall은 충돌하지 않으므로 플레이어는 통과한다(시각 장식일 뿐).
- 즉 **그래픽 외곽선(OuterWall)과 충돌 본체(InsideWall)를 분리**한다.

예시 — 발판 하나 (옆에서 본 단면):
```
. 1 1 1 .      ← row13: OuterWall (잔디 윗면 그래픽)
1 2 2 2 1      ← row14: 양옆 OuterWall + 가운데 InsideWall(밟는 땅)
1 2 2 2 1      ← row15: 동일
. 1 1 1 .      ← (바닥 막을 거면) OuterWall
```
플레이어는 가운데 2(InsideWall) 위에 서고, 1(OuterWall)은 가장자리 풀 그림.

**Spike(가시, 3) 배치 — 주의:**
- Spike는 **독립된 칸**에 둔다. OuterWall(1) 위에 겹쳐 칠하면 두 규칙이 충돌해 렌더가 깨진다(빨간 칸이 어색하게 박힘).
- 가시를 둘 자리는 OuterWall을 칠하지 말고 **Spike(3)만** 칠한다.
- auto-layer 규칙에서 **Spike 규칙을 OuterWall/InsideWall 규칙보다 위(우선순위 높게)** 에 둬서, Spike 칸엔 가시만 그려지게 한다.
- 천장 가시라면 맵 위쪽 행에 Spike(3)만 한 줄 칠하면 된다(주변에 OuterWall 없이).

**(2) Entities 레이어 — 이름 자유**
엔티티 2종을 정의:
- **`PlayerStart`** — 플레이어 시작 위치 (맵에 1개)
- **`Goal`** — 골인 깃발 위치 (맵에 1개)

> 엔티티 이름이 정확히 `PlayerStart`, `Goal` 이어야 변환기가 인식한다.

---

## 1.5. 타일 그림 입히기 — Auto-layer (중요!)

IntGrid 값만 칠하면 게임에서 **타일 한 종류로만** 그려진다(가장자리·모서리 구분 없음).
예쁜 잔디 가장자리/모서리/채움을 자동으로 그리려면 **Auto-layer 규칙**을 설정한다.

### Step 1 — 타일셋 등록
- **TILESETS** 패널 → **CREATE TILESET**
- 이미지: `Forest_tileset.png` (이 폴더에 있음), **Grid size: 16**

### Step 2 — IntGrid 레이어에 타일셋 연결
- **LAYERS** 패널 → `Collision` 레이어 선택
- **AUTO PAINT (Tile layer)** 항목에서 방금 만든 `Forest_tileset` 선택

### Step 3 — 규칙 추가
- `Collision` 레이어 좌측의 **RULES** 버튼 클릭
- **새 RULE GROUP** 생성 → 그 안에 **RULE** 추가
- 각 규칙은 "주변 칸 패턴 → 그릴 타일"을 정한다. 예시:
  - **잔디 상단**: "값1이 있고 위 칸이 비었으면" → 잔디 윗면 타일 (타일셋 (0,0)~(2,0) 줄)
  - **채움**: "값1이 있으면" → 흙 채움 타일 (타일셋 (1,2) 부근)
  - **천장 가시**: "값3이 있으면" → 가시 타일 (타일셋 (3,3)~(5,3))
- LDtk 공식 가이드의 규칙 편집기 참고: https://ldtk.io/docs/general/auto-layers/

> **SHIFT+R** 로 규칙 렌더 on/off. 켜면 예쁜 타일, 끄면 IntGrid 값(디버그).

### Step 4 — 변환
규칙이 적용된 채로 저장하면, LDtk가 자동 배치한 타일이 JSON의 `autoLayerTiles`에 들어간다.
변환기가 이걸 읽어 게임이 **그 타일 그대로** 그린다.

> **규칙이 없으면?** 변환기는 `tiles: null`을 넣고, 게임은 기본 단일 타일로 그린다(레거시 모드).
> 즉 auto-layer 설정은 선택이지만, 안 하면 가장자리 구분이 없다.

타일셋 좌표 참고 (Forest_tileset.png, 16px 격자, col,row):
- 잔디 상단: (0,0)왼 (1,0)중앙 (2,0)오른쪽
- 잔디 옆면: (0,1)(1,1)(2,1) / 채움: (1,2) / 잔디 하단: (0,3)(1,3)(2,3)
- 가시: (3,3)(4,3)(5,3) / 통나무: (7,3)(8,3) / 나무·바위: 3~8열

---

## 2. 레벨별 hack 설정 (커스텀 필드)

각 레벨에 "어떤 변수를 해킹할지"를 **레벨 커스텀 필드**로 지정한다.
LDtk에서 Project → Level fields 에 아래 필드들을 추가(한 번만):

| 필드 이름 | 타입 | 의미 | 예시 |
|---|---|---|---|
| `varName` | String | 해킹할 변수 | `jumpPower` 또는 `gravity` |
| `hackStart` | Int | 시작값 (못 깨는 값) | `10` |
| `hackMin` | Int | 정답 하한 | `25` |
| `hackMax` | Int | 정답 상한 (없으면 999) | `41` |
| `hackDir` | String | 방향 | `higher` / `lower` / `range` |
| `title` | String | 스테이지 제목 | `Forest — 가시 조심` |
| `theme` | String | (선택) 테마 | `forest_day` |

**hackDir 의미:**
- `higher` — 값을 키워야 클리어 (점프력↑)
- `lower` — 값을 줄여야 클리어 (중력↓)
- `range` — 구간을 찾아야 함 (너무 커도 작아도 실패, 가시 스테이지)

필드를 비워두면 기본값(jumpPower / 10 / 25 / 999 / higher)이 쓰인다.

---

## 3. 변환 실행

LDtk에서 저장한 뒤 터미널에서:

```bash
node tools/ldtk-import.js levels/codebreaker.ldtk
```

결과:
- LDtk의 각 레벨 → `stages/stage_00.js`, `stage_01.js`, … (순서대로)
- `stages/index.js` (레지스트리) 자동 갱신

레벨 순서 = LDtk의 World에서의 레벨 순서. 스테이지 진행도 그 순서.

---

## 4. 게임에서 확인

로컬 서버로 게임을 열면 새 스테이지가 반영돼 있다:

```bash
npm run dev   # python3 -m http.server 8000
```

---

## 값 매핑 요약 (변환기 내부)

```
LDtk IntGrid    →    게임 grid
   0 (빈칸)              0
   1 (잔디)              1
   2 (흙)                2
   3 (가시)              9
```

이 매핑은 `tools/ldtk-import.js` 의 `INTGRID_MAP` 에 있다. 타일 종류를 늘리려면
여기와 엔진의 렌더(`engine.js`의 타일 그리기)를 함께 수정한다.
