// ============================================================
//  engine.js — LAYER 2: GAME RUNTIME (공통 엔진)
//  물리 · 충돌 · 렌더 · 애니메이션. 장르 무관 공통 로직.
//  공유 상태는 state.js에서, 스테이지 데이터는 config(STAGE)에서 받는다.
// ============================================================

import { ASSETS } from '../assets/assets.js';
import {
  TILE, RUN_SPEED, FRICTION, SRC, PLATFORM_SRC, ACID_SRC, ACID_IMPACT_FRAC,
  SPIKE_SRC, SPIKE_RISE_SECONDS, SPIKE_RETRACT_SECONDS,
  game, player, camera, keys, dustParticles, img
} from './state.js';
import { getRuntime, setRuntime, runtimeKeyOf } from './abilities.js';
import { itemsForStage } from '../data/items.js';
import { hazardsForStage } from '../data/hazards.js';

// ---- canvas ----
export const cv = document.getElementById('game');
export const ctx = cv.getContext('2d');
ctx.imageSmoothingEnabled = false;
export const W = cv.width, H = cv.height;

// ---- 외부(main)에서 주입되는 훅: 해킹 트리거/힌트 ----
//  engine ↔ hackshell 순환 의존을 피하려고, main이 연결해 준다.
//  주입 전에도 안전하도록 no-op 기본값.
const hooks = {
  onDeath: ()=>{},   // 죽음 시 (첫 죽음=CodeBreak 발동 / 재시도=튜닝 힌트 판단은 main)
  onWin: ()=>{},     // 클리어 시 (다음 스테이지 진행 판단은 main)
  onItem: ()=>{},   // 능력 해금 아이템에 닿았을 때 (종류별 연출은 main이 담당)
  onDashItem: ()=>{},// (구버전 호환) 대시 해금 아이템 — 이제 onItem으로 통합
};
export function setHooks(h){ Object.assign(hooks, h); }

// ---- 스테이지 로드: 현재 스테이지 데이터로 레벨 재빌드 + 플레이어/해킹값 초기화 ----
export function loadStage(stage, stageIndex, keepVars){
  game.currentStage = stage;
  game.stageIndex = stageIndex;
  // 해킹 대상 변수의 런타임 값 설정.
  //   keepVars=true(방 전환)면 이전에 조정한 값을 유지(이어받기).
  //   단 그 변수의 런타임 값이 아직 없으면(첫 등장) 스테이지 시작값을 쓴다.
  const key = runtimeKeyOf(stage.hack.varName);
  if(!keepVars || game[key] == null){
    setRuntime(game, stage.hack.varName, stage.hack.current);
  }
  // keepVars=true이고 game[key]가 이미 있으면 그대로 유지 (이전 방 값 이어받음)
  recomputeBreaks();   // 방 진입: 코드브레이크 횟수 = 최대치로 리셋 (해금 수에 따라 max 결정)
  buildLevel();
  enterRoom();   // intro 연출 (화면 밖에서 달려 들어옴)
}

// 코드브레이크 최대 횟수 계산 + 남은 횟수 리셋.
//   기본 1회 + 해금된 능력마다 +1 (대시/더블점프/에어대시/월슬라이드).
//   방 진입·사망 시 호출 → breaksLeft를 max로 채움.
export function recomputeBreaks(){
  let max = 1;
  if(player.dashUnlocked)       max++;
  if(player.doubleJumpUnlocked) max++;
  if(player.airDashUnlocked)    max++;
  if(player.wallSlideUnlocked)  max++;
  game.breaksMax = max;
  game.breaksLeft = max;
}

// ---- 이미지 로딩 ----
let loaded = 0; const toLoad = Object.keys(ASSETS).length;
export function loadAll(cb){
  for(const k in ASSETS){
    const im = new Image();
    im.onload = ()=>{ if(++loaded===toLoad) cb(); };
    im.src = ASSETS[k];
    img[k]=im;
  }
}

// ---- 레벨 레이아웃 ----
// 타일: 0=빈공간, 1=잔디바닥, 2=흙, 9=천장가시
// 레벨은 현재 스테이지의 config.level 데이터로 빌드.
//   - LDtk 생성: config.level.grid (완성된 2D 격자) → 그대로 사용
//   - 레거시: config.level.pits/ceilingSpikes → 격자 빌드 (하위 호환)
export const ROWS = 16;
export let COLS = 44;
export let FLAG_COL = 40;
export let START_COL = 2;
export let START_ROW = null;   // 선택된 Enter 세로 위치. null이면 바닥 자동탐색.
export let START_ENTER = null; // 선택된 Enter의 enter 방향('up'|'down'|'left'|'right'). 명시 시 intro 진입 방향.
export let FLAG_ROW = null;    // Exit 세로 위치 (스칼라 폴백).
export let GOALS = [];         // 모든 Exit 셀 [{col,row,exit,target,targetEntry}]. 멀티 출구/통로 막기.
export let STARTS = [];        // 모든 Enter [{col,row,id,enter}]. 멀티 입구. exitTargetEntry가 id로 선택.
export let level = [];

// 대시 지속 프레임 수 (이 동안 수평 속도가 dashPower로 고정됨). ~10프레임 = 약 0.17초.
const DASH_FRAMES = 10;
// Shift "눌린 순간"만 잡기 위해 직전 프레임의 Shift 상태를 추적 (계속 눌러도 1회만 발동).
let dashKeyPrev = false;
let jumpKeyPrev = false;   // 점프 키 에지 검출 (눌린 순간만 1회 — 더블점프 입력 소비 방지)
let runDustTimer = 0;   // 이동 먼지 생성 주기 카운터
let overlayOn = true;   // 조명 오버레이 on/off (O키로 토글)

export function buildLevel(){
  const stage = game.currentStage;
  const L = (stage && stage.level) || {};
  COLS = L.cols || 44;
  FLAG_COL = (L.flagCol != null) ? L.flagCol : (COLS-4);
  FLAG_ROW  = (L.goalRow != null) ? L.goalRow : null;

  // ── 입구(Enter) 선택 ──
  //   STARTS 목록에서, 직전 Exit가 지정한 game.exitTargetEntry(id)와 일치하는 Enter를 고른다.
  //   못 찾거나 미지정이면: id 0 → 첫 Enter → (Enter가 아예 없으면) 스칼라 폴백.
  STARTS = Array.isArray(L.starts) ? L.starts.map(s => ({ col:s.col, row:s.row, id:s.id, enter:s.enter })) : [];
  const wantId = game.exitTargetEntry;
  let chosen = null;
  if(STARTS.length){
    if(wantId != null) chosen = STARTS.find(s => s.id === wantId) || null;
    if(!chosen) chosen = STARTS.find(s => s.id === 0) || STARTS[0];
  }
  game.exitTargetEntry = null;   // 소비 (다음 전환까지 유지 안 함)
  if(chosen){
    START_COL   = chosen.col;
    START_ROW   = (chosen.row != null) ? chosen.row : null;
    START_ENTER = chosen.enter || null;
  } else {
    // Enter 엔티티가 없는 옛 데이터 → 스칼라 필드 폴백.
    START_COL   = (L.startCol != null) ? L.startCol : 2;
    START_ROW   = (L.startRow != null) ? L.startRow : null;
    START_ENTER = (L.startEnter != null) ? L.startEnter : null;
  }

  // Exit(골) 셀 목록. LDtk가 goals 배열을 주면 그걸, 없으면 스칼라 폴백.
  //   ⚠️ 폴백은 goalRow가 명시된 경우에만 1칸 골을 만든다. goalRow가 없으면(=세로 미지정)
  //      "맵 끝 열 전체가 골"인 옛 일직선 의미로 보고 GOALS를 비워 둔다(아래 판정에서 열 기준 폴백).
  if(Array.isArray(L.goals) && L.goals.length){
    GOALS = L.goals.map(g => ({ col:g.col, row:g.row, exit:g.exit, target:g.target, targetEntry:g.targetEntry }));
  } else if(FLAG_ROW != null){
    GOALS = [{ col:FLAG_COL, row:FLAG_ROW }];
  } else {
    GOALS = [];
  }

  if(L.grid){
    // LDtk 생성 격자: 깊은 복사해서 사용 (원본 config 불변 유지)
    level = L.grid.map(row => row.slice());
    // 행 수가 ROWS와 다르면 맞춤 (위를 빈 줄로 패딩)
    while(level.length < ROWS) level.unshift(new Array(COLS).fill(0));
    if(level.length > ROWS) level = level.slice(level.length-ROWS);
  } else {
    // 레거시: pits/ceilingSpikes로 빌드 (LDtk 안 쓰는 옛 경로)
    //   새 충돌 규약상 밟는 땅은 InsideWall(2). 바닥 두 줄 모두 2로.
    level = [];
    for(let r=0;r<ROWS;r++){ level[r]=new Array(COLS).fill(0); }
    for(let c=0;c<COLS;c++){ level[ROWS-1][c]=2; level[ROWS-2][c]=2; }
    for(const p of (L.pits||[])){
      for(let c=p.start; c<p.start+p.width; c++){
        level[ROWS-1][c]=0; level[ROWS-2][c]=0;
      }
    }
    for(const s of (L.ceilingSpikes||[])){
      for(let c=s.start; c<=s.end; c++){ level[s.row][c]=9; }
    }
  }
  buildHazards();
}

