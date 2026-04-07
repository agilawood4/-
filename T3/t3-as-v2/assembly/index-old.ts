// 花见小路 T3 优化版策略 - 全 bug 修复版
// 修复列表：
//   Fix1: SCORES 改回 i32[]（StaticArray 边界检查过严会崩溃）
//   Fix2: addLetters / bodyInCards 加字符范围检查，防止非 A-G 字符越界
//   Fix3: markUsedActions 过滤空 token 和响应 token，防止 unchecked 越界
//   Fix4: inferSeat 过滤空 token，防止 ownConsumed 计算错误
//   Fix5: fallbackAction 末尾兜底不再返回已用行动
// 原有博弈策略（evaluatePosition、minimax模拟）完全保留不变

// Fix1: 改回 i32[]，避免 StaticArray 严格边界检查崩溃
const SCORES: i32[] = [2, 2, 2, 3, 3, 4, 5];

// ─── 基础工具 ─────────────────────────────────────────────────

function charToIndex(ch: string): i32 {
  return ch.charCodeAt(0) - 65;
}

function idxToChar(idx: i32): string {
  return String.fromCharCode(65 + idx);
}

function splitHistory(history: string): Array<string> {
  if (history.length == 0) return new Array<string>();
  return history.split(" ");
}

function actorIsSelf(index: i32, selfIsFirst: bool): bool {
  return selfIsFirst ? (index % 2 == 0) : (index % 2 == 1);
}

// Fix2: 对每个字符做范围检查，只处理 A-G
function addLetters(target: Int32Array, letters: string): void {
  for (let i: i32 = 0; i < letters.length; i++) {
    const c = letters.charAt(i);
    if (c == "X") continue;
    const idx = charToIndex(c);
    if (idx < 0 || idx >= 7) continue;
    target[idx] += 1;
  }
}

function removeLetters(src: string, used: string): string {
  const cnt = new Int32Array(7);
  addLetters(cnt, src);
  for (let i: i32 = 0; i < used.length; i++) {
    const c = used.charAt(i);
    if (c == "X") continue;
    const idx = charToIndex(c);
    if (idx < 0 || idx >= 7) continue;
    cnt[idx] -= 1;
  }
  let out = "";
  for (let i: i32 = 0; i < 7; i++)
    for (let k: i32 = 0; k < cnt[i]; k++) out += idxToChar(i);
  return out;
}

function sameMultiset(a: string, b: string): bool {
  if (a.length != b.length) return false;
  const ca = new Int32Array(7);
  const cb = new Int32Array(7);
  addLetters(ca, a);
  addLetters(cb, b);
  for (let i: i32 = 0; i < 7; i++)
    if (ca[i] != cb[i]) return false;
  return true;
}

function sortedString(s: string): string {
  const cnt = new Int32Array(7);
  addLetters(cnt, s);
  let out = "";
  for (let i: i32 = 0; i < 7; i++)
    for (let k: i32 = 0; k < cnt[i]; k++) out += idxToChar(i);
  return out;
}

function tokenizeCards(cards: string): Array<string> {
  const out = new Array<string>();
  for (let i: i32 = 0; i < cards.length; i++) out.push(cards.charAt(i));
  return out;
}

function buildBoard(
  b0: i32, b1: i32, b2: i32, b3: i32, b4: i32, b5: i32, b6: i32
): Int8Array {
  const board = new Int8Array(7);
  board[0] = <i8>b0; board[1] = <i8>b1; board[2] = <i8>b2;
  board[3] = <i8>b3; board[4] = <i8>b4; board[5] = <i8>b5;
  board[6] = <i8>b6;
  return board;
}

function containsString(arr: Array<string>, value: string): bool {
  for (let i: i32 = 0; i < arr.length; i++)
    if (arr[i] == value) return true;
  return false;
}

// Fix2: bodyInCards 加范围检查
function bodyInCards(cards: string, body: string): bool {
  const cnt = new Int32Array(7);
  addLetters(cnt, cards);
  for (let i: i32 = 0; i < body.length; i++) {
    const idx = charToIndex(body.charAt(i));
    if (idx < 0 || idx >= 7) return false;
    cnt[idx] -= 1;
    if (cnt[idx] < 0) return false;
  }
  return true;
}

// ─── 座位推断 ────────────────────────────────────────────────

