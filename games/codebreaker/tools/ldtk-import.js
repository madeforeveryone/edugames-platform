#!/usr/bin/env node
// ============================================================
//  ldtk-import.js — LDtk 프로젝트(.ldtk)를 stage config(JS)로 변환
//
//  사용법:
//    node tools/ldtk-import.js levels/codebreaker.ldtk
//
//  동작:
//    LDtk의 각 레벨을 읽어 stages/stage_XX.js 를 생성한다.
//    - IntGrid 레이어 'Collision' → 우리 grid 배열 (값 매핑)
//    - 엔티티 'Enter' / 'Exit' (구 PlayerStart / Goal — 구이름도 호환) → 입구·출구
//        Enter는 한 방에 여러 개 가능. 커스텀 필드(선택): id(int 입구 번호), enter('up'|'down'|'left'|'right' 들어오는 방향).
//        Exit 커스텀 필드(선택): exit('up'|'down'|'left'|'right' 나가는 방향), target(int 목적지 방), targetEntry(int 목적지 방의 Enter id).
//        → Exit.target+targetEntry로 "어느 방의 어느 입구로" 정확히 연결. 미설정 시 선형 다음 방 + id 0 입구.
//    - 레벨 커스텀 필드(hack 설정 등)도 읽어 config에 반영
//
//  LDtk 세팅 규약 (이대로 에디터에서 설정할 것):
//    IntGrid 레이어 이름: "Collision", 그리드 크기 16px
//      값 1 = 잔디 바닥(윗줄)   → grid 1
//      값 2 = 흙(속)            → grid 2
//      값 3 = 천장 가시          → grid 9
//    엔티티 레이어에 'Enter'와 'Exit' 엔티티 배치 (구 'PlayerStart'/'Goal'도 호환)
//    레벨 커스텀 필드(선택): varName, hackStart, hackDir, theme
//
//  위험/장치 엔티티 (엔티티 레이어에 배치, 칸 위치 = 픽셀좌표/그리드크기):
//    'Platform'  (이동/고정/점멸 발판) — 커스텀 필드(모두 선택, 미설정 시 엔진 기본값):
//        axis(enum 'x'|'y'), range(int 칸수, 0=고정), speed(float px/frame),
//        pauseFrames(int), widthTiles(int),
//        onSeconds(float, 0/미설정=점멸안함), offSeconds(float, 사라진시간 초), appearDelay(float, 등장지연 초=순차)
//    'AcidDrip'  (낙하형 산성액, 꼬리 O) — 커스텀 필드(모두 선택):
//        sprite(int 1|3), intervalSeconds(float 한 사이클 초), fallSeconds(float 낙하 소요 초),
//        splashSeconds(float 터짐 소요 초, 기본 0.4), appearDelay(float 등장지연 초=순차), reach(int 아래로 뻗는 칸수)
//    'AcidBurst' (제자리 폭발 산성액, 꼬리 X) — 커스텀 필드(모두 선택):
//        intervalSeconds(float 한 사이클 초), activeSeconds(float 위험 지속 초), appearDelay(float 등장지연 초)
//    'Spike'     (통합 가시 — 정적/점멸 + 4방향) — 커스텀 필드(모두 선택):
//        static(bool, true=항상 위험), dir(String 'up'|'down'|'left'|'right', 미설정=up),
//        onSeconds(float 위험 유지 초), offSeconds(float 안전 유지 초), appearDelay(float 등장지연 초=위상)
//        ⚠️ dir은 LDtk enum이 아니라 String (1.5.3 enum 크래시 회피).
//    → 변환기가 각 엔티티를 stage.level.hazards 배열로 뽑아낸다.
//       data/hazards.js의 hazardsForStage()가 이 배열을 우선 사용(없으면 손으로 쓴 폴백).
//    필드 의미·기본값·권장치는 data/hazards.js 상단 주석 참고.
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ABILITIES } from '../src/abilities.js';