// ---- 동적 위험/장치 인스턴스화 (data/hazards.js → game.hazards) ----
//   런타임 상태(현재 위치·진행 방향·정지 카운터 등)를 담은 인스턴스로 변환한다.
//   data는 "정의(설계값)"만, 여기서 만드는 인스턴스가 "현재 상태"를 가진다 (원본 불변).
function buildHazards(){
  game.tick = 0;
  game.hazards = [];
  for(const h of hazardsForStage(game.stageIndex, game.currentStage)){
    if(h.type === 'platform'){
      const widthTiles = h.widthTiles || 1;
      const range = (h.range != null) ? h.range : 3;
      const speed = (h.speed != null) ? h.speed : 1.0;
      const axis  = (h.axis === 'y') ? 'y' : 'x';
      const pause = (h.pauseFrames != null) ? h.pauseFrames : 20;
      // 발판의 "홈 위치"(왕복 시작점) 픽셀 좌상단. row는 윗면(디딜 면) 칸.
      const homeX = h.col * TILE;
      const homeY = h.row * TILE;
      // 점멸(blink): 전부 "초" 단위. onSeconds 켜짐 + offSeconds 꺼짐, appearDelay만큼 늦게 등장.
      //   onSeconds<=0 또는 미설정이면 점멸 안 함(항상 켜진 고정 발판).
      //   내부는 ×60으로 프레임 변환. appearDelay는 절대 시간(초)이라 cycle과 무관 → 직관적.
      //   순차로 만들려면 그룹별 appearDelay를 0, 1, 2…처럼 등장 간격(초)만큼 주면 됨.
      const FPS = 60;
      const onFrames  = (h.onSeconds  != null) ? Math.round(h.onSeconds  * FPS) : 0;   // 0 = 점멸 안 함
      const offFrames = (h.offSeconds != null) ? Math.round(h.offSeconds * FPS) : 60;
      const delayFrames = (h.appearDelay != null) ? Math.round(h.appearDelay * FPS) : 0;
      const blinks    = onFrames > 0;
      game.hazards.push({
        type: 'platform',
        axis, speed, pause,
        widthTiles,
        w: widthTiles * TILE,
        h: TILE / 2,            // 윗면만 쓰는 얇은 발판(시각/충돌 높이 16px)
        homeX, homeY,
        x: homeX, y: homeY,
        prevX: homeX, prevY: homeY,   // 직전 프레임 위치 (캐릭터 태우기용 델타 계산)
        rangePx: range * TILE,  // range:0이면 0 → 이동 안 함(고정 발판)
        moves: range > 0,       // 이동 여부 (range 0이면 고정)
        dir: 1,                 // +1/-1 왕복 방향
        pauseLeft: 0,           // 끝점 정지 잔여 프레임
        blinks, onFrames, offFrames, delayFrames,
        on: true,               // 현재 켜짐(밟히는) 상태 — updateHazards가 갱신
        animFrame: (PLATFORM_SRC.frames-1),  // 표시 프레임(고정=완성형, 점멸=등장 연출)
      });
    }
    // ── 산성액 (전부 "초" 단위 — 플랫폼과 같은 철학) ──
    //   acid_drip : 에미터(천장)에서 frame0(맺힌 방울)이 아래로 낙하 → 착지하면 그 자리에서
    //               frame1~5로 터짐 → 잠시 후 다시 맺혀 낙하 (주기 반복). 진짜 "떨어지는" 위험.
    //   acid_burst: 제자리에서 frame0~5로 부풀어 터짐(낙하 없음, 꼬리 X).
    //   스키마: intervalSeconds(한 사이클 전체 길이) + appearDelay(절대 지연, cycle 무관) 공통.
    //     drip은 fallSeconds(낙하에 걸리는 시간) + reach(낙하 칸수, 유지).
    //     burst은 activeSeconds(위험한 시간 길이).
    //   내부는 ×60으로 프레임 변환(FPS=60). appearDelay는 절대 초 → interval/fall을 바꿔도 등장 시점 불변.
    else if(h.type === 'acid_drip'){
      const FPS = 60;
      const sprite = (h.sprite === 3) ? 3 : 1;
      const reach  = (h.reach != null) ? h.reach : 4;     // 낙하 높이(칸). 에미터 아래 이만큼 떨어짐.
      const intervalFrames = (h.intervalSeconds != null) ? Math.round(h.intervalSeconds * FPS) : 90;  // 한 사이클 전체
      const fallFrames     = (h.fallSeconds     != null) ? Math.max(1, Math.round(h.fallSeconds * FPS)) : 26; // 낙하 소요
      const splashFrames   = (h.splashSeconds   != null) ? Math.max(1, Math.round(h.splashSeconds * FPS)) : 24; // 터짐 소요(기본 0.4초≈24f). 낙하와 독립.
      const delayFrames    = (h.appearDelay     != null) ? Math.round(h.appearDelay * FPS) : 0;        // 절대 지연
      game.hazards.push({
        type: 'acid_drip',
        col: h.col, row: h.row,
        sprite, reach, intervalFrames, fallFrames, splashFrames, delayFrames,
        // 런타임 상태 (updateHazards가 갱신):
        phaseName: 'fall',  // 'fall'(낙하) | 'splash'(착지 터짐) | 'idle'(대기)
        dropY: h.row*TILE,  // 현재 방울 윗면 y (낙하 중 증가)
        splashRow: h.row,   // 착지한 칸 (터질 위치)
        frame: 0,           // 그릴 프레임 0~5
        active: false,      // 위험 판정 on/off
      });
    }
    else if(h.type === 'acid_burst'){
      const FPS = 60;
      const intervalFrames = (h.intervalSeconds != null) ? Math.round(h.intervalSeconds * FPS) : 90; // 한 사이클 전체
      const activeFrames   = (h.activeSeconds   != null) ? Math.max(1, Math.round(h.activeSeconds * FPS)) : 33; // 위험 지속
      const delayFrames    = (h.appearDelay     != null) ? Math.round(h.appearDelay * FPS) : 0;       // 절대 지연
      game.hazards.push({
        type: 'acid_burst',
        col: h.col, row: h.row,
        intervalFrames, activeFrames, delayFrames,
        frame: 0, active: false,
      });
    }
    // ── 가시 (통합 시스템) ──
    //   static=true  : 항상 솟은 위험(f2 고정). 옛 grid-9 정적 가시를 대체.
    //   static=false : 주기 점멸 — onSeconds 동안 위험(솟기 애니→f2), offSeconds 동안 안전(들어가기 애니→f0).
    //   dir: 'up'(바닥, 기본) | 'down'(천장) | 'left' | 'right'(벽). 렌더 회전 + 충돌은 어차피 칸 전체라 공통.
    //   전부 "초" 단위 ×60. 전환 애니(rise/retract)는 짧게 고정, on/off는 위험/안전 유지 시간.
    else if(h.type === 'spike'){
      const FPS = 60;
      const isStatic = !!h.static;
      const dir = (h.dir === 'down' || h.dir === 'left' || h.dir === 'right') ? h.dir : 'up';
      const onFrames   = (h.onSeconds  != null) ? Math.max(1, Math.round(h.onSeconds  * FPS)) : 90; // 위험 유지
      const offFrames  = (h.offSeconds != null) ? Math.max(1, Math.round(h.offSeconds * FPS)) : 90; // 안전 유지
      const riseFrames    = Math.max(1, Math.round(SPIKE_RISE_SECONDS    * FPS)); // f0→f2 전환 길이
      const retractFrames = Math.max(1, Math.round(SPIKE_RETRACT_SECONDS * FPS)); // f3→f0 전환 길이
      const delayFrames   = (h.appearDelay != null) ? Math.round(h.appearDelay * FPS) : 0;
      game.hazards.push({
        type: 'spike',
        col: h.col, row: h.row,
        dir, static: isStatic,
        onFrames, offFrames, riseFrames, retractFrames, delayFrames,
        // 런타임 상태 (updateHazards가 갱신):
        phase: isStatic ? 'on' : 'off',  // 'off'(안전) | 'rise' | 'on'(위험) | 'retract'
        frame: isStatic ? 2 : 0,         // 그릴 프레임 0~5 (static은 f2 고정)
        active: isStatic,                // 위험 판정 on/off (static은 항상 위험)
      });
    }
    // (예정) crumble 인스턴스화.
  }
}

const START_Y = (ROWS-3)*TILE;

// ---- 플레이어 리셋 (죽음 후 재시도 — 시작점에서 바로 조작 가능) ----
export function resetPlayer(){
  player.x=START_COL*TILE;
  // 시작 y: 엔티티가 지정한 START_ROW가 있으면 그 칸에 서게(발이 바로 아래 바닥에). 
  //   없으면 시작 열에서 바닥 자동탐색(위에서 첫 벽 — 천장 없는 맵용 폴백).
  if(START_ROW != null){
    player.y = (START_ROW+1)*TILE - player.h;
  } else {
    let groundRow = ROWS-2;
    for(let r=0;r<ROWS;r++){ if(solid(level[r][START_COL])){ groundRow=r; break; } }
    player.y = groundRow*TILE - player.h;
  }
  player.vx=0; player.vy=0;
  player.grounded=false; player.facing=1; player.dead=false; player.won=false;
  player.anim='idle'; player.frame=0; player.frameT=0;
  player.phase='play';
  player.dashing=0; player.dashLeft=getRuntime(game,'dashCharges');  // 대시 진행 리셋(해금 상태는 유지)
  player.jumpsLeft=Math.max(0,getRuntime(game,'jumpCount')-1); player.airDashLeft=getRuntime(game,'airDashCharges'); player.wallJumpLock=0; player.touchingWallDir=0; player.wallSliding=false;
  player.ridingPlatform=null;
  // 재시도 시 위험/장치도 시작 상태로 되돌림 (결정론적 재도전).
  game.tick = 0;
  for(const h of game.hazards){
    if(h.type === 'platform'){
      h.x = h.homeX; h.y = h.homeY; h.prevX = h.homeX; h.prevY = h.homeY;
      h.dir = 1; h.pauseLeft = 0; h.on = true;
    }
  }
  camera.x=0; dustParticles.length=0;
  recomputeBreaks();   // 사망/재시도: 코드브레이크 횟수 최대치로 리셋 (이번 시도 다시 시작)
}

