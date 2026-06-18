#!/usr/bin/env node
// ============================================================
//  ldtk-add-hazards.js — LDtk 프로젝트(.ldtk)에 위험/장치 엔티티 정의를 주입
//
//  사용법:
//    node tools/ldtk-add-hazards.js levels/codebreaker.ldtk
//
//  하는 일 (1회성 셋업):
//    LDtk 에디터에서 손으로 엔티티/필드를 만드는 대신, 다음 3개 엔티티 정의를
//    프로젝트 defs.entities에 추가한다(이미 있으면 건너뜀 — 안전하게 여러 번 실행 가능).
//      - Enter      : 입구       (id, enter) — 한 방에 여러 개 가능
//      - Exit       : 출구       (exit, target, targetEntry)
//      - Platform   : 이동 발판   (axis, range, speed, pauseFrames, widthTiles)
//      - AcidDrip   : 낙하 산성액 (sprite, intervalSeconds, fallSeconds, splashSeconds, appearDelay, reach)
//      - AcidBurst  : 폭발 산성액 (intervalSeconds, activeSeconds, appearDelay)
//      - Spike      : 통합 가시   (static, dir, onSeconds, offSeconds, appearDelay)
//    각 필드는 적절한 타입/기본값/표시설정으로 만든다. enum 'AcidAxis'(x/y)도 추가.
//
//  이후:
//    LDtk를 열면 엔티티 패널에 위 3개가 보이고, 칸에 찍은 뒤 우측 필드에서 값 조정.
//    배치/조정 후 tools/ldtk-import.js 를 돌리면 stage 파일의 hazards로 반영됨.
//
//  주의: 필드 "기본값"은 비워두는(null) 쪽을 택했다 — 변환기가 미설정 필드를 빼서,
//        엔진 buildHazards의 기본값이 단일 출처가 되게(데이터 중복/불일치 방지).
// ============================================================

import fs from 'fs';

function die(msg){ console.error('✗ '+msg); process.exit(1); }

const ldtkPath = process.argv[2];
if(!ldtkPath) die('사용법: node tools/ldtk-add-hazards.js <파일.ldtk>');
if(!fs.existsSync(ldtkPath)) die('파일 없음: '+ldtkPath);

let proj;
try { proj = JSON.parse(fs.readFileSync(ldtkPath,'utf8')); }
catch(e){ die('JSON 파싱 실패: '+e.message); }

proj.defs = proj.defs || {};
proj.defs.entities = proj.defs.entities || [];
proj.defs.enums = proj.defs.enums || [];
let nextUid = proj.nextUid || 1000;
const uid = ()=> nextUid++;

// ── 필드 정의 빌더 (LDtk 1.5.x 스키마) ──
function fieldBase(identifier, doc){
  return {
    identifier, doc: doc||null, uid: uid(),
    isArray:false, canBeNull:true, arrayMinLength:null, arrayMaxLength:null,
    editorDisplayMode:'NameAndValue', editorDisplayScale:1, editorDisplayPos:'Above',
    editorLinkStyle:'StraightArrow', editorDisplayColor:null, editorAlwaysShow:false,
    editorShowInWorld:true, editorCutLongValues:true, editorTextSuffix:null, editorTextPrefix:null,
    useForSmartColor:false, exportToToc:false, searchable:false,
    min:null, max:null, regex:null, acceptFileTypes:null,
    defaultOverride:null, textLanguageMode:null, symmetricalRef:false,
    autoChainRef:true, allowOutOfLevelRef:true, allowedRefs:'OnlySame',
    allowedRefsEntityUid:null, allowedRefTags:[], tilesetUid:null,
  };
}
function intField(id, doc, {min=null,max=null}={}){
  return Object.assign(fieldBase(id,doc), { __type:'Int', type:'F_Int', min, max });
}
function floatField(id, doc, {min=null,max=null}={}){
  return Object.assign(fieldBase(id,doc), { __type:'Float', type:'F_Float', min, max });
}
function stringField(id, doc){
  return Object.assign(fieldBase(id,doc), { __type:'String', type:'F_String' });
}
function boolField(id, doc){
  return Object.assign(fieldBase(id,doc), { __type:'Bool', type:'F_Bool' });
}

