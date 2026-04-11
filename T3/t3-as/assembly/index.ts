// ============================================================
// Hanamikoji AI — Deep Search Edition v3.0 (Mind-Reader & Endgame)
// 核心：原版保守推断 + 己方弃牌绝对剔除 + 数学将死视野 + 极速哈希
// 接口：hanamikoji_action_raw（完全不变）
// ============================================================

const SCORES: i32[] = [2, 2, 2, 3, 3, 4, 5];
const INF: i32 = 200000000;
const NEG_INF: i32 = -200000000;

// ── 极限时间与性能管理 ──────────────────────────────────────────
let gStartTime: f64 = 0;
let gTimeoutFlag: boolean = false;
let gNodes: i32 = 0;
const TIME_LIMIT_MS: f64 = 1920; // 预留 80ms 应对 JavaScript 引擎波动

function checkTimeout(): boolean {
  if (gTimeoutFlag) return true;
  if ((gNodes & 511) === 0) { // 每 512 个节点测速一次
    if (Date.now() - gStartTime > TIME_LIMIT_MS) {
      gTimeoutFlag = true;
      return true;
    }
  }
  gNodes++;
  return false;
}

// ── 极速置换表 (Transposition Table) ────────────────────────────
const FLAG_EXACT = 0;
const FLAG_ALPHA = 1;
const FLAG_BETA = 2;

class TTEntry {
  constructor(public depth: i32, public score: i32, public flag: i32) {}
}

let transpositionTable = new Map<string, TTEntry>();

// V8 极限优化：使用字符编码代替字符串拼接，大幅降低 GC 压力
function getStateHash(sA: Int32Array, oA: Int32Array, mH: Int32Array, oH: Int32Array, mU: Uint8Array, oU: Uint8Array, toMove: i32): string {
  let h = "";
  for(let i = 0; i < 7; i++) {
    h += String.fromCharCode(65 + sA[i], 65 + oA[i], 65 + mH[i], 65 + oH[i]);
  }
  for(let i = 1; i <= 4; i++) {
    h += String.fromCharCode(65 + mU[i], 65 + oU[i]);
  }
  h += toMove.toString();
  return h;
}

// ── 基础工具函数 ─────────────────────────────────────────────
function isCardChar(ch: string): boolean { return ch.length > 0 && ch.charCodeAt(0) >= 65 && ch.charCodeAt(0) <= 71; }
function charToIndex(ch: string): i32 { return !isCardChar(ch) ? -1 : ch.charCodeAt(0) - 65; }
function idxToChar(idx: i32): string { return (idx < 0 || idx >= 7) ? "" : String.fromCharCode(65 + idx); }
function splitHistoryStr(history: string): Array<string> { return history.length == 0 ? [] : history.split(" "); }

function addLetters(target: Int32Array, letters: string): void {
  for (let i = 0; i < letters.length; i++) {
    const c = letters.charAt(i);
    if (c != "X") { const idx = charToIndex(c); if (idx >= 0) target[idx] += 1; }
  }
}
function addArr(target: Int32Array, src: Int32Array): void { for (let i = 0; i < 7; i++) target[i] += src[i]; }
function subArr(a: Int32Array, b: Int32Array): Int32Array { const o = new Int32Array(7); for (let i = 0; i < 7; i++) o[i] = a[i] - b[i]; return o; }
function cloneArr(src: Int32Array): Int32Array { const o = new Int32Array(7); for (let i = 0; i < 7; i++) o[i] = src[i]; return o; }
function cloneUsed(src: Uint8Array): Uint8Array { const o = new Uint8Array(5); for (let i = 0; i < 5; i++) o[i] = src[i]; return o; }
function arrLen(a: Int32Array): i32 { let s = 0; for (let i = 0; i < 7; i++) s += a[i]; return s; }
function arrStr(a: Int32Array): string { let out = ""; for (let i = 0; i < 7; i++) for (let k = 0; k < a[i]; k++) out += idxToChar(i); return out; }
function strToArr(s: string): Int32Array { const o = new Int32Array(7); addLetters(o, s); return o; }
function sortedStr(s: string): string { return arrStr(strToArr(s)); }
function sameMultiset(a: string, b: string): boolean { return sortedStr(a) == sortedStr(b); }
function bodyInCards(cards: string, body: string): boolean {
  const cnt = strToArr(cards);
  for (let i = 0; i < body.length; i++) {
    const idx = charToIndex(body.charAt(i));
    if (idx < 0) return false;
    cnt[idx] -= 1;
    if (cnt[idx] < 0) return false;
  }
  return true;
}