// ---- 방 입장 (intro 연출 — 시작점 왼쪽 여백만큼 멀리서 자동 달려옴) ----
export function enterRoom(){
  const startX = START_COL*TILE;
  player.introTargetX = startX;

  // y: 엔티티 START_ROW가 있으면 그 칸 기준(발이 바로 아래 바닥에). 없으면 바닥 자동탐색.
  let startY;
  if(START_ROW != null){
    startY = (START_ROW+1)*TILE - player.h;
  } else {
    let groundRow = ROWS-2;
    for(let r=0;r<ROWS;r++){ if(solid(level[r][START_COL])){ groundRow=r; break; } }
    startY = groundRow*TILE - player.h;
  }
  player.y = startY;
  player.introTargetY = startY;   // 수직 진입 시 멈출 y

  player.vx=0; player.vy=0;
  player.grounded=true; player.facing=1; player.dead=false; player.won=false;
  player.anim='walk'; player.frame=0; player.frameT=0;
  player.phase='intro';
  player.dashing=0; player.dashLeft=getRuntime(game,'dashCharges');  // 대시 진행 리셋(해금 유지)
  player.jumpsLeft=Math.max(0,getRuntime(game,'jumpCount')-1); player.airDashLeft=getRuntime(game,'airDashCharges'); player.wallJumpLock=0; player.touchingWallDir=0; player.wallSliding=false;
  player.ridingPlatform=null;
  dustParticles.length=0;

  const maxCam = Math.max(0, COLS*TILE - W);

  // ── 진입 방향(어느 가장자리에서 들어오나) 결정 — 우선순위 ──
  //   1) 선택된 Enter의 enter 필드 명시('left'|'right'|'up'|'down')
  //   2) 없으면 Enter 위치가 맵 어느 가장자리에 가까운지로 자동:
  //      세로(위/아래 가장자리)가 가로(좌/우)보다 가까우면 상/하, 아니면 좌/우.
  //   side: 'left'|'right'|'top'|'bottom' (들어오는 가장자리)
  let side;
  const en = (START_ENTER || '').toLowerCase();
  if(en==='left'||en==='right'||en==='up'||en==='down'){
    side = (en==='up') ? 'top' : (en==='down') ? 'bottom' : en;   // up→top, down→bottom
  } else {
    // 가장자리까지 거리: 좌(START_COL), 우(COLS-1-START_COL), 상(startRow), 하(ROWS-1-startRow).
    //   바닥에 선 Enter는 하단 거리가 작아 수직으로 오인되기 쉬우므로, 수직은 "뚜렷이" 더
    //   가까울 때(2칸 이상)만 선택. 보통은 좌/우 수평 진입을 기본으로.
    const sRow = (START_ROW != null) ? START_ROW : (ROWS-2);
    const dL = START_COL, dR = (COLS-1) - START_COL, dT = sRow, dB = (ROWS-1) - sRow;
    const minH = Math.min(dL, dR), minV = Math.min(dT, dB);
    if(minV + 2 < minH){
      side = (dT <= dB) ? 'top' : 'bottom';
    } else {
      side = (dL <= dR) ? 'left' : 'right';
    }
  }

  // 카메라: 시작점이 화면 중앙쯤 오도록, 0~maxCam 클램프 (수평 스크롤만).
  let camT = startX - W/2 + 40;
  if(camT < 0) camT = 0;
  if(camT > maxCam) camT = maxCam;
  camera.x = camT;

  if(side==='top' || side==='bottom'){
    // ── 수직 진입: 화면 위/아래 밖에서 startY로 떨어지거나 솟아 들어옴 ──
    player.introAxis = 'y';
    player.x = startX;   // 가로는 시작 칸에 정렬
    if(side==='top'){
      player.introDir = 1;             // 아래로 진행(위에서 내려옴)
      player.y = -2*TILE - player.h;   // 화면 위 밖
    } else {
      player.introDir = -1;            // 위로 진행(아래에서 올라옴)
      player.y = ROWS*TILE + 2*TILE;   // 화면 아래 밖
    }
    player.facing = 1;
  } else {
    // ── 수평 진입: 기존 로직 (가장자리 밖에서 startX로 달려옴) ──
    player.introAxis = 'x';
    // 진행(주행) 방향: 들어온 쪽에서 시작점 쪽으로. left에서 들어오면 오른쪽(+1), right면 왼쪽(-1).
    const dir = (side==='left') ? 1 : -1;
    player.introDir = dir;
    player.facing = dir;
    // 진행 반대쪽(들어온 가장자리)으로 바닥 연속 칸 수 = 등장 여백.
    let marginCols = 0;
    for(let c = START_COL - dir; c >= 0 && c < COLS; c -= dir){
      let hasFloor=false;
      for(let r=0;r<ROWS;r++){ if(solid(level[r][c])){ hasFloor=true; break; } }
      if(!hasFloor) break;
      marginCols++;
    }
    const marginPx = marginCols * TILE;
    if(dir === 1){
      const leftLimit = startX - marginPx;
      const offscreenX = camera.x - 2*TILE;
      let spawnX = Math.min(offscreenX, startX - 2*TILE);
      if(spawnX < leftLimit) spawnX = leftLimit;
      player.x = spawnX;
    } else {
      const rightLimit = startX + marginPx;
      const offscreenX = camera.x + W + 2*TILE - player.w;
      let spawnX = Math.max(offscreenX, startX + 2*TILE);
      if(spawnX > rightLimit) spawnX = rightLimit;
      player.x = spawnX;
    }
  }
}

// ---- 입력 등록 ----
//  주의: 죽음 후 '스페이스 재시도' 분기는 HACK 의존이므로 main.js에서 처리.
addEventListener('keydown',e=>{
  if(['ArrowLeft','ArrowRight','ArrowUp','Space',' '].includes(e.key)) e.preventDefault();
  keys[e.code]=true;
  // O키: 조명 오버레이 on/off 토글 (테스트용)
  if(e.code==='KeyO'){ overlayOn = !overlayOn; }
});
addEventListener('keyup',e=>{ keys[e.code]=false; });

// ---- 먼지 파티클 ----
function spawnDust(x,y){ dustParticles.push({x,y,life:18,f:0}); }

// ---- 타일 헬퍼 ----
function tileAt(col,row){
  if(row<0||row>=ROWS||col<0||col>=COLS) return 0;
  return level[row][col];
}
function solid(v){ return v===2; }   // InsideWall(2)만 밟는 땅 (OuterWall은 변환 시 0)

// 주어진 칸(col,row)에서 아래로 내려가며 첫 솔리드 타일을 찾아 그 "윗면 y"를 돌려준다.
//   산성액(방울/폭발)을 공중이 아니라 바닥 표면에서 터지게 그리는 데 쓴다.
//   아래에 솔리드가 없으면(떠있는 위치) null → 호출부가 기존 칸 기준으로 폴백.
function floorSurfaceBelow(col, row){
  for(let r=row; r<ROWS; r++){
    if(solid(tileAt(col, r))) return r*TILE;   // 그 솔리드 칸의 윗면
  }
  return null;
}
function isSpike(v){ return v===9; }