// (이전엔 enum 'PlatformAxis'를 만들었으나, LDtk 1.5.3에서 enum 필드 정의 직렬화가
//  까다로워 로드 크래시('F_Enum need parameters')를 유발 → axis를 문자열 'x'/'y'로 단순화.
//  변환기는 어차피 axis를 문자열로 읽으므로 동작 동일.)

// ── (enum 제거됨) axis는 문자열 필드로 처리 — LDtk 크래시 회피 ──

// ── 엔티티 정의 빌더 ──
function entityBase(identifier, color){
  return {
    identifier, uid: uid(), tags:[], exportToToc:false, allowOutOfBounds:false, doc:null,
    width:32, height:32, resizableX:false, resizableY:false,
    minWidth:null, maxWidth:null, minHeight:null, maxHeight:null, keepAspectRatio:false,
    tileOpacity:1, fillOpacity:1, lineOpacity:1, hollow:false,
    color, renderMode:'Rectangle', showName:true,
    tilesetId:null, tileRenderMode:'FitInside', tileRect:null, uiTileRect:null,
    nineSliceBorders:[], maxCount:0, limitScope:'PerLevel', limitBehavior:'MoveLastOne',
    pivotX:0, pivotY:0, fieldDefs:[],
  };
}

const toAdd = [
  {
    identifier:'Enter', color:'#4FA3E8',
    fields:[
      intField('id','입구 번호 (Exit.targetEntry가 이걸 가리킴, 미설정=0)', {min:0,max:99}),
      stringField('enter',"들어오는 방향 'up'|'down'|'left'|'right' (미설정=Enter 위치 가장자리 자동)"),
    ],
  },
  {
    identifier:'Exit', color:'#E8C547',
    fields:[
      stringField('exit',"나가는 방향 'up'|'down'|'left'|'right' (미설정=Exit 위치 자동)"),
      intField('target','목적지 방 인덱스 (미설정=선형 다음 방)', {min:0,max:99}),
      intField('targetEntry','목적지 방의 Enter id (미설정=0번 입구)', {min:0,max:99}),
    ],
  },
  {
    identifier:'Platform', color:'#5A6E8C',
    fields:[
      stringField('axis',"왕복 축 'x' 또는 'y' (미설정=x)"),
      intField('range','왕복 칸 수 (미설정=3, 0=고정 발판)', {min:0,max:20}),
      floatField('speed','px/frame (미설정=1.0, 권장 0.8~1.4)', {min:0.1,max:6}),
      intField('pauseFrames','양 끝 정지 프레임 (미설정=20)', {min:0,max:240}),
      intField('widthTiles','발판 폭 칸수 (미설정=2)', {min:1,max:12}),
      floatField('onSeconds','점멸: 켜져있는 시간(초) (0/미설정=점멸안함)', {min:0,max:30}),
      floatField('offSeconds','점멸: 사라져있는 시간(초)', {min:0,max:30}),
      floatField('appearDelay','점멸: 등장 지연(초) — 그룹별 0,1,2…로 순차', {min:0,max:30}),
    ],
  },
  {
    identifier:'AcidDrip', color:'#27AE60',
    fields:[
      intField('sprite','스프라이트 1 또는 3 (미설정=1)', {min:1,max:3}),
      floatField('intervalSeconds','한 사이클 전체 시간(초) (미설정=1.5)', {min:0.1,max:30}),
      floatField('fallSeconds','방울이 떨어지는 데 걸리는 시간(초) (미설정=0.43)', {min:0.05,max:10}),
      floatField('splashSeconds','터짐(5장)이 재생되는 시간(초) (미설정=0.4)', {min:0.05,max:10}),
      floatField('appearDelay','등장 지연(초) — 그룹별 0,1,2…로 순차', {min:0,max:30}),
      intField('reach','아래로 뻗는 칸수 (미설정=4)', {min:0,max:16}),
    ],
  },
  {
    identifier:'AcidBurst', color:'#1E8C4F',
    fields:[
      floatField('intervalSeconds','한 사이클 전체 시간(초) (미설정=1.5)', {min:0.1,max:30}),
      floatField('activeSeconds','위험한 시간 길이(초) (미설정=0.55)', {min:0.05,max:30}),
      floatField('appearDelay','등장 지연(초) — 그룹별 0,1,2…로 순차', {min:0,max:30}),
    ],
  },
  {
    identifier:'Spike', color:'#B0413E',
    fields:[
      // ⚠️ dir은 enum이 아니라 String (LDtk 1.5.3 enum 크래시 회피). axis와 동일 방식.
      boolField('static','true=항상 솟은 위험(고정). 미설정/false=주기 점멸'),
      stringField('dir',"부착 방향 'up'|'down'|'left'|'right' (미설정=up=바닥)"),
      floatField('onSeconds','점멸: 위험(솟음) 유지 시간(초) (미설정=1.5)', {min:0.1,max:30}),
      floatField('offSeconds','점멸: 안전(들어감) 유지 시간(초) (미설정=1.5)', {min:0.1,max:30}),
      floatField('appearDelay','점멸: 등장 지연(초) — 그룹별 0,1,2…로 위상 어긋내기', {min:0,max:30}),
    ],
  },
  {
    identifier:'Item', color:'#FFD23C',
    fields:[
      // 능력 해금 아이템. kind로 종류 구분 (⚠️ enum 아니라 String — 1.5.3 크래시 회피).
      //   'dashUnlock'       : 대시 해금 (풀 코드 붙여넣기 연출)
      //   'doubleJumpUnlock' : 더블점프 해금 (가벼운 연출 + CMD에 jumpCount 추가)
      //   'airDashUnlock'    : 에어대시 해금 (가벼운 연출 + CMD에 airDashCharges 추가)
      //   'wallSlideUnlock'  : 월슬라이드/월점프 해금 (가벼운 연출)
      stringField('kind',"해금 종류 'dashUnlock'|'doubleJumpUnlock'|'airDashUnlock'|'wallSlideUnlock'"),
    ],
  },
];