// ── IntGrid 값 → 우리 grid 값 매핑 ──
// IntGrid 값 → 충돌 grid 값 매핑.
//   렌더는 autoLayerTiles(tiles)가 따로 담당하므로, grid는 "충돌 전용"이다.
//   1 OuterWall  : 테두리 장식일 뿐 → 충돌 없음(0). (땅 한 칸 밖에 둘러 그래픽용)
//   2 InsideWall : 실제 밟는 땅    → solid(2)
//   3 Spike      : 가시            → 9 (닿으면 죽음)
const INTGRID_MAP = { 0:0, 1:0, 2:2, 3:9 };

function die(msg){ console.error('✗ '+msg); process.exit(1); }

const ldtkPath = process.argv[2];
if(!ldtkPath) die('사용법: node tools/ldtk-import.js <파일.ldtk>');
if(!fs.existsSync(ldtkPath)) die('파일 없음: '+ldtkPath);

let proj;
try { proj = JSON.parse(fs.readFileSync(ldtkPath,'utf8')); }
catch(e){ die('JSON 파싱 실패: '+e.message); }

const levels = proj.levels || [];
if(!levels.length) die('레벨이 없음');

// 출력은 항상 프로젝트의 stages/ (스크립트가 tools/ 안에 있으므로 ../stages)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'stages');

// 레벨 커스텀 필드 읽기 헬퍼
function field(level, name, fallback){
  const f = (level.fieldInstances||[]).find(x=>x.__identifier===name);
  return (f && f.__value!=null) ? f.__value : fallback;
}

// 엔티티 커스텀 필드 읽기 헬퍼 (엔티티도 fieldInstances를 가짐)
function efield(ent, name, fallback){
  const f = (ent.fieldInstances||[]).find(x=>x.__identifier===name);
  return (f && f.__value!=null) ? f.__value : fallback;
}

let generated = [];

// 기존 stage_*.js 청소 (이전 변환의 고아 파일 제거)
for(const f of fs.readdirSync(outDir)){
  if(/^stage_\d+\.js$/.test(f)){
    fs.unlinkSync(path.join(outDir, f));
  }
}