// ── 历史解析 (加入记忆提取：我方弃牌记录) ────────────────────────
function isActionToken(token: string): boolean { return token.length > 0 && token.charCodeAt(0) >= 49 && token.charCodeAt(0) <= 52; }
function actionKind(token: string): i32 { return !isActionToken(token) ? 0 : token.charCodeAt(0) - 48; }
function normalizeChoice(s: string): string {
  let body = s.startsWith("-") ? s.substring(1) : s;
  if (body.length == 0 || body.length > 2) return "";
  for (let i = 0; i < body.length; i++) if (!isCardChar(body.charAt(i))) return "";
  return sortedStr(body);
}

class ParsedState {
  selfArea: Int32Array = new Int32Array(7); oppArea: Int32Array = new Int32Array(7);
  myUsed: Uint8Array = new Uint8Array(5); oppUsed: Uint8Array = new Uint8Array(5);
  myAct1: Int32Array = new Int32Array(7); // 记录我藏的牌
  myAct2: Int32Array = new Int32Array(7); // 记录我丢弃的牌 (极其关键)
  ownActions: i32 = 0; ownConsumed: i32 = 0;
  pending: boolean = false; pendingKind: i32 = 0; pendingBody: string = "";
  actorToMove: i32 = 0; responder: i32 = -1;
}

function parseHistory(history: Array<string>, selfIsFirst: boolean): ParsedState {
  const st = new ParsedState();
  const selfPlayer = selfIsFirst ? 0 : 1;
  let currentActor = 0;

  for (let i = 0; i < history.length; i++) {
    const token = history[i];
    if (!isActionToken(token)) continue;

    const kind = actionKind(token);
    const dash = token.indexOf("-");
    const body = dash >= 0 ? token.substring(1, dash) : token.substring(1);
    const choiceStr = dash >= 0 ? normalizeChoice(token.substring(dash + 1)) : "";
    const actorSelf = currentActor == selfPlayer;

    if (actorSelf) { st.myUsed[kind] = 1; st.ownActions++; st.ownConsumed += kind; }
    else { st.oppUsed[kind] = 1; }

    if (kind <= 2 && dash < 0) {
      if (kind == 1 && body.indexOf("X") < 0) {
        if (actorSelf) { addLetters(st.selfArea, body); addLetters(st.myAct1, body); }
        else addLetters(st.oppArea, body);
      } else if (kind == 2 && body.indexOf("X") < 0) {
        if (actorSelf) addLetters(st.myAct2, body); // 完美捕获我方的丢弃牌
      }
      currentActor = 1 - currentActor; continue;
    }

    if (dash >= 0) {
      if (kind == 3) {
        const cIdx = charToIndex(choiceStr);
        if (cIdx >= 0) {
          const bArr = strToArr(body); bArr[cIdx] -= 1;
          if (actorSelf) { st.oppArea[cIdx]++; addArr(st.selfArea, bArr); }
          else { st.selfArea[cIdx]++; addArr(st.oppArea, bArr); }
        }
      } else if (kind == 4) {
        if (body.length == 4 && choiceStr.length == 2) {
          const g1 = sortedStr(body.substring(0, 2)), g2 = sortedStr(body.substring(2, 4));
          const chosen = sameMultiset(choiceStr, g1) ? g1 : (sameMultiset(choiceStr, g2) ? g2 : "");
          const other = chosen == g1 ? g2 : g1;
          if (chosen) {
            if (actorSelf) { addLetters(st.oppArea, chosen); addLetters(st.selfArea, other); }
            else { addLetters(st.selfArea, chosen); addLetters(st.oppArea, other); }
          }
        }
      }
      currentActor = 1 - currentActor;
    } else {
      st.pending = true; st.pendingKind = kind; st.pendingBody = body;
      st.responder = 1 - currentActor; st.actorToMove = st.responder;
      return st;
    }
  }
  st.actorToMove = currentActor;
  return st;
}

// ── 组合枚举 ───────────────────────────────────────────
function combineHelper(hand: Int32Array, col: i32, remaining: i32, current: Int32Array, out: Array<Int32Array>): void {
  if (remaining == 0) { out.push(cloneArr(current)); return; }
  if (col >= 7) return;
  const maxTake = Math.min(hand[col], remaining);
  for (let take = 0; take <= maxTake; take++) {
    current[col] = take;
    combineHelper(hand, col + 1, remaining - take, current, out);
  }
  current[col] = 0;
}
function generateCombinations(hand: Int32Array, k: i32): Array<Int32Array> {
  const out: Int32Array[] = [];
  if (arrLen(hand) < k) return out;
  combineHelper(hand, 0, k, new Int32Array(7), out);
  return out;
}

