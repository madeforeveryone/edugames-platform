// ============================================================
//  items.js — 맵 아이템 접근 헬퍼
//  아이템은 LDtk 'Item' 엔티티로 배치한다(변환기가 stage.level.items로 출력).
//  이 헬퍼는 "현재 로드된 스테이지"의 items 배열을 그대로 꺼내준다.
//    → 레지스트리(getStage)를 다시 읽지 않고, 엔진이 넘긴 currentStage를 본다.
//      (런타임에 로드된 스테이지와 항상 일치 — 테스트/즉석 스테이지도 동작)
//
//  아이템 타입(kind):
//    'dashUnlock'       : 대시 해금 (풀 코드 붙여넣기 연출)
//    'doubleJumpUnlock' : 더블점프 해금 (가벼운 연출 + CMD에 jumpCount 추가)
//    'airDashUnlock'    : 에어대시 해금 (가벼운 연출 + CMD에 airDashCharges 추가)
//    'wallSlideUnlock'  : 월슬라이드/월점프 해금 (가벼운 연출)
//
//  좌표는 타일 칸 단위 (col, row). 0,0이 좌상단.
// ============================================================

// 현재 로드된 스테이지(currentStage)의 아이템 목록. 없으면 빈 배열.
//   엔진은 itemsForStage(game.stageIndex, game.currentStage)로 호출한다(hazardsForStage와 동일 패턴).
export function itemsForStage(stageIndex, currentStage){
  const st = currentStage;
  return (st && st.level && Array.isArray(st.level.items)) ? st.level.items : [];
}