levels.forEach((level, idx)=>{
  // 레이어 인스턴스 찾기
  const layers = level.layerInstances || [];
  const intLayer = layers.find(l=>l.__type==='IntGrid' && l.__identifier==='Collision')
                || layers.find(l=>l.__type==='IntGrid');  // 이름 못 찾으면 첫 IntGrid
  if(!intLayer) die(`레벨 "${level.identifier}"에 IntGrid 레이어가 없음`);

  const cWid = intLayer.__cWid;
  const cHei = intLayer.__cHei;
  const csv = intLayer.intGridCsv;

  // 1D CSV → 2D grid (값 매핑) — 충돌 판정용
  const grid = [];
  for(let r=0;r<cHei;r++){
    const row=[];
    for(let c=0;c<cWid;c++){
      const v = csv[r*cWid + c] || 0;
      row.push(INTGRID_MAP[v] !== undefined ? INTGRID_MAP[v] : 0);
    }
    grid.push(row);
  }

  // Auto-layer 타일 추출 (렌더용) — LDtk가 규칙으로 자동 배치한 타일들.
  //   autoLayerTiles: IntGrid+규칙 레이어 / gridTiles: 순수 타일 레이어
  //   둘 다 같은 형식: {px:[x,y], src:[x,y], f:flip}
  // grid 셀 단위로 [{src:[x,y], f}] 묶음으로 변환 (한 칸에 여러 타일 가능).
  //   px 좌표 → 칸 좌표는 그 레이어의 gridSize로 나눈다 (16px/32px 모두 대응).
  const tiles = {};  // "col,row" → [{src:[x,y], f}]
  const collectTiles = (arr, gs)=>{
    const g = gs || 16;
    for(const t of (arr||[])){
      const col = Math.floor(t.px[0]/g);
      const row = Math.floor(t.px[1]/g);
      const key = col+','+row;
      (tiles[key] = tiles[key] || []).push({ src:t.src, f:t.f||0 });
    }
  };
  collectTiles(intLayer.autoLayerTiles, intLayer.__gridSize);
  collectTiles(intLayer.gridTiles, intLayer.__gridSize);
  // 별도 Tiles/AutoLayer 레이어가 있으면 그것도 수집 (foreground 등)
  for(const l of layers){
    if(l===intLayer) continue;
    if(l.__type==='Tiles' || l.__type==='AutoLayer'){
      collectTiles(l.autoLayerTiles, l.__gridSize);
      collectTiles(l.gridTiles, l.__gridSize);
    }
  }
  const hasTiles = Object.keys(tiles).length>0;

  // 엔티티: Enter / Exit  (구 PlayerStart / Goal — Enter/Exit 연결 모델로 개명)
  //   Entities 레이어의 gridSize가 IntGrid(32)와 다를 수 있으므로(예: 16),
  //   __grid 대신 px 픽셀좌표를 IntGrid의 gridSize로 나눠 칸 좌표를 구한다.
  const ig = intLayer.__gridSize || 32;
  let flagCol=cWid-4;
  let goalRow=null;                  // 스칼라 폴백용 (마지막 Exit 세로)
  const starts = [];                 // 모든 Enter [{col,row,id,enter}] — 한 방에 여러 입구 가능
  const goals = [];                  // 모든 Exit 셀 [{col,row,exit,target,targetEntry}]
  const hazards = [];                // LDtk 엔티티에서 뽑은 위험/장치 목록
  const items = [];                  // 능력 해금 아이템 [{type, col, row}]
  const entLayer = layers.find(l=>l.__type==='Entities');
  if(entLayer){
    for(const e of (entLayer.entityInstances||[])){
      const col = e.px ? Math.floor(e.px[0]/ig) : (e.__grid ? e.__grid[0] : e.__cx);
      const row = e.px ? Math.floor(e.px[1]/ig) : (e.__grid ? e.__grid[1] : e.__cy);
      if(e.__identifier==='Enter' || e.__identifier==='PlayerStart'){  // PlayerStart는 구버전 호환
        const s = { col, row };
        const id = efield(e,'id',null);       if(id!=null) s.id = id;        // 입구 번호 (Exit.targetEntry가 가리킴)
        const en = efield(e,'enter',null);    if(en!=null) s.enter = en;     // 'up'|'down'|'left'|'right' 들어오는 방향(선택)
        starts.push(s);
      }
      else if(e.__identifier==='Exit' || e.__identifier==='Goal')  {   // Goal은 구버전 호환
        const goalCell = { col, row };
        const exit = efield(e,'exit',null);          if(exit!=null) goalCell.exit = exit;
        const target = efield(e,'target',null);      if(target!=null) goalCell.target = target;
        const tEntry = efield(e,'targetEntry',null); if(tEntry!=null) goalCell.targetEntry = tEntry;  // 목적지 방의 Enter id
        goals.push(goalCell);
        flagCol = col; goalRow = row;    // 스칼라 폴백(마지막 Exit) — 구버전 호환용
      }
      // ── 위험/장치 엔티티 → data/hazards.js 스키마로 변환 ──
      //   각 엔티티의 커스텀 필드를 읽어 인스턴스 데이터를 만든다. 미설정 필드는 런타임 기본값에 맡김
      //   (여기서 굳이 기본값을 넣지 않고 undefined면 빼서, 엔진 buildHazards의 기본값이 단일 출처가 되게).
      else if(e.__identifier==='Platform'){
        const o = { type:'platform', col, row };
        const axis   = efield(e,'axis',null);          if(axis!=null) o.axis = axis;
        const range  = efield(e,'range',null);         if(range!=null) o.range = range;   // 0=고정 허용
        const speed  = efield(e,'speed',null);         if(speed!=null) o.speed = speed;
        const pause  = efield(e,'pauseFrames',null);   if(pause!=null) o.pauseFrames = pause;
        const wt     = efield(e,'widthTiles',null);    if(wt!=null) o.widthTiles = wt;
        const onS    = efield(e,'onSeconds',null);     if(onS!=null) o.onSeconds = onS;
        const offS   = efield(e,'offSeconds',null);    if(offS!=null) o.offSeconds = offS;
        const dly    = efield(e,'appearDelay',null);   if(dly!=null) o.appearDelay = dly;
        hazards.push(o);
      }
      else if(e.__identifier==='AcidDrip'){
        const o = { type:'acid_drip', col, row };
        const sprite = efield(e,'sprite',null);         if(sprite!=null) o.sprite = sprite;
        const itv    = efield(e,'intervalSeconds',null);if(itv!=null) o.intervalSeconds = itv;
        const fall   = efield(e,'fallSeconds',null);    if(fall!=null) o.fallSeconds = fall;
        const splash = efield(e,'splashSeconds',null);  if(splash!=null) o.splashSeconds = splash;
        const dly    = efield(e,'appearDelay',null);    if(dly!=null) o.appearDelay = dly;
        const reach  = efield(e,'reach',null);          if(reach!=null) o.reach = reach;
        hazards.push(o);
      }
      else if(e.__identifier==='AcidBurst'){
        const o = { type:'acid_burst', col, row };
        const itv    = efield(e,'intervalSeconds',null);if(itv!=null) o.intervalSeconds = itv;
        const act    = efield(e,'activeSeconds',null);  if(act!=null) o.activeSeconds = act;
        const dly    = efield(e,'appearDelay',null);    if(dly!=null) o.appearDelay = dly;
        hazards.push(o);
      }
      else if(e.__identifier==='Spike'){
        // 통합 가시: static(bool)=항상 위험, dir(String up|down|left|right)=부착 방향,
        //   onSeconds/offSeconds=위험/안전 유지 초, appearDelay=등장지연 초(점멸일 때 위상).
        //   ⚠️ dir은 LDtk enum이 아니라 String (1.5.3 enum 크래시 회피).
        const o = { type:'spike', col, row };
        const st  = efield(e,'static',null);      if(st!=null)  o.static = !!st;
        const dir = efield(e,'dir',null);
        if(dir!=null && dir!=='') o.dir = String(dir);
        const onS = efield(e,'onSeconds',null);   if(onS!=null) o.onSeconds = onS;
        const offS= efield(e,'offSeconds',null);  if(offS!=null)o.offSeconds = offS;
        const dly = efield(e,'appearDelay',null); if(dly!=null) o.appearDelay = dly;
        hazards.push(o);
      }
      else if(e.__identifier==='Item'){
        // 능력 해금 아이템. kind(String)로 종류 구분. 미설정/빈값이면 dashUnlock으로 폴백.
        const kind = efield(e,'kind',null);
        const type = (kind!=null && kind!=='') ? String(kind) : 'dashUnlock';
        items.push({ type, col, row });
      }
    }
  }

  // hack 설정 (레벨 커스텀 필드 → 없으면 기본값)
  //   값 범위 가드는 hackshell.js의 하드코딩 1~99로 충분 (range 튜닝을 가르치는 게 아니라
  //   플레이하며 자연스럽게 수치를 조정하게 하는 설계 → 별도 min/max/scale 데이터 불필요).
  const hack = {
    varName: field(level,'varName','jumpPower'),
    current: field(level,'hackStart',10),
    direction: field(level,'hackDir','higher'),
    type:'int'
  };
  const theme = field(level,'theme','forest_day');

  // 타일셋 정보 (autoLayerTiles의 src 좌표가 가리키는 타일셋)
  let tilesetUid = intLayer.__tilesetDefUid;
  let tilesetRel = intLayer.__tilesetRelPath;
  // IntGrid에 타일셋이 없으면 다른 타일 레이어에서 찾기
  if(!tilesetUid){
    for(const l of layers){
      if(l.__tilesetDefUid){ tilesetUid=l.__tilesetDefUid; tilesetRel=l.__tilesetRelPath; break; }
    }
  }

  // fakeCode는 hack.varName 기반으로 표준 생성 (스테이지마다 거의 동일)
  const fakeCode = buildFakeCode(hack);

  // 스칼라 시작점(구버전 호환·기본 입구): id 0 Enter → 없으면 첫 Enter → 없으면 기본값.
  let defaultStart = starts.find(s => s.id === 0) || starts[0] || null;
  const startCol  = defaultStart ? defaultStart.col   : 2;
  const startRow  = defaultStart ? (defaultStart.row != null ? defaultStart.row : null) : null;
  const startEnter= defaultStart ? (defaultStart.enter || null) : null;

  const stageObj = {
    id: idx,
    genre:'platformer', theme,
    hack,
    level: {
      cols:cWid, rows:cHei, flagCol, startCol, startRow, goalRow, startEnter,
      starts,                        // 모든 Enter [{col,row,id,enter}] — 멀티 입구. targetEntry가 id로 선택.
      goals,                         // 모든 Exit 셀 [{col,row,exit,target,targetEntry}]. 비면 flagCol/goalRow 폴백.
      grid,                          // 충돌 판정용 (1/2/9)
      tiles: hasTiles ? tiles : null, // 렌더용 (LDtk auto-layer 결과)
      tilesetRel: tilesetRel || null, // 타일셋 이미지 경로 (참고용)
      hazards,                       // LDtk 엔티티에서 뽑은 위험/장치 (Platform/AcidDrip/AcidBurst/Spike)
      items                          // 능력 해금 아이템 [{type, col, row}]
    },
    fakeCode
  };

  const fileName = `stage_${String(idx).padStart(2,'0')}.js`;
  const js = renderStageFile(stageObj, level.identifier);
  fs.writeFileSync(path.join(outDir, fileName), js);
  generated.push(fileName);
  console.log(`✓ ${fileName}  (${cWid}×${cHei}, start@${startCol}, goal@${flagCol}, var=${hack.varName}, hazards=${hazards.length})`);
});