function inferSeat(history: Array<string>, cardsLen: i32, isChoice: bool): bool {
  let possibleFirst = true;
  let possibleSecond = true;

  for (let i: i32 = 0; i < history.length; i++) {
    const token = history[i];
    if (token.length == 0) continue;
    const fc = token.charCodeAt(0);
    const kind = fc - 48;
    if (kind != 1 && kind != 2) continue;
    const hasX = token.indexOf("X") >= 0;
    const even = (i % 2 == 0);
    if (even) {
      if (hasX) possibleFirst = false;
      else possibleSecond = false;
    } else {
      if (hasX) possibleSecond = false;
      else possibleFirst = false;
    }
  }

  let best = possibleFirst ? true : false;
  let found = false;

  for (let seatFlag: i32 = 0; seatFlag < 2; seatFlag++) {
    const selfIsFirst = seatFlag == 0;
    if (selfIsFirst && !possibleFirst) continue;
    if (!selfIsFirst && !possibleSecond) continue;

    let ownTurns: i32 = 0;
    let ownConsumed: i32 = 0;
    const lastIdx = history.length - 1;

    for (let i: i32 = 0; i < history.length; i++) {
      if (isChoice && i == lastIdx) break;
      // Fix4: 过滤空 token 和响应 token
      const tok = history[i];
      if (tok.length == 0) continue;
      const fc = tok.charCodeAt(0);
      if (fc == 45) continue; // '-' 开头，响应 token 不计入行动
      if (actorIsSelf(i, selfIsFirst)) {
        ownTurns++;
        ownConsumed += fc - 48;
      }
    }

    const expected = 6 + ownTurns - ownConsumed + (isChoice ? 0 : 1);
    if (expected == cardsLen) {
      best = selfIsFirst;
      found = true;
      break;
    }
  }

  if (found) return best;
  if (possibleFirst) return true;
  return false;
}

// ─── 区域重建 ────────────────────────────────────────────────

function applyKnownToken(
  token: string,
  actorSelf: bool,
  selfArea: Int32Array,
  oppArea: Int32Array
): void {
  if (token.length == 0) return;
  const kind = token.charCodeAt(0) - 48;
  const dash = token.indexOf("-");
  const body = dash >= 0 ? token.substring(1, dash) : token.substring(1);
  const choice = dash >= 0 ? token.substring(dash + 1) : "";

  if (kind == 1) {
    if (body.indexOf("X") >= 0) return;
    if (actorSelf) addLetters(selfArea, body);
    else addLetters(oppArea, body);
    return;
  }
  if (kind == 2) return;
  if (kind == 3) {
    if (choice.length == 0) return;
    const rest = removeLetters(body, choice);
    if (actorSelf) { addLetters(oppArea, choice); addLetters(selfArea, rest); }
    else { addLetters(selfArea, choice); addLetters(oppArea, rest); }
    return;
  }
  if (kind == 4) {
    if (choice.length == 0) return;
    const g1 = body.substring(0, 2);
    const g2 = body.substring(2, 4);
    const chosen = sameMultiset(g1, choice) ? g1 : g2;
    const other  = sameMultiset(g1, choice) ? g2 : g1;
    if (actorSelf) { addLetters(oppArea, chosen); addLetters(selfArea, other); }
    else { addLetters(selfArea, chosen); addLetters(oppArea, other); }
  }
}

function getKnownAreas(history: Array<string>, selfIsFirst: bool): Array<Int32Array> {
  const selfArea = new Int32Array(7);
  const oppArea  = new Int32Array(7);
  for (let i: i32 = 0; i < history.length; i++)
    applyKnownToken(history[i], actorIsSelf(i, selfIsFirst), selfArea, oppArea);
  const out = new Array<Int32Array>();
  out.push(selfArea);
  out.push(oppArea);
  return out;
}

// Fix3: 过滤空 token 和 '-' 开头的响应 token
function markUsedActions(history: Array<string>, selfIsFirst: bool): StaticArray<bool> {
  const used = new StaticArray<bool>(5);
  for (let i: i32 = 0; i < history.length; i++) {
    if (!actorIsSelf(i, selfIsFirst)) continue;
    const token = history[i];
    if (token.length == 0) continue;
    const fc = token.charCodeAt(0);
    if (fc == 45) continue; // '-' = 45，响应 token，不计入行动类型
    const kind = fc - 48;
    if (kind >= 1 && kind <= 4) unchecked(used[kind] = true);
  }
  return used;
}