// ---- 물리 & 충돌 ----
export function physics(){
  if(player.dead) return;

  // ── 연출 단계 (intro/outro): 중력·충돌 없이 수평 자동 주행 ──
  //   화면 밖(바닥 없는 곳)에서도 안 떨어지도록 y를 시작점 바닥 높이에 고정.
  if(player.phase==='intro' || player.phase==='outro'){
    if(player.phase==='intro'){
      if(player.introAxis === 'y'){
        // 수직 진입: introDir +1=아래로 내려옴(위에서), -1=위로 올라옴(아래에서). introTargetY에서 멈춤.
        const dir = player.introDir;
        const speed = RUN_SPEED * 1.6 * dir;   // 수직은 살짝 빠르게(낙하/상승 느낌)
        player.vy = speed; player.y += speed;
        player.anim = 'jump';   // 점프 시트가 vy로 상승/하강 프레임 자동
        player.facing = 1;
        if((dir===1 && player.y >= player.introTargetY) ||
           (dir===-1 && player.y <= player.introTargetY)){
          player.y = player.introTargetY;
          player.vy = 0; player.grounded = true;
          player.phase = 'play';
        }
      } else {
        // 수평 진입: introDir 방향으로 startX까지 달려와 멈춤 (+1=오른쪽으로, -1=왼쪽으로).
        const dir = player.introDir;
        player.vx = RUN_SPEED * dir; player.facing = dir;
        player.x += player.vx;
        player.anim='walk';
        // 도착 판정: 진행 방향에 따라 "지나쳤는지" 비교 부호가 다름.
        if((dir===1 && player.x >= player.introTargetX) ||
           (dir===-1 && player.x <= player.introTargetX)){
          player.x = player.introTargetX;
          player.vx = 0;
          player.phase = 'play';   // 도착 → 조작 가능 (여기서부터 중력 작동)
        }
      }
    } else { // outro
      // 퇴장 축에 따라 분기. x=수평 달리기(기존), y=수직(위로 점프상승 / 아래로 낙하).
      if(player.outroAxis === 'y'){
        const dir = player.outroDir;   // -1=위, +1=아래
        if(dir === -1){
          // 위로 퇴장: 도약하듯 상승. 약한 중력으로 자연스러운 호를 그리되 화면 위로 빠져나감.
          if(player.vy === 0) player.vy = -getRuntime(game,'jumpPower') * 0.84 * 1.4;  // 살짝 강한 도약
          player.vy += getRuntime(game,'gravity') / 50 * 0.25;   // 약한 중력(상승 유지 위주)
        } else {
          // 아래로 퇴장: 낙하. 중력 가속으로 떨어짐.
          if(player.vy < 0) player.vy = 0;
          player.vy += getRuntime(game,'gravity') / 50;
        }
        player.y += player.vy;
        player.anim = 'jump';   // 점프 시트가 vy로 상승/하강 프레임 자동 선택
        const offTop    = (player.y + player.h) < (-2*TILE);          // 화면(맵) 위로 완전히 벗어남
        const offBottom = player.y > (ROWS*TILE + 2*TILE);            // 아래로 완전히 벗어남
        if((dir===-1 && offTop) || (dir===1 && offBottom)){
          if(!player.won){ player.won = true; hooks.onWin(game.stageIndex); }
        }
      } else {
        // 수평 퇴장: outroDir 방향(접촉한 골 쪽)으로 화면 밖까지 달려 나감.
        const dir = player.outroDir;
        player.vx = RUN_SPEED * dir; player.facing = dir;
        player.x += player.vx;
        player.anim='walk';
        const offRight = player.x > (camera.x + W + 2*TILE);
        const offLeft  = (player.x + player.w) < (camera.x - 2*TILE);
        if((dir===1 && offRight) || (dir===-1 && offLeft)){
          if(!player.won){ player.won = true; hooks.onWin(game.stageIndex); }
        }
      }
    }
    return;  // 중력·충돌·가시 판정 모두 건너뜀
  }

  // ── play: 정상 조작 ──
  if(player.won) return;

  // 동적 위험/장치 갱신 (플레이어 이동 전에 먼저 — 발판의 이번 프레임 이동량을 확정).
  game.tick++;
  updateHazards();
  // 발판 태우기: 직전 프레임에 발판 위에 서 있었다면, 발판이 이번에 움직인 만큼 같이 옮긴다.
  //   (셀레스테식 carry. 플레이어 자체 입력/중력은 그 다음에 적용.)
  if(player.ridingPlatform){
    const p = player.ridingPlatform;
    if(p.on){                          // 점멸로 꺼졌으면 더 이상 안 실어 나름(곧 떨어짐)
      player.x += (p.x - p.prevX);
      player.y += (p.y - p.prevY);
    }
  }
  player.ridingPlatform = null;   // 매 프레임 재판정 (아래 resolvePlatforms에서 다시 설정)

  // 수평 입력 (월점프 직후 짧게 잠금 — 벽으로 즉시 다시 붙는 것 방지)
  if(player.wallJumpLock > 0){ player.wallJumpLock--; }
  if(player.wallJumpLock > 0){
    // 잠금 중: 입력 무시, 월점프 임펄스가 준 vx를 마찰로 서서히만 줄임
    player.vx *= 0.98;
  } else if(keys['ArrowRight']){ player.vx=RUN_SPEED; player.facing=1; }
  else if(keys['ArrowLeft']){ player.vx=-RUN_SPEED; player.facing=-1; }
  else player.vx*=FRICTION;

  // ── 점프 (지상 + 더블점프) ──
  //   "눌린 순간"만 1회 소비하도록 jumpKeyPrev로 에지 검출.
  //   지상이면 점프하며 jumpsLeft를 (jumpCount-1)로 세팅(첫 점프 차감), 공중이면 jumpsLeft>0일 때만.
  //   월슬라이드 중 점프는 아래 월점프 블록에서 따로 처리(우선).
  const jumpDown = keys['Space'] || keys['ArrowUp'];
  const jumpPressed = jumpDown && !jumpKeyPrev;
  if(jumpPressed){
    if(player.wallSlideUnlocked && player.touchingWallDir !== 0 && !player.grounded){
      // ── 월점프: 벽 반대 방향으로 튕겨 오름 ──
      const away = -player.touchingWallDir;             // 벽의 반대쪽
      player.vy = -getRuntime(game,'jumpPower') * 0.84; // 점프와 동일한 상승력
      player.vx = away * RUN_SPEED * 1.15;              // 반대로 약간 강하게 밀어냄
      player.facing = away;
      player.wallJumpLock = 9;                          // ~0.15초 입력 잠금
      player.wallSliding = false;
      // 월점프도 공중 점프 1회를 소비하지 않음(벽 차기는 별개) → jumpsLeft 유지
    } else if(player.grounded){
      // 지상 점프: 첫 점프. 남은 공중 점프 = jumpCount-1.
      player.vy = -getRuntime(game,'jumpPower') * 0.84;
      player.grounded = false;
      player.jumpsLeft = Math.max(0, getRuntime(game,'jumpCount') - 1);
    } else if(player.doubleJumpUnlocked && player.jumpsLeft > 0){
      // 공중 점프(더블점프): 남은 횟수 소비.
      player.vy = -getRuntime(game,'jumpPower') * 0.84;
      player.jumpsLeft--;
    }
  }
  jumpKeyPrev = jumpDown;

  // ── 대시 (수평): 지상 대시 + 에어대시 ──
  //   지상이면 dashLeft, 공중이면 airDashLeft(해금 시) 소비. Shift "눌린 순간"만.
  const shiftDown = keys['ShiftLeft'] || keys['ShiftRight'];
  if(player.dashUnlocked && shiftDown && !dashKeyPrev && player.dashing === 0){
    if(player.grounded && player.dashLeft > 0){
      player.dashing = DASH_FRAMES;
      player.dashLeft--;
      spawnDust(player.x + (player.facing>0?0:player.w), player.y+player.h);
    } else if(!player.grounded && player.airDashUnlocked && player.airDashLeft > 0){
      player.dashing = DASH_FRAMES;
      player.airDashLeft--;
      player.vy = 0;   // 에어대시는 수직 속도를 끊어 "쭉 미끄러지는" 느낌(셀레스테식)
    }
  }
  dashKeyPrev = shiftDown;

  if(player.dashing > 0){
    // 대시 지속 중: 수평 속도를 대시 속도로 고정, 중력 약화(붕 뜨는 느낌)
    player.vx = player.facing * getRuntime(game,'dashPower');
    player.dashing--;
    player.vy += getRuntime(game,'gravity') / 50 * 0.3;  // 32px: /50 (가속 2배), 대시 중 30%만
  } else {
    player.vy += getRuntime(game,'gravity') / 50;  // 32px 세계: 16px 시절 /100의 2배 가속
  }
  if(player.vy>20) player.vy=20;   // 최대 낙하속도도 2배

  player.touchingWallDir = 0;      // 매 프레임 재판정 (resolveAxis('x')가 벽에 막히면 설정)
  player.x += player.vx;
  resolveAxis('x');

  // ── 월슬라이드 ── (해금 시) 공중 + 벽에 밀착 + 그 벽 쪽으로 입력 + 하강 중이면 낙하 감속.
  //   touchingWallDir는 방금 resolveAxis('x')가 설정. 입력 방향이 벽과 같아야(벽을 누르고 있어야) 붙음.
  player.wallSliding = false;
  if(player.wallSlideUnlocked && !player.grounded && player.touchingWallDir !== 0 && player.vy > 0){
    const pressingIntoWall =
      (player.touchingWallDir > 0 && keys['ArrowRight']) ||
      (player.touchingWallDir < 0 && keys['ArrowLeft']);
    if(pressingIntoWall){
      const WALL_SLIDE_MAX = 2.2;          // 슬라이드 시 최대 낙하속도(일반 20보다 훨씬 느림)
      if(player.vy > WALL_SLIDE_MAX) player.vy = WALL_SLIDE_MAX;
      player.wallSliding = true;
      player.facing = player.touchingWallDir; // 벽을 보게(스프라이트 방향)
      // 벽에 붙어 있는 동안 공중 능력 충전 회복(셀레스테식): 더블점프/에어대시 리셋.
      player.jumpsLeft  = Math.max(player.jumpsLeft,  Math.max(0, getRuntime(game,'jumpCount')-1));
      player.airDashLeft = Math.max(player.airDashLeft, getRuntime(game,'airDashCharges'));
    }
  }

  player.y += player.vy;
  const wasGroundedBeforeResolve = player.grounded;  // y충돌 검사 전 접지 상태 (착지 판정용)
  player.grounded=false;
  resolveAxis('y');
  // 이동 발판 윗면 착지(one-way): 격자 충돌 뒤에 검사 → 발판 위면 grounded + ridingPlatform 설정.
  resolvePlatforms();

  // 착지 먼지: 직전 프레임 공중이었다가 이번에 땅에 닿은 경우만 (매 프레임 생성 방지).
  if(player.grounded && !wasGroundedBeforeResolve){
    spawnDust(player.x, player.y+player.h);
  }

  // 착지하면 모든 공중 능력 충전 리셋 (땅에 닿을 때마다 회복).
  //   지상 대시 충전(dashLeft)=dashCharges, 에어대시(airDashLeft)=airDashCharges, 점프(jumpsLeft)=jumpCount-1.
  //   공중에선 리셋 안 됨(월슬라이드 예외는 위에서 처리).
  if(player.grounded){
    player.dashLeft    = getRuntime(game, 'dashCharges');
    player.airDashLeft = getRuntime(game, 'airDashCharges');
    player.jumpsLeft   = Math.max(0, getRuntime(game, 'jumpCount') - 1);
  }

  // 가시·산성액·낙사 (play 단계)
  checkSpikes();
  if(!player.dead) checkAcid();
  if(player.y > (ROWS)*TILE + 40){ die('fall'); }
  // 방금 죽었으면 이번 프레임의 나머지(애니 상태 덮어쓰기·먼지 등)를 건너뛴다.
  //   die()가 anim='death'로 세팅했는데, 아래 anim 전환 블록이 vx=0이라 idle로 되돌려
  //   사망 모션이 재생되지 않던 버그를 막음. (animate()가 death 프레임을 진행시킨다.)
  if(player.dead) return;

  // 능력 해금 아이템 충돌: 종류별로 "이미 해금됐으면" 건너뜀(1회성). 닿으면 main이 연출 담당.
  //   kind → 해금 플래그 매핑. 해당 능력이 이미 해금돼 있으면 그 아이템은 무시.
  {
    const unlockedOf = {
      dashUnlock:       player.dashUnlocked,
      doubleJumpUnlock: player.doubleJumpUnlocked,
      airDashUnlock:    player.airDashUnlocked,
      wallSlideUnlock:  player.wallSlideUnlocked,
    };
    if(!game._itemTaken) game._itemTaken = {};   // 이번 방에서 먹은 아이템 위치 키 집합
    for(const it of itemsForStage(game.stageIndex, game.currentStage)){
      if(unlockedOf[it.type]) continue;          // 이미 해금된 종류는 스킵
      const key = it.type+'@'+it.col+','+it.row;
      if(game._itemTaken[key]) continue;         // 이미 먹음
      const ix = it.col*TILE, iy = it.row*TILE;
      if(player.x < ix+TILE && player.x+player.w > ix &&
         player.y < iy+TILE && player.y+player.h > iy){
        game._itemTaken[key] = true;             // 중복 발동 방지
        if(it.type === 'dashUnlock') game.dashItemTaken = true;  // (기존 호환 플래그 유지)
        hooks.onItem(it);                        // 연출은 main이 담당 (종류별 분기)
        break;
      }
    }
  }

  // ── 골 도달 판정 ──
  //   GOALS가 있으면(엔티티가 세로까지 지정/멀티 출구): 어느 한 골 셀(1칸)과 실제로 겹칠 때만 클리어.
  //     → 같은 열이어도 행이 다르면 스폰 즉시 클리어되는 버그 없음. 통로 막는 골 벽도 지원.
  //   GOALS가 비면(옛 일직선 맵, 세로 미지정): 기존처럼 "골 열 도달"로 폴백.
  if(!player.won){
    if(GOALS.length){
      for(const g of GOALS){
        const gx = g.col*TILE, gy = g.row*TILE;
        if(player.x < gx+TILE && player.x+player.w > gx &&
           player.y < gy+TILE && player.y+player.h > gy){
          // 퇴장 축·방향 결정.
          //   1) 골에 exit 필드('up'|'down'|'left'|'right')가 있으면 그대로 사용 (작가 명시).
          //   2) 없으면 골이 플레이어 중심 기준 어느 쪽에 더 치우쳤는지(|dx| vs |dy|)로 축 자동 판단.
          const goalCx = gx + TILE/2, goalCy = gy + TILE/2;
          const playerCx = player.x + player.w/2, playerCy = player.y + player.h/2;
          const dx = goalCx - playerCx, dy = goalCy - playerCy;
          const ex = (g.exit || '').toLowerCase();
          if(ex==='left' || ex==='right' || ex==='up' || ex==='down'){
            player.outroAxis = (ex==='up'||ex==='down') ? 'y' : 'x';
            player.outroDir  = (ex==='right'||ex==='down') ? 1 : -1;  // y축: 아래=+1, 위=-1
          } else if(Math.abs(dy) > Math.abs(dx) + TILE/2){
            // 골이 위/아래로 "뚜렷이" 더 치우침 → 수직 퇴장.
            //   (바닥에 선 채 옆 골과 닿으면 골 중심이 살짝 아래라 dy가 약간 +가 되는데,
            //    그 정도(<반 타일)로는 수직으로 안 빠지게 여유를 둔다. 명확히 위/아래일 때만 수직.)
            player.outroAxis = 'y';
            player.outroDir  = (dy > 0) ? 1 : -1;   // 아래=+1, 위=-1
          } else {
            // 좌/우로 더 치우침(또는 비슷) → 수평 퇴장 (정중앙이면 기존 진행 방향)
            player.outroAxis = 'x';
            if(dx > 1)      player.outroDir = 1;
            else if(dx < -1) player.outroDir = -1;
            else             player.outroDir = (player.facing || 1);
          }
          player.phase='outro';   // Exit 셀 접촉 → 퇴장 연출 시작
          player.vx=0; player.vy=0;  // 연출 시작 시 속도 초기화 (수직 도약/낙하가 깨끗이 시작되도록)
          // 목적지: target(방 인덱스) + targetEntry(그 방의 Enter id). 없으면 선형 다음 방 + 기본 입구.
          game.exitTarget = (g.target != null && g.target >= 0) ? g.target : null;
          game.exitTargetEntry = (g.targetEntry != null && g.targetEntry >= 0) ? g.targetEntry : null;
          break;
        }
      }
    } else {
      const pcol = Math.floor((player.x+player.w/2)/TILE);
      if(pcol>=FLAG_COL){ player.outroAxis='x'; player.outroDir = 1; game.exitTarget = null; game.exitTargetEntry = null; player.phase='outro'; }  // 옛 일직선
    }
  }

  // 애니메이션 상태 전환 (Platform Boy: idle/walk/jump/dash)
  if(player.dashing > 0)              player.anim='dash';   // 대시 중
  else if(!player.grounded)           player.anim='jump';   // 공중 (상승/하강)
  else if(Math.abs(player.vx)>0.3)    player.anim='walk';   // 지상 이동
  else                                player.anim='idle';   // 지상 정지

  // 이동 먼지: 지상에서 일정 속도 이상으로 움직일 때 발밑에 주기적으로 피어오름.
  //   RUN_SPEED(3.4)의 절반 이상이면 "달리는 중"으로 보고 먼지 생성.
  //   대시 중에는 더 자주(매 3프레임), 달리기는 매 6프레임.
  const RUN_DUST_THRESH = RUN_SPEED * 0.5;
  if(player.grounded && Math.abs(player.vx) >= RUN_DUST_THRESH){
    runDustTimer++;
    const interval = (player.dashing>0) ? 3 : 6;
    if(runDustTimer >= interval){
      runDustTimer = 0;
      // 발밑, 진행 반대 방향으로 살짝 (뒤로 차는 먼지 느낌)
      const behind = (player.facing>0) ? -2 : player.w+2;
      spawnDust(player.x + behind, player.y + player.h);
    }
  } else {
    runDustTimer = 0;  // 멈추거나 공중이면 타이머 리셋
  }
}