class SplitPair { constructor(public g1: Int32Array, public g2: Int32Array, public s1: string, public s2: string) {} }
function generateAllSplits(quad: Int32Array): Array<SplitPair> {
  const cards: i32[] = [];
  for (let i = 0; i < 7; i++) for (let k = 0; k < quad[i]; k++) cards.push(i);
  const out: SplitPair[] = []; const seen: string[] = [];
  for (let mask = 1; mask < 16; mask++) {
    let c = 0, v = mask; while(v > 0) { c += v & 1; v >>= 1; }
    if (c != 2) continue;
    const g1 = new Int32Array(7), g2 = new Int32Array(7);
    for (let b = 0; b < 4; b++) { if ((mask >> b) & 1) g1[cards[b]]++; else g2[cards[b]]++; }
    const s1 = arrStr(g1), s2 = arrStr(g2);
    const key = s1 <= s2 ? s1 + "|" + s2 : s2 + "|" + s1;
    if (seen.indexOf(key) < 0) {
      seen.push(key);
      if (s1 <= s2) out.push(new SplitPair(g1, g2, s1, s2));
      else out.push(new SplitPair(g2, g1, s2, s1));
    }
  }
  return out;
}

// ── 带有【数学级将死视野】的强力终端评估 ────────────────────────────
function projectedOwner(idx: i32, selfArea: Int32Array, oppArea: Int32Array, board: Int8Array): i32 {
  if (selfArea[idx] > oppArea[idx]) return 1;
  if (selfArea[idx] < oppArea[idx]) return -1;
  return <i32>board[idx];
}

function staticEval(selfArea: Int32Array, oppArea: Int32Array, board: Int8Array, myHand: Int32Array, oppHand: Int32Array): i32 {
  let myS = 0, oppS = 0, myC = 0, oppC = 0;
  let val = 0;

  for (let i = 0; i < 7; i++) {
    const sc = SCORES[i];
    const diff = selfArea[i] - oppArea[i];
    const owner = projectedOwner(i, selfArea, oppArea, board);
    
    if (owner == 1) { myS += sc; myC++; } 
    else if (owner == -1) { oppS += sc; oppC++; }

    // 基础牌型价值
    if (owner == 1) {
      val += sc * 35;
      if (diff >= 2) val += sc * 15; 
    } else if (owner == -1) {
      val -= sc * 35;
      if (-diff >= 2) val -= sc * 15;
    }
    
    if (diff == 0) val += <i32>board[i] * sc * 12; 
    else val += diff * sc * 8; 

    // 【核心升级】：数学级绝对锁定 (Mathematical Checkmate Check)
    // 如果算上对方所有的牌，我也赢定了；或者算上我所有的牌，对方也赢定了。
    const myAbsoluteMax = selfArea[i] + myHand[i];
    const oppAbsoluteMax = oppArea[i] + oppHand[i];
    
    if (selfArea[i] > oppAbsoluteMax) {
      val += sc * 150; // 绝对锁定列，赋予巨额安心分
    } else if (oppArea[i] > myAbsoluteMax) {
      val -= sc * 150; // 绝对丢失列，及时止损，不再投入资源
    }
  }

  // 终局胜利判定
  if (myS >= 11 && oppC >= 4) return INF - 10;
  if (oppS >= 11 && myC >= 4) return NEG_INF + 10;
  if (myS >= 11) return INF - 10;
  if (oppS >= 11) return NEG_INF + 10;
  if (myC >= 4) return INF - 1000;
  if (oppC >= 4) return NEG_INF + 1000;

  // 纯净双线分差
  val += (myS - oppS) * 75;
  val += (myC - oppC) * 120;

  // 逼近胜利的压迫感
  if (myS >= 10) val += 3500; else if (myS >= 9) val += 1400; else if (myS >= 8) val += 600;
  if (oppS >= 10) val -= 4500; else if (oppS >= 9) val -= 2200; else if (oppS >= 8) val -= 1000;
  
  if (myC >= 3 && myS >= 8) val += 1500; 
  if (oppC >= 3 && oppS >= 8) val -= 2500; 
  
  if (myC >= 3) val += 500; 
  if (oppC >= 3) val -= 800;

  return val;
}