for(const spec of toAdd){
  const wantIds = new Set(spec.fields.map(f=>f.identifier));
  const existing = proj.defs.entities.find(e=>e.identifier===spec.identifier);
  if(existing){
    // 엔티티는 있지만 필드가 비어있거나 옛 스키마가 남아있을 수 있음.
    //   → 스펙에 없는 필드는 제거(스키마 변경 정리)하고, 빠진 필드만 추가(머지).
    //   (안전: 인스턴스 값 마이그레이션은 호출 측 책임. acid는 배치 인스턴스 0개라 안전.)
    existing.fieldDefs = existing.fieldDefs || [];
    const before = existing.fieldDefs.length;
    const removed = existing.fieldDefs.filter(f=>!wantIds.has(f.identifier)).map(f=>f.identifier);
    existing.fieldDefs = existing.fieldDefs.filter(f=>wantIds.has(f.identifier));
    const have = new Set(existing.fieldDefs.map(f=>f.identifier));
    let added = 0;
    for(const f of spec.fields){
      if(!have.has(f.identifier)){ existing.fieldDefs.push(f); added++; }
    }
    if(removed.length) console.log(`~ 엔티티 ${spec.identifier}: 옛 필드 ${removed.length}개 제거 (${removed.join(', ')})`);
    if(added>0)        console.log(`~ 엔티티 ${spec.identifier}: 빠진 필드 ${added}개 추가`);
    if(!removed.length && !added) console.log(`= 엔티티 ${spec.identifier}: 필드 이미 완비 — 건너뜀`);
    continue;
  }
  const ent = entityBase(spec.identifier, spec.color);
  ent.fieldDefs = spec.fields;
  proj.defs.entities.push(ent);
  console.log(`+ 엔티티 ${spec.identifier} (필드 ${spec.fields.length}개)`);
}

proj.nextUid = nextUid;

// 백업 후 저장
const backup = ldtkPath + '.bak';
fs.copyFileSync(ldtkPath, backup);
fs.writeFileSync(ldtkPath, JSON.stringify(proj, null, 1));
console.log(`\n완료. 백업: ${backup}`);
console.log('이제 LDtk에서 엔티티를 배치하고 tools/ldtk-import.js 를 실행하세요.');
