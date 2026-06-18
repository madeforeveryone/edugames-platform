// ============================================================
//  hazards.js — 맵에 배치되는 "동적 위험/장치" 데이터 (수동 관리)
//  변환기(LDtk)가 stage를 재생성해도 영향받지 않도록 별도 파일로 둔다 (items.js와 동일 패턴).
//  스테이지 인덱스 → 그 방에 놓인 위험/장치 목록.
//
//  ── 왜 격자(grid)나 Tiles.png가 아니라 여기인가 ──
//  격자(IntGrid)와 Tiles.png는 "안 움직이는" 충돌·그림 전용이다.
//  이동 발판/떨어지는 산성액/올라오는 가시처럼 위치·상태·타이밍이 변하는 것은
//  매 프레임 갱신되는 "동적 객체"라 격자로 표현할 수 없다 → 여기 데이터 + 엔진 로직으로 처리.
//
//  ── 좌표 ──
//  col, row = 타일 칸 단위 (32px). 0,0이 좌상단. 발판은 "윗면(디딜 면)"의 칸 기준.
//
//  ── 결정론적 동작 ──
//  모든 위험은 난수 없이 period/phase(또는 왕복)만으로 움직인다 → 플레이어가
//  "값을 바꾸면 어떻게 되는지" 예측 가능. (CodeBreaker의 핵심: 운이 아니라 계산.)
//
//  ── 타입 (현재 구현: platform) ──
//  platform : 왕복 이동 발판. 윗면만 solid(one-way). 위에 타면 같이 실려 이동.
//    필수: col, row
//    선택: axis('x'|'y', 기본 'x'), range(왕복 칸수, 기본 3), speed(px/frame, 기본 1.0),
//          pauseFrames(양 끝 정지 프레임, 기본 20), widthTiles(발판 폭 칸수, 기본 2)
//    권장 speed: 0.8~1.4 (RUN_SPEED 3.4의 1/4~1/2). 너무 빠르면 못 탐.
//    권장 pauseFrames 프리셋: 0(쉴 틈 없음) / 20(기본) / 45(여유).
//
//  acid_drip : 천장에서 아래로 떨어지는 산성액 (꼬리 O — 낙하형).
//    위험 구역 = 떨어지는 방울의 현재 위치 1칸(낙하 따라 내려감) → 착지 칸에서 터짐. "천장 아래 타이밍" 퍼즐.
//    필수: col, row  (천장 쪽 에미터 칸)
//    선택(전부 초 단위): sprite(1|3, 기본 1 — 3은 녹색 더 진한 변종),
//          intervalSeconds(한 사이클 전체 시간, 기본 1.5),
//          fallSeconds(에미터→착지 낙하 소요 시간, 기본 0.43),
//          splashSeconds(터짐 5장 재생 소요 시간, 기본 0.4 — 낙하와 독립적으로 조절),
//          appearDelay(첫 방울 등장 지연 — 여러 drip 순차용, 기본 0),
//          reach(아래로 뻗는 칸 수, 기본 4)
//
//  acid_burst: 제자리에서 부풀었다 터지는 산성액 (꼬리 X — 폭발형).
//    위험 구역 = 에미터 칸 1칸. 바닥·벽·천장 어디든 붙일 수 있음. "이 칸은 주기적으로 위험".
//    필수: col, row
//    선택(전부 초 단위): intervalSeconds(한 사이클 전체 시간, 기본 1.5),
//          activeSeconds(위험한 시간 길이, 기본 0.55), appearDelay(첫 폭발 지연, 기본 0)
//
//    공통: appearDelay는 절대 초(=cycle 무관) → 플랫폼과 동일하게 그룹별 0,1,2…로 순차 등장.
//          단 appearDelay ≥ intervalSeconds면 cycle 길이로 wrap(플랫폼과 같은 동작).
//          intervalSeconds/fallSeconds를 바꿔도 appearDelay 등장 시점은 안 흔들림.
//
//  (예정 타입: rspike=올라오는 가시, crumble=밟으면 무너지는 발판)
// ============================================================

export const STAGE_HAZARDS = {
  // (폴백 비움) — 모든 위험/장치는 이제 LDtk에서 배치하고 변환기가 stage.level.hazards로 넣는다.
  //   여기에 항목을 두면 "LDtk엔 없는데 게임엔 뜨는" 유령 위험이 생기므로 비워 둔다.
  //   LDtk 없이 임시로 테스트할 방이 있으면 그때만 한시적으로 추가하고, 끝나면 다시 비울 것.
};

// 특정 스테이지의 위험 목록.
//   우선순위: (1) LDtk에서 생성된 stage.level.hazards (변환기가 채움)
//             (2) 위 STAGE_HAZARDS[stageIndex] (손으로 쓴 폴백 — LDtk 미적용 방·임시 추가용)
//   LDtk로 옮긴 방은 (1)이 있으니 그게 쓰이고, 아직 LDtk에 없는 방은 (2)로 동작.
//   stage 인자는 game.currentStage (engine이 buildHazards에서 넘김). 없으면 인덱스 폴백만.
export function hazardsForStage(stageIndex, stage){
  const fromLdtk = stage && stage.level && stage.level.hazards;
  if(Array.isArray(fromLdtk) && fromLdtk.length) return fromLdtk;
  return STAGE_HAZARDS[stageIndex] || [];
}