// ── 绝对记忆推演 (Perfect Memory Bounds) ───────────────────────────
function inferOppHand(pst: ParsedState, myHand: Int32Array): Int32Array {
  const oppEst = new Int32Array(7);
  for (let i = 0; i < 7; i++) {
    // 【核心升级】：从全集(SCORES)中剔除 场上明牌 + 对方明牌 + 我的手牌 + 【我已丢弃的废牌!】
    // pst.selfArea 已经包含了 pst.myAct1(藏牌)，因此无需重复减
    const rem = SCORES[i] - pst.selfArea[i] - pst.oppArea[i] - myHand[i] - pst.myAct2[i];
    oppEst[i] = rem > 0 ? rem : 0;
  }
  return oppEst;
}

// ── 核心 Minimax (引入精准上下界与将死洞察) ───────────────────────────
function minimax(
  selfA: Int32Array, oppA: Int32Array, board: Int8Array,
  myHand: Int32Array, oppHand: Int32Array,
  myUsed: Uint8Array, oppUsed: Uint8Array,
  depth: i32, alpha: i32, beta: i32, toMove: i32
): i32 {
  if (checkTimeout()) return 0;

  const stateHash = getStateHash(selfA, oppA, myHand, oppHand, myUsed, oppUsed, toMove);
  const ttEntry = transpositionTable.get(stateHash);
  if (ttEntry !== undefined && ttEntry.depth >= depth) {
    if (ttEntry.flag == FLAG_EXACT) return ttEntry.score;
    if (ttEntry.flag == FLAG_ALPHA && ttEntry.score <= alpha) return alpha;
    if (ttEntry.flag == FLAG_BETA && ttEntry.score >= beta) return beta;
  }

  // 利用全新的终端视野，直接评估是否有任何一方提前形成数学绝杀
  const currentEv = staticEval(selfA, oppA, board, myHand, oppHand);
  if (currentEv >= INF - 2000 || currentEv <= NEG_INF + 2000) return currentEv;

  let myLeft = 0, oppLeft = 0;
  for (let i = 1; i <= 4; i++) { if (myUsed[i] == 0) myLeft++; if (oppUsed[i] == 0) oppLeft++; }
  
  if (depth <= 0 || (myLeft == 0 && oppLeft == 0)) {
    transpositionTable.set(stateHash, new TTEntry(depth, currentEv, FLAG_EXACT));
    return currentEv;
  }

  let originalAlpha = alpha;

  if (toMove == 0) { // ── 我方决策层 ──
    let best = NEG_INF;
    const myLen = arrLen(myHand);

    if (myUsed[1] == 0 && myLen >= 1) {
      const nu = cloneUsed(myUsed); nu[1] = 1;
      for (let i = 0; i < 7; i++) {
        if (myHand[i] <= 0) continue;
        const nS = cloneArr(selfA); nS[i]++; const nH = cloneArr(myHand); nH[i]--;
        const v = minimax(nS, oppA, board, nH, oppHand, nu, oppUsed, depth - 1, alpha, beta, 1);
        if (v > best) best = v; if (best > alpha) alpha = best; if (alpha >= beta) break;
      }
    }
    if (!gTimeoutFlag && myUsed[2] == 0 && myLen >= 2) {
      const nu = cloneUsed(myUsed); nu[2] = 1; const pairs = generateCombinations(myHand, 2);
      for (let i = 0; i < pairs.length; i++) {
        const v = minimax(selfA, oppA, board, subArr(myHand, pairs[i]), oppHand, nu, oppUsed, depth - 1, alpha, beta, 1);
        if (v > best) best = v; if (best > alpha) alpha = best; if (alpha >= beta) break;
      }
    }
    if (!gTimeoutFlag && myUsed[3] == 0 && myLen >= 3) {
      const nu = cloneUsed(myUsed); nu[3] = 1; const triples = generateCombinations(myHand, 3);
      for (let t = 0; t < triples.length; t++) {
        const trip = triples[t]; const nH = subArr(myHand, trip); let minResp = INF;
        for (let i = 0; i < 7; i++) {
          if (trip[i] <= 0) continue;
          const nO = cloneArr(oppA); nO[i]++; const r = cloneArr(trip); r[i]--; const nS = cloneArr(selfA); addArr(nS, r);
          const v = minimax(nS, nO, board, nH, oppHand, nu, oppUsed, depth - 1, alpha, beta, 1);
          if (v < minResp) minResp = v;
        }
        if (minResp == INF) minResp = currentEv;
        if (minResp > best) best = minResp; if (best > alpha) alpha = best; if (alpha >= beta) break;
      }
    }
    if (!gTimeoutFlag && myUsed[4] == 0 && myLen >= 4) {
      const nu = cloneUsed(myUsed); nu[4] = 1; const quads = generateCombinations(myHand, 4);
      for (let q = 0; q < quads.length; q++) {
        const quad = quads[q]; const nH = subArr(myHand, quad); const splits = generateAllSplits(quad);
        for (let s = 0; s < splits.length; s++) {
          const sp = splits[s];
          const s1 = cloneArr(selfA); addArr(s1, sp.g2); const o1 = cloneArr(oppA); addArr(o1, sp.g1);
          const v1 = minimax(s1, o1, board, nH, oppHand, nu, oppUsed, depth - 1, alpha, beta, 1);
          const s2 = cloneArr(selfA); addArr(s2, sp.g1); const o2 = cloneArr(oppA); addArr(o2, sp.g2);
          const v2 = minimax(s2, o2, board, nH, oppHand, nu, oppUsed, depth - 1, alpha, beta, 1);
          const worst = Math.min(v1, v2);
          if (worst > best) best = worst; if (best > alpha) alpha = best; if (alpha >= beta) break;
        }
      }
    }

    if (best == NEG_INF) best = currentEv;
    
    let flag = FLAG_EXACT;
    if (best <= originalAlpha) flag = FLAG_ALPHA; else if (best >= beta) flag = FLAG_BETA;
    if (!gTimeoutFlag) transpositionTable.set(stateHash, new TTEntry(depth, best, flag));
    return best;

  } else { // ── 对手决策层 ──
    let best = INF;
    const oppLen = arrLen(oppHand);

    if (oppUsed[1] == 0 && oppLen >= 1) {
      const nu = cloneUsed(oppUsed); nu[1] = 1;
      for (let i = 0; i < 7; i++) {
        if (oppHand[i] <= 0) continue;
        const nO = cloneArr(oppA); nO[i]++; const nH = cloneArr(oppHand); nH[i]--;
        const v = minimax(selfA, nO, board, myHand, nH, myUsed, nu, depth - 1, alpha, beta, 0);
        if (v < best) best = v; if (best < beta) beta = best; if (alpha >= beta) break;
      }
    }
    if (!gTimeoutFlag && oppUsed[2] == 0 && oppLen >= 2) {
      const nu = cloneUsed(oppUsed); nu[2] = 1; const pairs = generateCombinations(oppHand, 2);
      for (let i = 0; i < pairs.length; i++) {
        const v = minimax(selfA, oppA, board, myHand, subArr(oppHand, pairs[i]), myUsed, nu, depth - 1, alpha, beta, 0);
        if (v < best) best = v; if (best < beta) beta = best; if (alpha >= beta) break;
      }
    }
    if (!gTimeoutFlag && oppUsed[3] == 0 && oppLen >= 3) {
      const nu = cloneUsed(oppUsed); nu[3] = 1; const triples = generateCombinations(oppHand, 3);
      for (let t = 0; t < triples.length; t++) {
        const trip = triples[t]; const nH = subArr(oppHand, trip); let maxResp = NEG_INF;
        for (let i = 0; i < 7; i++) {
          if (trip[i] <= 0) continue;
          const nS = cloneArr(selfA); nS[i]++; const r = cloneArr(trip); r[i]--; const nO = cloneArr(oppA); addArr(nO, r);
          const v = minimax(nS, nO, board, myHand, nH, myUsed, nu, depth - 1, alpha, beta, 0);
          if (v > maxResp) maxResp = v;
        }
        if (maxResp == NEG_INF) maxResp = currentEv;
        if (maxResp < best) best = maxResp; if (best < beta) beta = best; if (alpha >= beta) break;
      }
    }
    if (!gTimeoutFlag && oppUsed[4] == 0 && oppLen >= 4) {
      const nu = cloneUsed(oppUsed); nu[4] = 1; const quads = generateCombinations(oppHand, 4);
      for (let q = 0; q < quads.length; q++) {
        const quad = quads[q]; const nH = subArr(oppHand, quad); const splits = generateAllSplits(quad);
        for (let s = 0; s < splits.length; s++) {
          const sp = splits[s];
          const s1 = cloneArr(selfA); addArr(s1, sp.g1); const o1 = cloneArr(oppA); addArr(o1, sp.g2);
          const v1 = minimax(s1, o1, board, myHand, nH, myUsed, nu, depth - 1, alpha, beta, 0);
          const s2 = cloneArr(selfA); addArr(s2, sp.g2); const o2 = cloneArr(oppA); addArr(o2, sp.g1);
          const v2 = minimax(s2, o2, board, myHand, nH, myUsed, nu, depth - 1, alpha, beta, 0);
          const bestForMe = Math.max(v1, v2);
          if (bestForMe < best) best = bestForMe; if (best < beta) beta = best; if (alpha >= beta) break;
        }
      }
    }

    if (best == INF) best = currentEv;
    
    let flag = FLAG_EXACT;
    if (best <= alpha) flag = FLAG_ALPHA; else if (best >= beta) flag = FLAG_BETA;
    if (!gTimeoutFlag) transpositionTable.set(stateHash, new TTEntry(depth, best, flag));
    return best;
  }
}