// ─── 核心评估函数（保留优化版逻辑不变）────────────────────────

function scoreForWinState(mySc: i32, myCnt: i32, opSc: i32, opCnt: i32): i32 {
  if (mySc >= 11) return 1000000;
  if (opSc >= 11) return -1000000;
  if (myCnt >= 4 && opSc < 11) return 900000;
  if (opCnt >= 4 && mySc < 11) return -900000;

  let val: i32 = 0;
  val += mySc * mySc * 3;
  val -= opSc * opSc * 3;
  val += myCnt * myCnt * 40;
  val -= opCnt * opCnt * 40;
  val += (mySc - opSc) * 20;
  val += (myCnt - opCnt) * 60;
  if (mySc >= 9) val += 800;
  if (mySc >= 8) val += 400;
  if (mySc >= 7) val += 150;
  if (opSc >= 9) val -= 800;
  if (opSc >= 8) val -= 400;
  if (opSc >= 7) val -= 150;
  if (myCnt >= 3) val += 500;
  if (myCnt >= 2) val += 100;
  if (opCnt >= 3) val -= 500;
  if (opCnt >= 2) val -= 100;
  return val;
}

function evaluatePosition(
  selfArea: Int32Array,
  oppArea: Int32Array,
  board: Int8Array
): i32 {
  let mySc: i32 = 0;
  let opSc: i32 = 0;
  let myCnt: i32 = 0;
  let opCnt: i32 = 0;
  let stabilityBonus: i32 = 0;

  for (let i: i32 = 0; i < 7; i++) {
    const sd = selfArea[i];
    const od = oppArea[i];
    const sc = SCORES[i];
    if (sd > od) {
      mySc += sc; myCnt++;
      stabilityBonus += (sd - od) * sc * 4;
    } else if (sd < od) {
      opSc += sc; opCnt++;
      stabilityBonus -= (od - sd) * sc * 4;
    } else {
      if (board[i] == 1)       { mySc += sc; myCnt++; }
      else if (board[i] == -1) { opSc += sc; opCnt++; }
    }
  }
  return scoreForWinState(mySc, myCnt, opSc, opCnt) + stabilityBonus;
}

// ─── 赠予/竞争 minimax ───────────────────────────────────────

function simulateGiftOppBest(
  selfArea: Int32Array,
  oppArea: Int32Array,
  board: Int8Array,
  three: string
): i32 {
  let worstForMe: i32 = 2147483647;
  for (let i: i32 = 0; i < three.length; i++) {
    const c = three.charAt(i);
    const idx = charToIndex(c);
    if (idx < 0 || idx >= 7) continue;
    const ns = new Int32Array(7);
    const no = new Int32Array(7);
    for (let j: i32 = 0; j < 7; j++) { ns[j] = selfArea[j]; no[j] = oppArea[j]; }
    no[idx] += 1;
    const rest = removeLetters(three, c);
    for (let k: i32 = 0; k < rest.length; k++) {
      const ridx = charToIndex(rest.charAt(k));
      if (ridx >= 0 && ridx < 7) ns[ridx] += 1;
    }
    const sc = evaluatePosition(ns, no, board);
    if (sc < worstForMe) worstForMe = sc;
  }
  return worstForMe;
}

function simulateCompOppBest(
  selfArea: Int32Array,
  oppArea: Int32Array,
  board: Int8Array,
  payload: string
): i32 {
  const g1 = payload.substring(0, 2);
  const g2 = payload.substring(2, 4);

  const s1 = new Int32Array(7); const o1 = new Int32Array(7);
  for (let j: i32 = 0; j < 7; j++) { s1[j] = selfArea[j]; o1[j] = oppArea[j]; }
  for (let k: i32 = 0; k < g1.length; k++) {
    const idx = charToIndex(g1.charAt(k));
    if (idx >= 0 && idx < 7) o1[idx] += 1;
  }
  for (let k: i32 = 0; k < g2.length; k++) {
    const idx = charToIndex(g2.charAt(k));
    if (idx >= 0 && idx < 7) s1[idx] += 1;
  }
  const sc1 = evaluatePosition(s1, o1, board);

  const s2 = new Int32Array(7); const o2 = new Int32Array(7);
  for (let j: i32 = 0; j < 7; j++) { s2[j] = selfArea[j]; o2[j] = oppArea[j]; }
  for (let k: i32 = 0; k < g2.length; k++) {
    const idx = charToIndex(g2.charAt(k));
    if (idx >= 0 && idx < 7) o2[idx] += 1;
  }
  for (let k: i32 = 0; k < g1.length; k++) {
    const idx = charToIndex(g1.charAt(k));
    if (idx >= 0 && idx < 7) s2[idx] += 1;
  }
  const sc2 = evaluatePosition(s2, o2, board);

  return sc1 < sc2 ? sc1 : sc2;
}