function resolveAxis(axis){
  const left = Math.floor(player.x/TILE);
  const right = Math.floor((player.x+player.w-1)/TILE);
  const top = Math.floor(player.y/TILE);
  const bottom = Math.floor((player.y+player.h-1)/TILE);
  for(let r=top;r<=bottom;r++){
    for(let c=left;c<=right;c++){
      if(solid(tileAt(c,r))){
        if(axis==='x'){
          if(player.vx>0){ player.x = c*TILE - player.w; player.touchingWallDir = 1; }   // 오른쪽 벽
          else if(player.vx<0){ player.x = (c+1)*TILE; player.touchingWallDir = -1; }     // 왼쪽 벽
          player.vx=0;
        } else {
          if(player.vy>0){
            player.y = r*TILE - player.h;
            player.grounded=true; player.vy=0;
          } else if(player.vy<0){
            player.y = (r+1)*TILE;
            player.vy=0;
          }
        }
      }
    }
  }
}

// ---- 동적 위험/장치 갱신 (매 프레임, play 단계에서만 호출) ----
//   각 인스턴스의 위치/상태를 진행시킨다. prevX/prevY를 먼저 저장 → 캐릭터 태우기 델타용.
function updateHazards(){
  for(const h of game.hazards){
    h.prevX = h.x; h.prevY = h.y;
    if(h.type === 'platform'){
      // 점멸: onFrames 켜짐 + offFrames 꺼짐 사이클. delayFrames(절대 프레임)만큼 늦게 시작.
      const NF = PLATFORM_SRC.frames;   // 스프라이트 프레임 수(6) — "생성 애니" 길이용.
      if(h.blinks){
        const cycle = h.onFrames + h.offFrames;
        // delayFrames는 절대 지연(초×60): 0=가장 먼저, 클수록 늦게 등장. tick에서 빼면 그만큼 밀림.
        const t = game.tick - h.delayFrames;
        const cyc = ((t % cycle) + cycle) % cycle;             // 0 ~ cycle (음수 보정 포함)
        h.on = (cyc < h.onFrames);                             // 앞 onFrames 동안만 켜짐
        if(h.on){
          // 켜진 직후 짧게 frame0→마지막으로 "생겨나는" 연출, 그 뒤엔 완성형 유지.
          const APPEAR_FRAMES = Math.min(10, h.onFrames);      // 등장 연출 길이(켜짐 시간보다 길지 않게)
          if(cyc < APPEAR_FRAMES){
            h.animFrame = Math.min(NF-1, Math.floor(cyc / APPEAR_FRAMES * NF));
          } else {
            h.animFrame = NF - 1;                              // 단단히 형성된 상태
          }
        } else {
          h.animFrame = 0;
        }
      } else {
        h.on = true;
        h.animFrame = NF - 1;   // 점멸 안 하는 발판: 완성형 프레임 유지
      }
      // 이동: range:0(=!moves)이면 고정. 움직이는 발판만 왕복 처리.
      if(h.moves){
        if(h.pauseLeft > 0){ h.pauseLeft--; }   // 끝점 정지 중
        else {
          const axis = h.axis;
          const home = (axis === 'x') ? h.homeX : h.homeY;
          let pos = (axis === 'x') ? h.x : h.y;
          pos += h.dir * h.speed;
          // 왕복: 홈에서 rangePx만큼 가면 방향 반전 + 끝점 정지.
          const off = pos - home;
          if(off >= h.rangePx){ pos = home + h.rangePx; h.dir = -1; h.pauseLeft = h.pause; }
          else if(off <= 0)   { pos = home;            h.dir =  1; h.pauseLeft = h.pause; }
          if(axis === 'x') h.x = pos; else h.y = pos;
        }
      }
    }
    else if(h.type === 'acid_drip'){
      // 결정론적 낙하+터짐 사이클. 한 사이클(span) 안에서:
      //   [낙하 구간] frame0, 방울 충돌중심이 에미터에서 "바닥 표면"까지 내려감 (fallFrames 동안)
      //   [터짐 구간] 스프라이트 5장(col1~5=Acid2~6)을 splashFrames에 균등 분배해 재생 (바닥에서)
      //   [대기 구간] interval이 낙하+터짐보다 길면 나머지는 안 보이고 안 위험
      //   ⚠️ 낙하 끝점=터짐 위치(둘 다 바닥 표면 충돌중심)로 맞춰 전환 시 튐 없음.
      const SPLASH_SPRITES = 5;         // col1~5 (Acid2~6)
      const emitterY = h.row * TILE;
      h.splashRow = h.row + h.reach;    // 착지(터짐) 기준 칸 — 충돌 판정에 사용
      // 낙하 목표: 착지 칸 아래 바닥 표면의 "충돌중심" y. 바닥 없으면 reach 칸 끝으로 폴백.
      const surf = floorSurfaceBelow(h.col, h.splashRow);
      const impactCenterY = (surf != null) ? surf : (h.splashRow+1)*TILE;
      // dropY(방울 윗면=충돌중심-비율)의 시작/끝
      const dropStart = emitterY;                         // 에미터 칸 윗면에서 시작
      const dropEnd   = impactCenterY - ACID_IMPACT_FRAC*TILE;  // 충돌중심이 바닥에 오는 윗면 y
      const fallFrames = h.fallFrames;
      const splashFrames = h.splashFrames;
      const cycleLen = fallFrames + splashFrames;
      const span = Math.max(h.intervalFrames, cycleLen);
      const t = game.tick - h.delayFrames;
      const cyc = ((t % span) + span) % span;       // 0~span
      if(cyc < fallFrames){
        // 낙하 중: frame0, dropY를 start→end로 보간 (충돌중심이 바닥까지)
        h.phaseName = 'fall';
        h.frame = 0;
        const prog = cyc / fallFrames;              // 0~1
        h.dropY = dropStart + prog * (dropEnd - dropStart);
        h.active = true;                            // 낙하하는 방울도 위험
      } else if(cyc < cycleLen){
        // 터짐: 스프라이트 5장을 splashFrames에 균등 분배. sp(0~splashFrames-1) → col1~5.
        h.phaseName = 'splash';
        const sp = cyc - fallFrames;                // 0 ~ splashFrames-1
        const sIdx = Math.min(SPLASH_SPRITES-1, Math.floor(sp / splashFrames * SPLASH_SPRITES)); // 0~4
        h.frame = 1 + sIdx;                         // col1~5 (Acid2~6)
        h.dropY = dropEnd;                          // 바닥 고정 (렌더는 splashRow 바닥 표면 사용)
        h.active = true;                            // 터지는 동안도 위험
      } else {
        // 대기(다음 방울 전): 안 보이고 안 위험
        h.phaseName = 'idle';
        h.frame = 0;
        h.dropY = dropStart;
        h.active = false;
      }
    }
    else if(h.type === 'acid_burst'){
      // 제자리 폭발. 한 사이클(intervalFrames) 중 앞 activeFrames 동안만 위험하며,
      //   그 위험 구간에 걸쳐 6프레임(0~5)이 부풀어 터진다. 이후 대기(안 위험, 안 보임).
      const ACID_FRAMES = 6;
      const span = Math.max(h.intervalFrames, h.activeFrames);
      const t = game.tick - h.delayFrames;          // 절대 지연
      const cyc = ((t % span) + span) % span;
      if(cyc < h.activeFrames){
        // 위험 구간: 0~5 프레임을 activeFrames에 걸쳐 매핑
        h.frame = Math.min(ACID_FRAMES-1, Math.floor(cyc / h.activeFrames * ACID_FRAMES));
        h.active = true;
      } else {
        // 대기: 안 위험
        h.frame = 0;
        h.active = false;
      }
    }
    else if(h.type === 'spike'){
      // static은 항상 위험(f2 고정) — 인스턴싱에서 세팅했고 갱신 불필요.
      if(h.static){ h.frame = 2; h.active = true; continue; }
      // 점멸 사이클: [rise → on → retract → off] 를 한 바퀴로. 길이는 각 페이즈 합.
      //   페이즈별 프레임 매핑(작가 에셋 규칙):
      //     rise   : f0→f1→f2 (riseFrames 동안, 안전으로 취급 — 아직 완전히 안 솟음)
      //     on     : f2 고정  (onFrames 동안, 위험)
      //     retract: f3→f4→f5 (retractFrames 동안, 안전 — 들어가는 중)
      //     off    : f0 고정  (offFrames 동안, 안전)
      const rise = h.riseFrames, on = h.onFrames, ret = h.retractFrames, off = h.offFrames;
      const span = rise + on + ret + off;
      const t = game.tick - h.delayFrames;          // 절대 지연(다른 가시와 위상 독립)
      const cyc = ((t % span) + span) % span;
      if(cyc < rise){
        // 솟는 중: f0→f1→f2
        const p = cyc / rise;                       // 0..1
        h.frame = Math.min(2, Math.floor(p * 3));   // 0,1,2
        h.phase = 'rise'; h.active = false;
      } else if(cyc < rise + on){
        // 위험 유지: f2
        h.frame = 2; h.phase = 'on'; h.active = true;
      } else if(cyc < rise + on + ret){
        // 들어가는 중: f3→f4→f5
        const p = (cyc - rise - on) / ret;          // 0..1
        h.frame = 3 + Math.min(2, Math.floor(p * 3)); // 3,4,5
        h.phase = 'retract'; h.active = false;
      } else {
        // 안전 대기: f0
        h.frame = 0; h.phase = 'off'; h.active = false;
      }
    }
  }
}