// ── 迭代加深顶层引擎 (精准排序剪枝) ────────────────────────────────────
class MoveCandidate { constructor(public action: string, public score: i32) {} }

function selectBestAction(
  selfArea: Int32Array, oppArea: Int32Array, board: Int8Array,
  myHand: Int32Array, oppHand: Int32Array,
  myUsed: Uint8Array, oppUsed: Uint8Array
): string {
  let myLeft = 0, oppLeft = 0;
  for (let i = 1; i <= 4; i++) { if (myUsed[i] == 0) myLeft++; if (oppUsed[i] == 0) oppLeft++; }
  const totalTurnsLeft = myLeft + oppLeft;

  const moves: MoveCandidate[] = [];
  const mLen = arrLen(myHand);

  if (myUsed[4] == 0 && mLen >= 4) {
    for (let q of generateCombinations(myHand, 4)) for (let s of generateAllSplits(q)) moves.push(new MoveCandidate("4" + s.s1 + s.s2, 0));
  }
  if (myUsed[3] == 0 && mLen >= 3) {
    for (let t of generateCombinations(myHand, 3)) moves.push(new MoveCandidate("3" + arrStr(t), 0));
  }
  if (myUsed[1] == 0 && mLen >= 1) {
    for (let i = 0; i < 7; i++) if (myHand[i] > 0) moves.push(new MoveCandidate("1" + idxToChar(i), 0));
  }
  if (myUsed[2] == 0 && mLen >= 2) {
    for (let p of generateCombinations(myHand, 2)) moves.push(new MoveCandidate("2" + arrStr(p), 0));
  }

  if (moves.length == 0) return "";
  if (moves.length == 1) return moves[0].action;
  
  // 第一层极速静态排序，铺垫完美剪枝
  for (let m of moves) {
    const kind = actionKind(m.action); const body = m.action.substring(1);
    const sA = cloneArr(selfArea); const oA = cloneArr(oppArea);
    if (kind == 1) sA[charToIndex(body)]++;
    else if (kind == 3) { oA[charToIndex(body.charAt(0))]++; addLetters(sA, body.substring(1)); }
    else if (kind == 4) { addLetters(sA, body.substring(2,4)); addLetters(oA, body.substring(0,2)); }
    m.score = staticEval(sA, oA, board, myHand, oppHand);
  }
  moves.sort((a, b) => b.score - a.score);

  transpositionTable.clear(); 
  let bestGlobalAction = moves[0].action;
  
  let depth = 1;
  while (depth <= totalTurnsLeft) {
    let currentAlpha = NEG_INF;
    let bestForDepth = "";
    
    for (let i = 0; i < moves.length; i++) {
      if (checkTimeout()) break;
      const m = moves[i].action; const kind = actionKind(m); const body = m.substring(1);
      const nUsed = cloneUsed(myUsed); nUsed[kind] = 1;
      let score = NEG_INF;

      if (kind == 1) {
        const idx = charToIndex(body);
        const nS = cloneArr(selfArea); nS[idx]++; const nH = cloneArr(myHand); nH[idx]--;
        score = minimax(nS, oppArea, board, nH, oppHand, nUsed, oppUsed, depth - 1, currentAlpha, INF, 1);
      } else if (kind == 2) {
        const nH = subArr(myHand, strToArr(body));
        score = minimax(selfArea, oppArea, board, nH, oppHand, nUsed, oppUsed, depth - 1, currentAlpha, INF, 1);
      } else if (kind == 3) {
        const trip = strToArr(body); const nH = subArr(myHand, trip); let minR = INF;
        for (let idx = 0; idx < 7; idx++) {
          if (trip[idx] <= 0) continue;
          const nO = cloneArr(oppArea); nO[idx]++; const r = cloneArr(trip); r[idx]--; const nS = cloneArr(selfArea); addArr(nS, r);
          const v = minimax(nS, nO, board, nH, oppHand, nUsed, oppUsed, depth - 1, currentAlpha, INF, 1);
          if (v < minR) minR = v;
        }
        score = minR;
      } else if (kind == 4) {
        const g1 = strToArr(body.substring(0, 2)), g2 = strToArr(body.substring(2, 4));
        const quad = cloneArr(g1); addArr(quad, g2); const nH = subArr(myHand, quad);
        const s1 = cloneArr(selfArea); addArr(s1, g2); const o1 = cloneArr(oppArea); addArr(o1, g1);
        const v1 = minimax(s1, o1, board, nH, oppHand, nUsed, oppUsed, depth - 1, currentAlpha, INF, 1);
        const s2 = cloneArr(selfArea); addArr(s2, g1); const o2 = cloneArr(oppArea); addArr(o2, g2);
        const v2 = minimax(s2, o2, board, nH, oppHand, nUsed, oppUsed, depth - 1, currentAlpha, INF, 1);
        score = Math.min(v1, v2);
      }

      if (!gTimeoutFlag) {
        moves[i].score = score;
        if (score > currentAlpha) { currentAlpha = score; bestForDepth = m; }
      }
    }
    
    if (!gTimeoutFlag && bestForDepth != "") {
      bestGlobalAction = bestForDepth; 
      moves.sort((a, b) => b.score - a.score); // 拿着上一层的精确分数为下一层重新排序
    } else {
      break; 
    }
    depth++;
  }
  return bestGlobalAction;
}