// ─── 响应选择 ────────────────────────────────────────────────

function bestChoiceFor3(
  body: string,
  board: Int8Array,
  selfArea: Int32Array,
  oppArea: Int32Array
): string {
  let best: i32 = -2147483648;
  let bestC = body.charAt(0);
  for (let i: i32 = 0; i < body.length; i++) {
    const c = body.charAt(i);
    const idx = charToIndex(c);
    if (idx < 0 || idx >= 7) continue;
    const ns = new Int32Array(7); const no = new Int32Array(7);
    for (let j: i32 = 0; j < 7; j++) { ns[j] = selfArea[j]; no[j] = oppArea[j]; }
    ns[idx] += 1;
    const rest = removeLetters(body, c);
    for (let k: i32 = 0; k < rest.length; k++) {
      const ridx = charToIndex(rest.charAt(k));
      if (ridx >= 0 && ridx < 7) no[ridx] += 1;
    }
    const sc = evaluatePosition(ns, no, board);
    if (sc > best) { best = sc; bestC = c; }
  }
  return "-" + bestC;
}

function bestChoiceFor4(
  body: string,
  board: Int8Array,
  selfArea: Int32Array,
  oppArea: Int32Array
): string {
  const g1 = body.substring(0, 2);
  const g2 = body.substring(2, 4);

  const s1 = new Int32Array(7); const o1 = new Int32Array(7);
  for (let j: i32 = 0; j < 7; j++) { s1[j] = selfArea[j]; o1[j] = oppArea[j]; }
  for (let k: i32 = 0; k < g1.length; k++) {
    const idx = charToIndex(g1.charAt(k));
    if (idx >= 0 && idx < 7) s1[idx] += 1;
  }
  for (let k: i32 = 0; k < g2.length; k++) {
    const idx = charToIndex(g2.charAt(k));
    if (idx >= 0 && idx < 7) o1[idx] += 1;
  }
  const sc1 = evaluatePosition(s1, o1, board);

  const s2 = new Int32Array(7); const o2 = new Int32Array(7);
  for (let j: i32 = 0; j < 7; j++) { s2[j] = selfArea[j]; o2[j] = oppArea[j]; }
  for (let k: i32 = 0; k < g2.length; k++) {
    const idx = charToIndex(g2.charAt(k));
    if (idx >= 0 && idx < 7) s2[idx] += 1;
  }
  for (let k: i32 = 0; k < g1.length; k++) {
    const idx = charToIndex(g1.charAt(k));
    if (idx >= 0 && idx < 7) o2[idx] += 1;
  }
  const sc2 = evaluatePosition(s2, o2, board);

  return sc1 >= sc2 ? "-" + g1 : "-" + g2;
}

// ─── 组合生成 ─────────────────────────────────────────────────

function uniquePush(out: Array<string>, value: string): void {
  if (!containsString(out, value)) out.push(value);
}

function generateSingles(cards: string): Array<string> {
  const out = new Array<string>();
  for (let i: i32 = 0; i < cards.length; i++) uniquePush(out, cards.charAt(i));
  return out;
}

function generateCombos(cards: string, take: i32): Array<string> {
  const arr = tokenizeCards(cards);
  const n = arr.length;
  const out = new Array<string>();
  if (take == 2) {
    for (let i: i32 = 0; i < n; i++)
      for (let j: i32 = i + 1; j < n; j++)
        uniquePush(out, sortedString(arr[i] + arr[j]));
  } else if (take == 3) {
    for (let i: i32 = 0; i < n; i++)
      for (let j: i32 = i + 1; j < n; j++)
        for (let k: i32 = j + 1; k < n; k++)
          uniquePush(out, sortedString(arr[i] + arr[j] + arr[k]));
  } else if (take == 4) {
    for (let i: i32 = 0; i < n; i++)
      for (let j: i32 = i + 1; j < n; j++)
        for (let k: i32 = j + 1; k < n; k++)
          for (let t: i32 = k + 1; t < n; t++)
            uniquePush(out, sortedString(arr[i] + arr[j] + arr[k] + arr[t]));
  }
  return out;
}