// ---- 이동 발판 윗면 착지 (one-way) ----
//   격자 y충돌(resolveAxis 'y') 뒤에 호출. 플레이어가 "하강 중이고" 발판 윗면을 막 통과(또는 닿음)
//   하면 윗면에 올려놓고 grounded + ridingPlatform을 설정. 옆/아래에서는 통과(one-way).
//   판정은 "직전 발 위치가 발판 윗면 위였고, 이번 발 위치가 윗면 이하"인 경우만 → 뚫고 올라타기 가능.
function resolvePlatforms(){
  if(player.vy < 0) return;   // 상승 중엔 발판을 통과(아래에서 뚫고 올라감)
  const footPrev = (player.y - player.vy) + player.h;   // 이번 프레임 이동 전 발 위치(근사)
  const footNow  = player.y + player.h;
  for(const h of game.hazards){
    if(h.type !== 'platform') continue;
    if(!h.on) continue;                                // 점멸로 꺼진 발판은 못 디딤(사라진 상태)
    const top = h.y;                                   // 발판 윗면 y
    // 수평으로 발판과 겹치는가 (AABB x 겹침)
    const overlapX = (player.x < h.x + h.w) && (player.x + player.w > h.x);
    if(!overlapX) continue;
    // 직전엔 윗면 위(또는 같음)였고, 이번에 윗면을 지나(또는 닿음) → 착지.
    //   발판도 이번에 움직였으므로, 발판 윗면 기준으로 약간의 여유(speed+2px)를 둔다.
    if(footPrev <= top + h.speed + 2 && footNow >= top){
      player.y = top - player.h;
      player.vy = 0;
      player.grounded = true;
      player.ridingPlatform = h;
    }
  }
}

function checkAcid(){
  for(const h of game.hazards){
    if(!h.active) continue;
    if(h.type === 'acid_drip'){
      // 위험 = 현재 방울(또는 터짐) 위치의 1칸. 낙하 중엔 dropY를 따라 내려감.
      const zx = h.col*TILE;
      const zyTop = h.dropY;
      if(player.x < zx+TILE && player.x+player.w > zx &&
         player.y < zyTop+TILE && player.y+player.h > zyTop){
        die('acid'); return;
      }
    } else if(h.type === 'acid_burst'){
      // 제자리 1칸.
      const zx = h.col*TILE, zyTop = h.row*TILE;
      if(player.x < zx+TILE && player.x+player.w > zx &&
         player.y < zyTop+TILE && player.y+player.h > zyTop){
        die('acid'); return;
      }
    } else if(h.type === 'spike'){
      // 위험 페이즈(active)일 때만 — 칸 전체 사망. dir로 사망 원인 구분(천장/바닥/벽).
      const zx = h.col*TILE, zyTop = h.row*TILE;
      if(player.x < zx+TILE && player.x+player.w > zx &&
         player.y < zyTop+TILE && player.y+player.h > zyTop){
        const cause = (h.dir === 'down') ? 'spike_ceiling'
                    : (h.dir === 'left' || h.dir === 'right') ? 'spike_wall'
                    : 'spike_floor';
        die(cause); return;
      }
    }
  }
}

function checkSpikes(){
  // 플레이어가 차지한 모든 칸(머리~발)을 검사 → 천장 가시·바닥 가시·몸통 가시 모두 사망.
  const left   = Math.floor(player.x/TILE);
  const right  = Math.floor((player.x+player.w-1)/TILE);
  const top    = Math.floor(player.y/TILE);
  const bottom = Math.floor((player.y+player.h-1)/TILE);
  for(let r=top;r<=bottom;r++){
    for(let c=left;c<=right;c++){
      if(isSpike(tileAt(c,r))){
        // 천장 가시 / 바닥 가시 구분 → 재시도 힌트를 정확하게 (잘못된 "값 줄여" 안내 방지).
        die(spikeIsCeiling(c,r) ? 'spike_ceiling' : 'spike_floor');
        return;
      }
    }
  }
}

function die(cause){
  if(player.dead) return;
  player.dead=true; player.anim='death'; player.frame=0; player.frameT=0;
  player.vx=0; player.vy=0;
  game.lastCause = cause || 'fall';
  // 첫 죽음 vs 재시도는 main이 주입한 훅이 판단 (HACK.used 등)
  hooks.onDeath(game.lastCause);
}


// soft restart (해킹된 점프력 유지)
export function softRestart(){ resetPlayer(); }

/* ---- 렌더링 ---- */
function drawTile(srcKey,dx,dy){
  const s=SRC[srcKey];
  ctx.drawImage(img.tileset, s.x,s.y,TILE,TILE, dx,dy,TILE,TILE);
}

// LDtk auto-layer 타일 하나 그리기 (src 좌표 + 뒤집기)
function drawLdtkTile(t, dx, dy){
  const fx = (t.f & 1) ? -1 : 1;   // 비트0: 좌우 뒤집기
  const fy = (t.f & 2) ? -1 : 1;   // 비트1: 상하 뒤집기
  if(t.f===0){
    ctx.drawImage(img.tileset, t.src[0],t.src[1],TILE,TILE, dx,dy,TILE,TILE);
  } else {
    ctx.save();
    ctx.translate(dx+TILE/2, dy+TILE/2);
    ctx.scale(fx, fy);
    ctx.drawImage(img.tileset, t.src[0],t.src[1],TILE,TILE, -TILE/2,-TILE/2,TILE,TILE);
    ctx.restore();
  }
}