// ── 响应行动决策 (直接算到底) ─────────────────────────────────────────────
function selectResponseTo3(
  pendingBody: string, selfArea: Int32Array, oppArea: Int32Array, board: Int8Array,
  myHand: Int32Array, oppHand: Int32Array, myUsed: Uint8Array, oppUsed: Uint8Array
): string {
  let myLeft = 0, oppLeft = 0;
  for (let i = 1; i <= 4; i++) { if (myUsed[i] == 0) myLeft++; if (oppUsed[i] == 0) oppLeft++; }
  const depth = myLeft + oppLeft;

  let best = ""; let bestScore = NEG_INF; const seen: string[] = [];
  transpositionTable.clear();

  for (let i = 0; i < pendingBody.length; i++) {
    const c = pendingBody.charAt(i);
    if (seen.indexOf(c) >= 0) continue; seen.push(c);
    const idx = charToIndex(c);
    if (idx < 0) continue;

    const nS = cloneArr(selfArea); nS[idx]++; const bArr = strToArr(pendingBody); bArr[idx]--; const nO = cloneArr(oppArea); addArr(nO, bArr);
    const score = minimax(nS, nO, board, myHand, oppHand, myUsed, oppUsed, depth, NEG_INF, INF, 0);
    
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return "-" + (best || pendingBody.charAt(0));
}

function selectResponseTo4(
  pendingBody: string, selfArea: Int32Array, oppArea: Int32Array, board: Int8Array,
  myHand: Int32Array, oppHand: Int32Array, myUsed: Uint8Array, oppUsed: Uint8Array
): string {
  if (pendingBody.length < 4) return "-" + sortedStr(pendingBody.substring(0, 2));

  let myLeft = 0, oppLeft = 0;
  for (let i = 1; i <= 4; i++) { if (myUsed[i] == 0) myLeft++; if (oppUsed[i] == 0) oppLeft++; }
  const depth = myLeft + oppLeft;
  transpositionTable.clear();

  const g1 = sortedStr(pendingBody.substring(0, 2)), g2 = sortedStr(pendingBody.substring(2, 4));
  const nS1 = cloneArr(selfArea); addLetters(nS1, g1); const nO1 = cloneArr(oppArea); addLetters(nO1, g2);
  const s1 = minimax(nS1, nO1, board, myHand, oppHand, myUsed, oppUsed, depth, NEG_INF, INF, 0);

  const nS2 = cloneArr(selfArea); addLetters(nS2, g2); const nO2 = cloneArr(oppArea); addLetters(nO2, g1);
  const s2 = minimax(nS2, nO2, board, myHand, oppHand, myUsed, oppUsed, depth, NEG_INF, INF, 0);

  return s1 >= s2 ? "-" + g1 : "-" + g2;
}

// ── 合法性验证与兜底逻辑 ─────────────────────────────────────
function expectedCardsLen(st: ParsedState, selfIsFirst: boolean): i32 {
  const selfP = selfIsFirst ? 0 : 1;
  if (st.pending) return st.responder == selfP ? 6 + st.ownActions - st.ownConsumed : -1000;
  return st.actorToMove == selfP ? 6 + st.ownActions - st.ownConsumed + 1 : -1000;
}

function inferSeat(history: Array<string>, cardsLen: i32): boolean {
  const f = parseHistory(history, true), s = parseHistory(history, false);
  const ok1 = expectedCardsLen(f, true) == cardsLen;
  const ok2 = expectedCardsLen(s, false) == cardsLen;
  if (ok1 && !ok2) return true;
  if (ok2 && !ok1) return false;
  if (ok1 && ok2) return f.pending && !s.pending ? true : (s.pending && !f.pending ? false : true);
  return true;
}

function actionValidForSeat(history: Array<string>, cards: string, action: string, selfIsFirst: boolean): boolean {
  if (action.length == 0) return false;
  const st = parseHistory(history, selfIsFirst);
  const selfPlayer = selfIsFirst ? 0 : 1;
  if (st.pending) {
    if (st.responder != selfPlayer || action.charAt(0) != '-') return false;
    const body = normalizeChoice(action.substring(1));
    if (st.pendingKind == 3) return body.length == 1 && st.pendingBody.indexOf(body) >= 0;
    if (st.pendingKind == 4) {
      if (st.pendingBody.length < 4 || body.length != 2) return false;
      const g1 = sortedStr(st.pendingBody.substring(0, 2)), g2 = sortedStr(st.pendingBody.substring(2, 4));
      return sameMultiset(body, g1) || sameMultiset(body, g2);
    }
    return false;
  }
  if (st.actorToMove != selfPlayer) return false;
  const kind = action.charCodeAt(0) - 48;
  if (kind < 1 || kind > 4 || action.length - 1 != kind || st.myUsed[kind] != 0) return false;
  return bodyInCards(cards, action.substring(1));
}

function fallbackAction(cards: string, used: Uint8Array): string {
  const hand = strToArr(cards); const n = arrLen(hand);
  if (used[1] == 0 && n >= 1) for (let i = 0; i < 7; i++) if (hand[i] > 0) return "1" + idxToChar(i);
  if (used[2] == 0 && n >= 2) return "2" + arrStr(generateCombinations(hand, 2)[0]);
  if (used[3] == 0 && n >= 3) return "3" + arrStr(generateCombinations(hand, 3)[0]);
  if (used[4] == 0 && n >= 4) {
    const sp = generateAllSplits(generateCombinations(hand, 4)[0]);
    return "4" + sp[0].s1 + sp[0].s2;
  }
  return "1A";
}

// ── 主干入口 ─────────────────────────────────────────────────
function chooseActionForSeat(history: Array<string>, cards: string, board: Int8Array, selfIsFirst: boolean): string {
  const pst = parseHistory(history, selfIsFirst);
  const selfPlayer = selfIsFirst ? 0 : 1;
  const myHand = strToArr(cards);
  
  // V3.0 最强推断核心：使用精准剔除废牌的上界限制
  const oppHand = inferOppHand(pst, myHand);

  if (pst.pending) {
    if (pst.responder != selfPlayer) return "";
    if (pst.pendingKind == 3) return selectResponseTo3(pst.pendingBody, pst.selfArea, pst.oppArea, board, myHand, oppHand, pst.myUsed, pst.oppUsed);
    if (pst.pendingKind == 4) return selectResponseTo4(pst.pendingBody, pst.selfArea, pst.oppArea, board, myHand, oppHand, pst.myUsed, pst.oppUsed);
    return "";
  }

  if (pst.actorToMove != selfPlayer) return "";
  return selectBestAction(pst.selfArea, pst.oppArea, board, myHand, oppHand, pst.myUsed, pst.oppUsed);
}

export function hanamikoji_action_raw(
  historyStr: string, cards: string,
  b0: i32, b1: i32, b2: i32, b3: i32, b4: i32, b5: i32, b6: i32
): string {
  gStartTime = Date.now();
  gTimeoutFlag = false;
  gNodes = 0;

  const history = splitHistoryStr(historyStr);
  const board = new Int8Array(7);
  board[0]=<i8>b0; board[1]=<i8>b1; board[2]=<i8>b2; board[3]=<i8>b3; board[4]=<i8>b4; board[5]=<i8>b5; board[6]=<i8>b6;

  const inferred = inferSeat(history, cards.length);

  let action = chooseActionForSeat(history, cards, board, inferred);
  if (actionValidForSeat(history, cards, action, inferred)) return action;

  action = chooseActionForSeat(history, cards, board, !inferred);
  if (actionValidForSeat(history, cards, action, !inferred)) return action;

  const st = parseHistory(history, inferred);
  if (st.pending) {
    if (st.pendingKind == 3 && st.pendingBody.length >= 1) return "-" + st.pendingBody.charAt(0);
    if (st.pendingKind == 4 && st.pendingBody.length >= 2) return "-" + sortedStr(st.pendingBody.substring(0, 2));
  }
  return fallbackAction(cards, st.myUsed);
}