// 레지스트리 자동 갱신
const regImports = generated.map((f,i)=>`import { STAGE as stage${String(i).padStart(2,'0')} } from './${f}';`).join('\n');
const regArray = generated.map((_,i)=>`stage${String(i).padStart(2,'0')}`).join(', ');
const regJs = `// ============================================================
//  index.js — 스테이지 레지스트리 (LDtk import로 자동 생성됨)
//  수동 편집 금지: tools/ldtk-import.js 가 덮어씀.
// ============================================================

${regImports}

export const STAGES = [ ${regArray} ];

export function getStage(i){
  return STAGES[Math.max(0, Math.min(i, STAGES.length-1))];
}
`;
fs.writeFileSync(path.join(outDir,'index.js'), regJs);
console.log(`✓ index.js  (레지스트리 ${generated.length}개 스테이지)`);
console.log(`\n완료: ${generated.length}개 스테이지 생성됨`);

// ── 헬퍼: fakeCode 생성 (능력 레지스트리 기반) ──
//   가짜 소스의 변수 줄들을 ABILITIES.codeExpr로 만든다.
//   편집 대상(hack.varName) 줄에만 TARGET:true + 시작값, 나머지 능력은 default 표시.
//   새 능력을 추가해도 여기 분기는 늘지 않는다 (레지스트리만 보면 됨).
function buildFakeCode(hack){
  const vn = hack.varName;
  const lines = [
    {t:'// ===== PLAYER CONFIG =====', cls:['cm']},
    {t:'let runSpeed = 1.7;', cls:['kw']},
  ];
  // 편집 대상 변수를 먼저, 그 다음 나머지 능력들 — 단 jumpPower/gravity 순서 안정 유지.
  const order = Object.keys(ABILITIES);
  // 대상이 목록에 없으면(미등록 변수) 안전하게 대상만 단독 표시.
  if(!ABILITIES[vn]){
    lines.push({t:`let ${vn} = ${hack.current};`, cls:['kw'], TARGET:true});
  } else {
    for(const name of order){
      const a = ABILITIES[name];
      if(a.inFakeCode === false) continue;   // 해금형 능력(대시 등)은 자동 포함 안 함
      const val = (name===vn) ? hack.current : a.default;
      const line = { t: a.codeExpr.replace('%v', val), cls:['kw'] };
      if(name===vn) line.TARGET = true;
      lines.push(line);
    }
  }
  lines.push(
    {t:'', cls:[]},
    {t:'function update(dt) {', cls:['kw']},
    {t:'  player.vx = Input.right ? runSpeed : 0;', cls:[]},
    {t:'  player.vy += gravity / 100;', cls:[]},
    {t:'  if (Input.jump && player.grounded)', cls:['kw']},
    {t:'    player.vy = -jumpPower;', cls:[], INPUT_AFTER:true},
    {t:'}', cls:[]}
  );
  return lines;
}

