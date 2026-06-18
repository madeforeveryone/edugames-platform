// ============================================================
//  index.js — 스테이지 레지스트리 (LDtk import로 자동 생성됨)
//  수동 편집 금지: tools/ldtk-import.js 가 덮어씀.
// ============================================================

import { STAGE as stage00 } from './stage_00.js';
import { STAGE as stage01 } from './stage_01.js';
import { STAGE as stage02 } from './stage_02.js';
import { STAGE as stage03 } from './stage_03.js';
import { STAGE as stage04 } from './stage_04.js';

export const STAGES = [ stage00, stage01, stage02, stage03, stage04 ];

export function getStage(i){
  return STAGES[Math.max(0, Math.min(i, STAGES.length-1))];
}