export function render(){
  ctx.clearRect(0,0,W,H);

  // lab 배경 6레이어 패럴랙스 (1=가장 뒤/하늘 ~ 6=가장 앞/기계). factor 작을수록 천천히=멀리.
  drawBG(img.bg1, 0.10);
  drawBG(img.bg2, 0.25);
  drawBG(img.bg3, 0.40);
  drawBG(img.bg4, 0.55);
  drawBG(img.bg5, 0.70);
  drawBG(img.bg6, 0.85);

  ctx.save();
  ctx.translate(-Math.round(camera.x),0);

  const startC=Math.max(0,Math.floor(camera.x/TILE)-1);
  const endC=Math.min(COLS,startC+Math.ceil(W/TILE)+2);

  // LDtk가 auto-layer로 만든 타일이 있으면 그걸 우선 (가장자리/모서리 자동)
  const ldtkTiles = game.currentStage && game.currentStage.level && game.currentStage.level.tiles;

  if(ldtkTiles){
    for(let r=0;r<ROWS;r++){
      for(let c=startC;c<endC;c++){
        // 가시 칸(grid 9)은 여기서 그리지 않는다 — 아래 drawSpike 루프가 천장/바닥 방향을
        //   판단해 단 한 번만 그린다. (LDtk tiles에 들어온 가시 타일은 항상 위쪽 방향이라
        //   천장 가시에서 drawSpike가 덧그린 것과 겹쳐 "이중 가시"로 보이던 버그를 막음.)
        if(level[r][c]===9) continue;
        const cell = ldtkTiles[c+','+r];
        if(cell){
          for(const t of cell) drawLdtkTile(t, c*TILE, r*TILE);
        }
      }
    }
    // 가시(충돌 grid 값9)는 방향(천장/바닥)에 맞춰 엔진이 단독으로 그림.
    //   "충돌은 있는데 그림이 없는" 보이지 않는 가시 방지 + tiles 중복 그리기 방지.
    for(let r=0;r<ROWS;r++){
      for(let c=startC;c<endC;c++){
        if(level[r][c]===9) drawSpike(c*TILE, r*TILE, c, r);
      }
    }
  } else {
    // 레거시: IntGrid 값으로 단일 타일
    for(let r=0;r<ROWS;r++){
      for(let c=startC;c<endC;c++){
        const v=level[r][c];
        if(v===1) drawTile('grassTop',c*TILE,r*TILE);
        else if(v===2) drawTile('dirt',c*TILE,r*TILE);
        else if(v===9) drawSpike(c*TILE, r*TILE, c, r);
      }
    }
  }

  // 깃발은 그리지 않음 — Goal 셀 접촉 시 자동으로 다음 맵으로 넘어감.
  //   (클리어 판정은 물리 단계의 GOALS 셀 겹침 체크가 담당. 멀티 출구·통로 막기 지원.)

  // 능력 해금 아이템: 아직 해금 안 된 종류만 그림 (떠다니는 픽셀 박스, 종류별 색/아이콘).
  {
    const unlockedOf = {
      dashUnlock:       player.dashUnlocked,
      doubleJumpUnlock: player.doubleJumpUnlocked,
      airDashUnlock:    player.airDashUnlocked,
      wallSlideUnlock:  player.wallSlideUnlocked,
    };
    const taken = game._itemTaken || {};
    for(const it of itemsForStage(game.stageIndex, game.currentStage)){
      if(unlockedOf[it.type]) continue;
      if(taken[it.type+'@'+it.col+','+it.row]) continue;   // 먹은 것도 숨김
      const bob = Math.sin(performance.now()/300) * 2;
      drawItem(it.type, it.col*TILE, it.row*TILE + bob);
    }
  }

  // 동적 위험/장치 (이동 발판 등) — 캐릭터 뒤(아래 레이어)에 그림.
  drawHazards();

  drawPlayer();

  // 먼지 파티클: 캐릭터 뒤가 아니라 앞(나중)에 그려 발밑에서 피어오르게.
  //   spawnDust는 발밑(player.y+player.h) 기준으로 생성됨. 발밑 중앙에 그린다.
  for(const d of dustParticles){
    const fr=Math.min(4,Math.floor(d.f/4));
    ctx.globalAlpha=Math.max(0,d.life/18);
    // 소스 먼지 시트는 16px 프레임이지만 32px 세계라 2배 크기(32)로 그림. 발밑 중앙 정렬.
    ctx.drawImage(img.dust, fr*16,0,16,16, d.x-16,d.y-28,32,32);
    ctx.globalAlpha=1;
  }


  ctx.restore();

  // 조명 오버레이 (lab 분위기): 화면 전체에 고정으로 깔아 부드러운 조명 효과.
  //   overlayOn 토글로 on/off. soft-light 블렌드로 자연스럽게 색조만 입힘.
  if(overlayOn && img.overlay){
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.6;
    ctx.drawImage(img.overlay, 0,0, img.overlay.width, img.overlay.height, 0,0, W, H);
    ctx.restore();
  }
}

function drawBG(image,factor){
  if(!image) return;
  const bw=image.width, bh=image.height;
  const scale=H/bh;
  const sw=bw*scale;
  let ox=(-camera.x*factor)%sw;
  if(ox>0) ox-=sw;
  for(let x=ox;x<W;x+=sw){
    ctx.drawImage(image,0,0,bw,bh, x,0,sw,H);
  }
}

function drawFlag(x,y){
  ctx.fillStyle='#d8d8d8'; ctx.fillRect(x+6,y-40,2,40);
  ctx.fillStyle='#ffd23c';
  ctx.beginPath();
  ctx.moveTo(x+8,y-40); ctx.lineTo(x+24,y-34); ctx.lineTo(x+8,y-28); ctx.closePath(); ctx.fill();
}

// 대시 해금 아이템: 작은 "코드 창" 모양 (어두운 박스 + 녹색 테두리 + 코드 라인 흉내).
//   dx,dy는 칸 좌상단 (16x16 영역). 살짝 글로우 느낌을 주려 테두리를 밝게.
// 종류별 해금 아이템 렌더 디스패치. dash는 기존 </> 코드 박스, 나머지는 색+심볼 박스.
function drawItem(kind, dx, dy){
  if(kind === 'dashUnlock'){ drawDashItem(dx, dy); return; }
  // 종류별 색 + 심볼 픽셀.
  const SPEC = {
    doubleJumpUnlock: { col:'#7fd0ff', sym:'jump' },   // 하늘색, 위로 두 화살표
    airDashUnlock:    { col:'#ff9d4d', sym:'dash' },    // 주황, 오른쪽 이중 화살표
    wallSlideUnlock:  { col:'#c89bff', sym:'wall' },    // 보라, 벽+아래 화살표
  };
  const s = SPEC[kind] || { col:'#3cf06a', sym:'dash' };
  // 외곽 글로우
  ctx.fillStyle = hexA(s.col, 0.15);
  ctx.fillRect(dx-1, dy-1, TILE+2, TILE+2);
  // 창 배경 + 테두리
  ctx.fillStyle = '#0c1a2e'; ctx.fillRect(dx+1, dy+1, TILE-2, TILE-2);
  ctx.strokeStyle = s.col; ctx.lineWidth = 1; ctx.strokeRect(dx+1.5, dy+1.5, TILE-3, TILE-3);
  // 심볼 (12x12 영역 dx+2..dx+14에 1px 픽셀)
  ctx.fillStyle = s.col;
  const P=(x,y)=>ctx.fillRect(dx+2+x, dy+2+y, 1, 1);
  if(s.sym === 'jump'){
    // 위로 향한 이중 쉐브론(더블점프)
    [[6,2],[5,3],[4,4],[6,2],[7,3],[8,4]].forEach(([x,y])=>P(x,y));   // 위 ^
    [[6,6],[5,7],[4,8],[6,6],[7,7],[8,8]].forEach(([x,y])=>P(x,y));   // 아래 ^
  } else if(s.sym === 'dash'){
    // 오른쪽 이중 화살표(에어대시)
    [[3,3],[4,4],[5,5],[4,6],[3,7]].forEach(([x,y])=>P(x,y));
    [[7,3],[8,4],[9,5],[8,6],[7,7]].forEach(([x,y])=>P(x,y));
  } else if(s.sym === 'wall'){
    // 왼쪽 벽 막대 + 아래로 미끄러지는 점들(월슬라이드)
    [[2,2],[2,3],[2,4],[2,5],[2,6],[2,7],[2,8]].forEach(([x,y])=>P(x,y)); // 벽
    [[6,3],[6,5],[6,7],[7,4],[7,6],[7,8]].forEach(([x,y])=>P(x,y));       // 흘러내림
  }
}