// ── 헬퍼: stage 파일 텍스트 렌더 ──
function renderStageFile(stage, ldtkId){
  // grid를 읽기 좋게 한 줄씩
  const gridStr = stage.level.grid.map(row=>'      ['+row.join(',')+']').join(',\n');
  const fakeCodeStr = stage.fakeCode.map(l=>{
    const extra = (l.TARGET?', TARGET:true':'') + (l.INPUT_AFTER?', INPUT_AFTER:true':'');
    return `    {t:${JSON.stringify(l.t)}, cls:${JSON.stringify(l.cls)}${extra}}`;
  }).join(',\n');

  // tiles: "col,row":[{src:[x,y],f}] → 압축 JSON
  let tilesStr = 'null';
  if(stage.level.tiles){
    const entries = Object.entries(stage.level.tiles).map(([k,arr])=>{
      const items = arr.map(t=>`{src:[${t.src[0]},${t.src[1]}],f:${t.f}}`).join(',');
      return `      ${JSON.stringify(k)}:[${items}]`;
    }).join(',\n');
    tilesStr = `{\n${entries}\n    }`;
  }

  // hazards: 한 줄에 하나씩, 객체 리터럴로 (키 순서 안정 — 읽기 좋게).
  let hazardsStr = '[]';
  const hz = stage.level.hazards || [];
  if(hz.length){
    const lines = hz.map(h=>'      '+JSON.stringify(h)).join(',\n');
    hazardsStr = `[\n${lines}\n    ]`;
  }

  // goals: 모든 Goal 셀 (멀티 출구). 한 줄에 하나씩.
  let goalsStr = '[]';
  const gz = stage.level.goals || [];
  if(gz.length){
    const lines = gz.map(g=>'      '+JSON.stringify(g)).join(',\n');
    goalsStr = `[\n${lines}\n    ]`;
  }

  // starts: 모든 Enter [{col,row,id,enter}]. 한 줄에 하나씩.
  let startsStr = '[]';
  const sz = stage.level.starts || [];
  if(sz.length){
    const lines = sz.map(s=>'      '+JSON.stringify(s)).join(',\n');
    startsStr = `[\n${lines}\n    ]`;
  }

  // items: 능력 해금 아이템 [{type,col,row}]. 한 줄에 하나씩.
  let itemsStr = '[]';
  const iz = stage.level.items || [];
  if(iz.length){
    const lines = iz.map(it=>'      '+JSON.stringify(it)).join(',\n');
    itemsStr = `[\n${lines}\n    ]`;
  }

  return `// ============================================================
//  ${`stage_${String(stage.id).padStart(2,'0')}.js`} — LDtk에서 자동 생성 (원본: "${ldtkId}")
//  수동 편집 금지: LDtk에서 수정 후 tools/ldtk-import.js 재실행.
// ============================================================

export const STAGE = {
  id: ${stage.id},
  genre: "platformer",
  theme: ${JSON.stringify(stage.theme)},
  hack: {
    varName: ${JSON.stringify(stage.hack.varName)},
    current: ${stage.hack.current},
    type: "int",
    direction: ${JSON.stringify(stage.hack.direction)}
  },
  level: {
    cols: ${stage.level.cols},
    rows: ${stage.level.rows},
    flagCol: ${stage.level.flagCol},
    startCol: ${stage.level.startCol},
    startRow: ${stage.level.startRow},
    startEnter: ${JSON.stringify(stage.level.startEnter)},
    goalRow: ${stage.level.goalRow},
    starts: ${startsStr},
    goals: ${goalsStr},
    tilesetRel: ${JSON.stringify(stage.level.tilesetRel)},
    grid: [
${gridStr}
    ],
    tiles: ${tilesStr},
    hazards: ${hazardsStr},
    items: ${itemsStr}
  },
  fakeCode: [
${fakeCodeStr}
  ]
};
`;
}