function canonical4(a: string, b: string): string {
  const x = sortedString(a);
  const y = sortedString(b);
  return x <= y ? x + y : y + x;
}

function generateCompetitionPayloads(cards: string): Array<string> {
  const fourSets = generateCombos(cards, 4);
  const out = new Array<string>();
  for (let s: i32 = 0; s < fourSets.length; s++) {
    const z = fourSets[s];
    const a = z.charAt(0), b = z.charAt(1), c = z.charAt(2), d = z.charAt(3);
    uniquePush(out, canonical4(a + b, c + d));
    uniquePush(out, canonical4(a + c, b + d));
    uniquePush(out, canonical4(a + d, b + c));
  }
  return out;
}

// ─── 行动有效性验证 ──────────────────────────────────────────

function actionValidForSeat(
  history: Array<string>,
  cards: string,
  action: string,
  selfIsFirst: bool
): bool {
  if (action.length == 0) return false;

  const last = history.length > 0 ? history[history.length - 1] : "";
  const isChoice = last.length > 0 &&
    (last.charCodeAt(0) == 51 || last.charCodeAt(0) == 52) &&
    last.indexOf("-") < 0;

  if (isChoice) {
    if (action.charAt(0) != "-") return false;
    const body = action.substring(1);
    const kind = last.charCodeAt(0) - 48;
    const offerBody = last.substring(1);
    if (kind == 3) return body.length == 1 && offerBody.indexOf(body) >= 0;
    if (body.length != 2) return false;
    const g1 = offerBody.substring(0, 2);
    const g2 = offerBody.substring(2, 4);
    return sameMultiset(body, g1) || sameMultiset(body, g2);
  }

  const kind = action.charCodeAt(0) - 48;
  if (kind < 1 || kind > 4) return false;
  if (action.length - 1 != kind) return false;

  const used = markUsedActions(history, selfIsFirst);
  if (unchecked(used[kind])) return false;

  return bodyInCards(cards, action.substring(1));
}

// ─── 兜底行动 ────────────────────────────────────────────────

// Fix5: 末尾不再无条件返回已用行动
function fallbackAction(cards: string, history: Array<string>, selfIsFirst: bool): string {
  const used = markUsedActions(history, selfIsFirst);
  if (!unchecked(used[1]) && cards.length >= 1) return "1" + cards.charAt(0);
  if (!unchecked(used[2]) && cards.length >= 2) return "2" + sortedString(cards.substring(0, 2));
  if (!unchecked(used[3]) && cards.length >= 3) return "3" + sortedString(cards.substring(0, 3));
  if (!unchecked(used[4]) && cards.length >= 4) {
    const four = sortedString(cards.substring(0, 4));
    return "4" + canonical4(four.substring(0, 2), four.substring(2, 4));
  }
  // 极端情况：有手牌但不够任何未用行动所需张数
  if (cards.length >= 1) {
    if (!unchecked(used[1])) return "1" + cards.charAt(0);
    if (!unchecked(used[2])) return "2" + cards.charAt(0) + cards.charAt(0);
    if (!unchecked(used[3])) return "3" + cards.charAt(0) + cards.charAt(0) + cards.charAt(0);
    if (!unchecked(used[4])) {
      const c = cards.charAt(0);
      return "4" + canonical4(c + c, c + c);
    }
  }
  return "1A";
}

// ─── 主决策函数 ───────────────────────────────────────────────