// hex 색 + 알파 → rgba 문자열 (글로우용).
function hexA(hex, a){
  const n = parseInt(hex.slice(1),16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}

function drawDashItem(dx, dy){
  // 외곽 글로우 (반투명 녹색 사각)
  ctx.fillStyle='rgba(60,240,106,0.15)';
  ctx.fillRect(dx-1, dy-1, TILE+2, TILE+2);
  // 창 배경
  ctx.fillStyle='#0c1a2e';
  ctx.fillRect(dx+1, dy+1, TILE-2, TILE-2);
  // 녹색 테두리 (각진)
  ctx.strokeStyle='#3cf06a'; ctx.lineWidth=1;
  ctx.strokeRect(dx+1.5, dy+1.5, TILE-3, TILE-3);
  // </> 픽셀 기호 (연출 아이콘과 동일 모양, 16px 타일에 맞게 축소).
  //   타일 안 12x12 영역(dx+2~dx+14)에 1px 픽셀로 그림.
  ctx.fillStyle='#3cf06a';
  const P=(x,y)=>ctx.fillRect(dx+2+x, dy+2+y, 1, 1);
  // < 왼쪽 꺾쇠
  [[3,3],[2,4],[1,5],[2,6],[3,7]].forEach(([x,y])=>P(x,y));
  // / 슬래시 (가운데, 연속)
  [[8,2],[7,4],[6,5],[5,7],[4,9]].forEach(([x,y])=>P(x,y));
  // > 오른쪽 꺾쇠
  [[8,3],[9,4],[10,5],[9,6],[8,7]].forEach(([x,y])=>P(x,y));
}

// 가시 그리기. 천장 가시(맵 위쪽)는 아래로 뾰족하게 위아래 뒤집어 그림.
//   row가 화면 위쪽(작은 값)이면 천장 가시로 판단.
// 가시 방향 판정: 위치(row)가 아니라 "어느 쪽에 붙어있는지"로 결정.
//   가시는 항상 벽에 붙는다 — 천장 가시는 위 칸이 벽, 바닥 가시는 아래 칸이 벽.
//   위/아래 둘 다 벽이거나 둘 다 빈 경우: 위에 벽 우선(천장) → 그것도 아니면 바닥 기본.
//   이러면 row 위치와 무관하게 정확. 세로 통로·좌우 분기·떠있는 발판 모두 안전.
function spikeIsCeiling(col, row){
  const wallAbove = solid(tileAt(col, row-1));
  const wallBelow = solid(tileAt(col, row+1));
  if(wallAbove && !wallBelow) return true;   // 위에만 벽 → 천장 가시
  if(wallBelow && !wallAbove) return false;  // 아래에만 벽 → 바닥 가시
  if(wallAbove && wallBelow)  return true;    // 둘 다 벽(좁은 틈): 천장 우선
  return false;                               // 둘 다 없음(떠있음): 바닥 기본
}

function drawSpike(dx, dy, col, row){
  ctx.save();
  if(spikeIsCeiling(col, row)){
    // 천장 가시: 위아래 뒤집기 (뾰족한 끝이 아래로)
    ctx.translate(dx+TILE/2, dy+TILE/2);
    ctx.scale(1,-1);
    ctx.drawImage(img.tileset, SRC.spike.x,SRC.spike.y,TILE,TILE, -TILE/2,-TILE/2,TILE,TILE);
  } else {
    // 바닥 가시: 그대로 (뾰족한 끝이 위로)
    ctx.drawImage(img.tileset, SRC.spike.x,SRC.spike.y,TILE,TILE, dx,dy,TILE,TILE);
  }
  ctx.restore();
}

// ---- 동적 위험/장치 렌더 ----
//   발판: Platform.png 6프레임 "등장" 애니. 고정=완성형(마지막 프레임), 점멸=등장 연출.
//   폭 widthTiles만큼 같은 프레임을 나란히 그린다. 발판 윗면(h.y)에 맞춤.
function drawHazards(){
  const FW=PLATFORM_SRC.frameW, FH=PLATFORM_SRC.frameH;
  for(const h of game.hazards){
    if(h.type === 'platform'){
      // 점멸로 완전히 꺼졌으면 안 그림. (등장/유지 중이면 animFrame으로 그림)
      if(h.blinks && !h.on) continue;
      const n = Math.max(1, Math.round(h.w / FW));   // 폭 칸수
      const dy = Math.round(h.y);
      const sx = (h.animFrame||0) * FW;
      for(let i=0;i<n;i++){
        const dx = Math.round(h.x + i*FW);
        ctx.drawImage(img.platform, sx, 0, FW, FH, dx, dy, FW, FH);
      }
    }
    else if(h.type === 'acid_drip'){
      // 낙하/터짐: 스프라이트 "충돌 중심"(프레임의 ACID_IMPACT_FRAC 지점)이 실제 위치에 오도록 그린다.
      //   - 낙하 중: 충돌 중심이 dropY(방울 현재 높이)에 오게. → 방울이 공중을 내려오는 것처럼.
      //   - 터짐:   충돌 중심이 "착지 지점 아래 바닥 표면"에 오게. → 바닥에서 터지는 것처럼.
      if(h.phaseName === 'idle') continue;
      const sheet = (h.sprite===3) ? img.acid3 : img.acid1;
      const FW=ACID_SRC.frameW, FH=ACID_SRC.frameH;
      const dx = h.col*TILE;
      // 충돌 중심이 와야 할 y
      let impactY;
      if(h.phaseName === 'splash'){
        // 착지 칸(splashRow) 아래의 바닥 표면. 없으면 착지 칸 바닥(=다음 칸 윗면)으로 폴백.
        const surf = floorSurfaceBelow(h.col, h.splashRow);
        impactY = (surf != null) ? surf : (h.splashRow+1)*TILE;
      } else {
        // 낙하 중: 방울 충돌 중심을 dropY에 맞춤(기존 dropY는 방울 윗면이었음 → 중심 기준으로 통일).
        impactY = h.dropY + ACID_IMPACT_FRAC*TILE;
      }
      const dy = Math.round(impactY - ACID_IMPACT_FRAC*TILE);  // 프레임 top = 충돌중심 - 비율
      ctx.drawImage(sheet, h.frame*FW, 0, FW, FH, dx, dy, TILE, TILE);
    }
    else if(h.type === 'acid_burst'){
      // 제자리 폭발. 충돌 중심을 "이 칸 아래 바닥 표면"에 맞춰 바닥에서 터지는 것처럼.
      const FW=ACID_SRC.frameW, FH=ACID_SRC.frameH;
      const dx = h.col*TILE;
      const surf = floorSurfaceBelow(h.col, h.row);
      const impactY = (surf != null) ? surf : (h.row+1)*TILE;   // 바닥 없으면 칸 바닥으로 폴백
      const dy = Math.round(impactY - ACID_IMPACT_FRAC*TILE);
      ctx.save();
      ctx.globalAlpha = h.active ? 1.0 : 0.5;
      ctx.drawImage(img.acid2, h.frame*FW, 0, FW, FH, dx, dy, TILE, TILE);
      ctx.restore();
    }
    else if(h.type === 'spike'){
      // 1칸(32x32). 스프라이트 원본은 위로 솟는 모양(받침대가 아래). dir로 회전해 4방향 부착.
      //   up    : 그대로
      //   down  : 상하 반전(천장에서 아래로)
      //   left  : 시계 반대로 90° (왼쪽 벽에서 오른쪽으로 솟음 → 끝이 +x)  실제 표현은 끝이 왼쪽
      //   right : 시계로 90°
      //   off(f0) 프레임도 받침대로 보이므로 항상 그린다(사라지지 않고 바닥 받침만 남음).
      const FW=SPIKE_SRC.frameW, FH=SPIKE_SRC.frameH;
      const dx = h.col*TILE, dy = h.row*TILE;
      const sx = h.frame*FW;
      ctx.save();
      ctx.translate(dx+TILE/2, dy+TILE/2);   // 칸 중심으로 이동 후 회전
      if(h.dir === 'down')       ctx.rotate(Math.PI);
      else if(h.dir === 'left')  ctx.rotate(-Math.PI/2);
      else if(h.dir === 'right') ctx.rotate(Math.PI/2);
      // up이면 회전 없음
      ctx.drawImage(img.spikes, sx, 0, FW, FH, -TILE/2, -TILE/2, TILE, TILE);
      ctx.restore();
    }
  }
}

// 캐릭터 애니메이션 (Platform Boy, GIF 원본 60x60). 발이 캔버스 하단에서 20px 위에 정렬됨.
const ANIM_FRAMES = { idle:4, walk:8, jump:7, dash:4, death:8 };
const CHAR_SRC = 60;                    // 시트의 프레임 원본 크기 (GIF 60x60)
const CHAR_SCALE = 2;                   // 2배 확대 그리기
const CHAR_FW = CHAR_SRC * CHAR_SCALE;  // 그리기 폭 120
const CHAR_FH = CHAR_SRC * CHAR_SCALE;  // 그리기 높이 120
const CHAR_FOOT_MARGIN = 20 * CHAR_SCALE; // 캔버스 하단 발 여백(20px) × 2배 = 40. 발선을 충돌박스 바닥에 맞춤.

function drawPlayer(){
  // 40x40 프레임 (Platform Boy). anim별로 시트/프레임수 선택.
  const anim = ANIM_FRAMES[player.anim] ? player.anim : 'idle';
  const sheet = img[anim] || img.idle;
  const frames = ANIM_FRAMES[anim] || 4;

  let fr;
  if(anim==='jump'){
    // 점프 7프레임을 수직속도(vy)에 매핑. 공중 비행 구간은 #1~#4 사용.
    //   #1 도약, #2 상승, #3 정점, #4 하강. (vy<0 상승, vy>0 하강)
    if(player.vy < -5)      fr = 1;   // 강한 상승 (도약 직후)
    else if(player.vy < -1) fr = 2;   // 상승
    else if(player.vy < 2)  fr = 3;   // 정점 부근
    else                    fr = 4;   // 하강
  } else if(anim==='death'){
    // 사망은 한 번 재생 후 마지막 프레임 유지
    fr = Math.min(frames-1, player.frame);
  } else {
    fr = player.frame % frames;
  }

  // foot-aligned: 캔버스 발선(하단에서 CHAR_FOOT_MARGIN 위)을 충돌박스 바닥에 맞춤. 가로 중앙 정렬.
  //   60x60 원본은 발이 하단 20px 위 → 2배 시 40px. 그만큼 더 내려 그려 발이 바닥에 닿게.
  const dx = Math.round(player.x + player.w/2 - CHAR_FW/2);
  const dy = Math.round(player.y + player.h - CHAR_FH + CHAR_FOOT_MARGIN);

  ctx.save();
  if(anim==='death'){ ctx.globalAlpha=0.9; }
  // 소스는 48px 프레임에서 읽고, 96px로 확대하여 그린다 (2배 픽셀 확대).
  if(player.facing<0){
    ctx.translate(dx+CHAR_FW, dy); ctx.scale(-1,1);
    ctx.drawImage(sheet, fr*CHAR_SRC,0,CHAR_SRC,CHAR_SRC, 0,0,CHAR_FW,CHAR_FH);
  } else {
    ctx.drawImage(sheet, fr*CHAR_SRC,0,CHAR_SRC,CHAR_SRC, dx,dy,CHAR_FW,CHAR_FH);
  }
  ctx.globalAlpha=1;
  ctx.restore();
}

/* ---- 애니메이션 tick ---- */
export function animate(){
  player.frameT++;
  // anim별 프레임 진행 속도 (작을수록 빠름). jump는 vy로 프레임 결정하므로 여기선 무관.
  let speed = (player.anim==='walk')?4 : (player.anim==='dash')?4 : (player.anim==='death')?6 : 8;
  if(player.frameT>=speed){
    player.frameT=0;
    // 사망 애니는 마지막 프레임에서 멈춤 (계속 증가 방지)
    if(player.anim==='death'){
      if(player.frame < ANIM_FRAMES.death-1) player.frame++;
    } else {
      player.frame++;
    }
  }
  for(let i=dustParticles.length-1;i>=0;i--){
    const d=dustParticles[i]; d.f++; d.life--;
    if(d.life<=0) dustParticles.splice(i,1);
  }
  const maxCam = Math.max(0, COLS*TILE - W);
  if(player.phase==='intro'){
    // 카메라가 시작점을 화면 중앙쯤에 두도록. 단 맵 범위(0 이상)로 클램프.
    //   음수면 맵 왼쪽 밖 빈 공간이 보이므로 0 미만으로 내려가지 않는다.
    let t = (START_COL*TILE) - W/2 + 40;
    if(t < 0) t = 0;
    if(t > maxCam) t = maxCam;
    camera.x += (t - camera.x)*0.12;
  } else if(player.phase==='outro'){
    // 퇴장 방향으로 카메라 팬: 오른쪽 퇴장이면 맵 오른쪽 끝, 왼쪽 퇴장이면 맵 왼쪽 끝(0).
    //   → 플레이어가 골 지나 화면 밖으로 나가는 게 보임.
    const t = (player.outroDir === -1) ? 0 : maxCam;
    camera.x += (t - camera.x)*0.1;
  } else {
    // play: 플레이어 따라가되 맵 범위로 클램프
    const target = player.x - W/2 + 40;
    camera.x += (target-camera.x)*0.1;
    if(camera.x<0) camera.x=0;
    if(camera.x>maxCam) camera.x=maxCam;
  }
}