function chooseActionForSeat(
  history: Array<string>,
  cards: string,
  board: Int8Array,
  selfIsFirst: bool
): string {
  const known    = getKnownAreas(history, selfIsFirst);
  const selfArea = known[0];
  const oppArea  = known[1];

  const last = history.length > 0 ? history[history.length - 1] : "";
  const isChoice = last.length > 0 &&
    (last.charCodeAt(0) == 51 || last.charCodeAt(0) == 52) &&
    last.indexOf("-") < 0;

  if (isChoice) {
    const body = last.substring(1);
    const kind = last.charCodeAt(0) - 48;
    if (kind == 3) return bestChoiceFor3(body, board, selfArea, oppArea);
    return bestChoiceFor4(body, board, selfArea, oppArea);
  }

  const used = markUsedActions(history, selfIsFirst);
  let bestScore: i32 = -2147483648;
  let bestAction = "";

  // 行动1：密约
  if (!unchecked(used[1]) && cards.length >= 1) {
    const singles = generateSingles(cards);
    for (let i: i32 = 0; i < singles.length; i++) {
      const c = singles[i];
      const idx = charToIndex(c);
      if (idx < 0 || idx >= 7) continue;
      const ns = new Int32Array(7);
      for (let j: i32 = 0; j < 7; j++) ns[j] = selfArea[j];
      ns[idx] += 1;
      const sc = evaluatePosition(ns, oppArea, board);
      if (sc > bestScore) { bestScore = sc; bestAction = "1" + c; }
    }
  }

  // 行动2：取舍
  if (!unchecked(used[2]) && cards.length >= 2) {
    const twos = generateCombos(cards, 2);
    for (let i: i32 = 0; i < twos.length; i++) {
      const twoCards = twos[i];
      const hypOpp = new Int32Array(7);
      for (let j: i32 = 0; j < 7; j++) hypOpp[j] = oppArea[j];
      for (let k: i32 = 0; k < twoCards.length; k++) {
        const idx = charToIndex(twoCards.charAt(k));
        if (idx >= 0 && idx < 7) hypOpp[idx] += 1;
      }
      const ifOppGets = evaluatePosition(selfArea, hypOpp, board);
      const hypSelf = new Int32Array(7);
      for (let j: i32 = 0; j < 7; j++) hypSelf[j] = selfArea[j];
      for (let k: i32 = 0; k < twoCards.length; k++) {
        const idx = charToIndex(twoCards.charAt(k));
        if (idx >= 0 && idx < 7) hypSelf[idx] += 1;
      }
      const ifSelfGets = evaluatePosition(hypSelf, oppArea, board);
      const sc = ifOppGets * (-2) - ifSelfGets;
      if (sc > bestScore) { bestScore = sc; bestAction = "2" + twoCards; }
    }
  }

  // 行动3：赠予（minimax）
  if (!unchecked(used[3]) && cards.length >= 3) {
    const threes = generateCombos(cards, 3);
    for (let i: i32 = 0; i < threes.length; i++) {
      const sc = simulateGiftOppBest(selfArea, oppArea, board, threes[i]);
      if (sc > bestScore) { bestScore = sc; bestAction = "3" + threes[i]; }
    }
  }

  // 行动4：竞争（minimax）
  if (!unchecked(used[4]) && cards.length >= 4) {
    const fours = generateCompetitionPayloads(cards);
    for (let i: i32 = 0; i < fours.length; i++) {
      const sc = simulateCompOppBest(selfArea, oppArea, board, fours[i]);
      if (sc > bestScore) { bestScore = sc; bestAction = "4" + fours[i]; }
    }
  }

  if (bestAction.length > 0) return bestAction;
  return fallbackAction(cards, history, selfIsFirst);
}

// ─── 导出接口 ────────────────────────────────────────────────

export function hanamikoji_action_raw(
  historyStr: string,
  cards: string,
  b0: i32, b1: i32, b2: i32, b3: i32, b4: i32, b5: i32, b6: i32
): string {
  const history = splitHistory(historyStr);
  const board   = buildBoard(b0, b1, b2, b3, b4, b5, b6);

  const last = history.length > 0 ? history[history.length - 1] : "";
  const isChoice = last.length > 0 &&
    (last.charCodeAt(0) == 51 || last.charCodeAt(0) == 52) &&
    last.indexOf("-") < 0;

  const inferred = inferSeat(history, cards.length, isChoice);

  let action = chooseActionForSeat(history, cards, board, inferred);
  if (actionValidForSeat(history, cards, action, inferred)) return action;

  action = chooseActionForSeat(history, cards, board, !inferred);
  if (actionValidForSeat(history, cards, action, !inferred)) return action;

  if (isChoice) {
    const body = last.substring(1);
    const kind = last.charCodeAt(0) - 48;
    if (kind == 3) return "-" + body.charAt(0);
    return "-" + body.substring(0, 2);
  }

  return fallbackAction(cards, history, inferred);
}