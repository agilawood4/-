const SCORES: i32[] = [2, 2, 2, 3, 3, 4, 5];

function isCardChar(ch: string): bool {
  if (ch.length == 0) return false;
  const code = ch.charCodeAt(0);
  return code >= 65 && code <= 71;
}

function charToIndex(ch: string): i32 {
  if (!isCardChar(ch)) return -1;
  return ch.charCodeAt(0) - 65;
}

function idxToChar(idx: i32): string {
  if (idx < 0 || idx >= 7) return "";
  return String.fromCharCode(65 + idx);
}

function splitHistory(history: string): Array<string> {
  if (history.length == 0) return new Array<string>();
  return history.split(" ");
}

function addLetters(target: Int32Array, letters: string): void {
  for (let i: i32 = 0; i < letters.length; i++) {
    const c = letters.charAt(i);
    if (c == "X") continue;
    const idx = charToIndex(c);
    if (idx >= 0) target[idx] += 1;
  }
}

function removeLetters(src: string, used: string): string {
  const cnt = new Int32Array(7);
  addLetters(cnt, src);
  for (let i: i32 = 0; i < used.length; i++) {
    const c = used.charAt(i);
    if (c == "X") continue;
    const idx = charToIndex(c);
    if (idx >= 0) cnt[idx] -= 1;
  }

  let out = "";
  for (let i: i32 = 0; i < 7; i++) {
    if (cnt[i] <= 0) continue;
    for (let k: i32 = 0; k < cnt[i]; k++) out += idxToChar(i);
  }
  return out;
}

function sortedString(s: string): string {
  const cnt = new Int32Array(7);
  addLetters(cnt, s);
  let out = "";
  for (let i: i32 = 0; i < 7; i++) {
    for (let k: i32 = 0; k < cnt[i]; k++) out += idxToChar(i);
  }
  return out;
}

function sameMultiset(a: string, b: string): bool {
  return sortedString(a) == sortedString(b);
}

function tokenizeCards(cards: string): Array<string> {
  const out = new Array<string>();
  for (let i: i32 = 0; i < cards.length; i++) {
    const c = cards.charAt(i);
    if (isCardChar(c)) out.push(c);
  }
  return out;
}

function buildBoard(
  b0: i32, b1: i32, b2: i32, b3: i32, b4: i32, b5: i32, b6: i32
): Int8Array {
  const board = new Int8Array(7);
  board[0] = <i8>b0;
  board[1] = <i8>b1;
  board[2] = <i8>b2;
  board[3] = <i8>b3;
  board[4] = <i8>b4;
  board[5] = <i8>b5;
  board[6] = <i8>b6;
  return board;
}

function isActionToken(token: string): bool {
  if (token.length == 0) return false;
  const c = token.charCodeAt(0);
  return c >= 49 && c <= 52;
}

function actionKind(token: string): i32 {
  if (!isActionToken(token)) return 0;
  return token.charCodeAt(0) - 48;
}

function normalizeChoice(s: string): string {
  let body = s;
  if (body.length > 0 && body.charAt(0) == "-") body = body.substring(1);
  if (body.length == 0 || body.length > 2) return "";
  for (let i: i32 = 0; i < body.length; i++) {
    if (!isCardChar(body.charAt(i))) return "";
  }
  return sortedString(body);
}

class ParsedState {
  selfArea: Int32Array;
  oppArea: Int32Array;
  used: Uint8Array;
  ownActions: i32;
  ownConsumed: i32;
  pending: bool;
  pendingKind: i32;
  pendingBody: string;
  pendingActor: i32;
  actorToMove: i32;
  responder: i32;

  constructor() {
    this.selfArea = new Int32Array(7);
    this.oppArea = new Int32Array(7);
    this.used = new Uint8Array(5);
    this.ownActions = 0;
    this.ownConsumed = 0;
    this.pending = false;
    this.pendingKind = 0;
    this.pendingBody = "";
    this.pendingActor = -1;
    this.actorToMove = 0;
    this.responder = -1;
  }
}

function applyResolvedOffer(
  kind: i32,
  body: string,
  choice: string,
  actorSelf: bool,
  selfArea: Int32Array,
  oppArea: Int32Array
): void {
  if (kind == 3) {
    if (choice.length != 1) return;
    const rest = removeLetters(body, choice);
    if (actorSelf) {
      addLetters(oppArea, choice);
      addLetters(selfArea, rest);
    } else {
      addLetters(selfArea, choice);
      addLetters(oppArea, rest);
    }
    return;
  }

  if (kind == 4) {
    if (body.length < 4 || choice.length != 2) return;
    const g1 = sortedString(body.substring(0, 2));
    const g2 = sortedString(body.substring(2, 4));

    let chosen = "";
    let other = "";
    if (sameMultiset(choice, g1)) {
      chosen = g1;
      other = g2;
    } else if (sameMultiset(choice, g2)) {
      chosen = g2;
      other = g1;
    } else {
      return;
    }

    if (actorSelf) {
      addLetters(oppArea, chosen);
      addLetters(selfArea, other);
    } else {
      addLetters(selfArea, chosen);
      addLetters(oppArea, other);
    }
  }
}

function parseHistory(history: Array<string>, selfIsFirst: bool): ParsedState {
  const st = new ParsedState();
  const selfPlayer = selfIsFirst ? 0 : 1;
  let currentActor: i32 = 0;

  for (let i: i32 = 0; i < history.length; i++) {
    const token = history[i];
    if (!isActionToken(token)) continue;

    const kind = actionKind(token);
    const dash = token.indexOf("-");
    const body = dash >= 0 ? token.substring(1, dash) : token.substring(1);
    const choice = dash >= 0 ? normalizeChoice(token.substring(dash + 1)) : "";
    const actorSelf = currentActor == selfPlayer;

    if (actorSelf) {
      st.used[kind] = 1;
      st.ownActions += 1;
      st.ownConsumed += kind;
    }

    if (kind == 1) {
      if (body.indexOf("X") < 0) {
        if (actorSelf) addLetters(st.selfArea, body);
        else addLetters(st.oppArea, body);
      }
      currentActor = 1 - currentActor;
      continue;
    }

    if (kind == 2) {
      currentActor = 1 - currentActor;
      continue;
    }

    if (dash >= 0) {
      applyResolvedOffer(kind, body, choice, actorSelf, st.selfArea, st.oppArea);
      currentActor = 1 - currentActor;
    } else {
      st.pending = true;
      st.pendingKind = kind;
      st.pendingBody = body;
      st.pendingActor = currentActor;
      st.responder = 1 - currentActor;
      st.actorToMove = st.responder;
      return st;
    }
  }

  st.actorToMove = currentActor;
  return st;
}

function bodyInCards(cards: string, body: string): bool {
  const cnt = new Int32Array(7);
  addLetters(cnt, cards);
  for (let i: i32 = 0; i < body.length; i++) {
    const idx = charToIndex(body.charAt(i));
    if (idx < 0) return false;
    cnt[idx] -= 1;
    if (cnt[idx] < 0) return false;
  }
  return true;
}

function expectedCardsLen(st: ParsedState, selfIsFirst: bool): i32 {
  const selfPlayer = selfIsFirst ? 0 : 1;
  if (st.pending) {
    if (st.responder == selfPlayer) return 6 + st.ownActions - st.ownConsumed;
    return -1000;
  }
  if (st.actorToMove == selfPlayer) return 6 + st.ownActions - st.ownConsumed + 1;
  return -1000;
}

function inferSeat(history: Array<string>, cardsLen: i32): bool {
  const first = parseHistory(history, true);
  const second = parseHistory(history, false);

  const e1 = expectedCardsLen(first, true);
  const e2 = expectedCardsLen(second, false);
  const ok1 = e1 == cardsLen;
  const ok2 = e2 == cardsLen;

  if (ok1 && !ok2) return true;
  if (ok2 && !ok1) return false;
  if (ok1 && ok2) {
    if (first.pending && !second.pending) return true;
    if (second.pending && !first.pending) return false;
  }
  return true;
}

function evaluatePosition(selfArea: Int32Array, oppArea: Int32Array, board: Int8Array): i32 {
  let myScore: i32 = 0;
  let oppScore: i32 = 0;
  let myCnt: i32 = 0;
  let oppCnt: i32 = 0;
  let bonus: i32 = 0;

  for (let i: i32 = 0; i < 7; i++) {
    const diff = selfArea[i] - oppArea[i];
    const sc = SCORES[i];
    if (diff > 0) {
      myScore += sc;
      myCnt += 1;
      bonus += diff * sc * 3;
    } else if (diff < 0) {
      oppScore += sc;
      oppCnt += 1;
      bonus += diff * sc * 3;
    } else {
      if (board[i] == 1) {
        myScore += sc;
        myCnt += 1;
      } else if (board[i] == -1) {
        oppScore += sc;
        oppCnt += 1;
      }
    }
  }

  let val = (myScore - oppScore) * 30 + (myCnt - oppCnt) * 60 + bonus;
  if (myScore >= 11) val += 100000;
  if (oppScore >= 11) val -= 100000;
  if (myCnt >= 4 && oppScore < 11) val += 80000;
  if (oppCnt >= 4 && myScore < 11) val -= 80000;
  return val;
}

function buildHandCount(cards: string): Int32Array {
  const cnt = new Int32Array(7);
  addLetters(cnt, cards);
  return cnt;
}

function cardWeight(
  idx: i32,
  board: Int8Array,
  selfArea: Int32Array,
  oppArea: Int32Array,
  handCount: Int32Array
): i32 {
  if (idx < 0 || idx >= 7) return -1000000;

  let w = SCORES[idx] * 20;
  const diff = selfArea[idx] - oppArea[idx];

  if (board[idx] == -1) w += 16;
  else if (board[idx] == 0) w += 10;
  else w += 6;

  if (diff <= 0) w += 10;
  else if (diff == 1) w += 4;

  if (handCount[idx] >= 2) w += 3;
  if (handCount[idx] >= 3) w += 3;
  return w;
}

function weightOfLetters(
  letters: string,
  board: Int8Array,
  selfArea: Int32Array,
  oppArea: Int32Array,
  handCount: Int32Array
): i32 {
  let total: i32 = 0;
  for (let i: i32 = 0; i < letters.length; i++) {
    const idx = charToIndex(letters.charAt(i));
    if (idx >= 0) total += cardWeight(idx, board, selfArea, oppArea, handCount);
  }
  return total;
}

function bestChoiceFor3(
  body: string,
  board: Int8Array,
  selfArea: Int32Array,
  oppArea: Int32Array,
  handCount: Int32Array
): string {
  let best = "";
  let bestScore: i32 = -2147483648;

  for (let i: i32 = 0; i < body.length; i++) {
    const c = body.charAt(i);
    const idx = charToIndex(c);
    if (idx < 0) continue;

    const ns = new Int32Array(7);
    const no = new Int32Array(7);
    for (let j: i32 = 0; j < 7; j++) {
      ns[j] = selfArea[j];
      no[j] = oppArea[j];
    }
    ns[idx] += 1;
    const rest = removeLetters(body, c);
    addLetters(no, rest);

    let sc = evaluatePosition(ns, no, board);
    sc += cardWeight(idx, board, selfArea, oppArea, handCount);
    if (sc > bestScore) {
      bestScore = sc;
      best = c;
    }
  }

  if (best.length == 0) return "-A";
  return "-" + best;
}

function bestChoiceFor4(
  body: string,
  board: Int8Array,
  selfArea: Int32Array,
  oppArea: Int32Array,
  handCount: Int32Array
): string {
  if (body.length < 4) return "-AB";
  const g1 = sortedString(body.substring(0, 2));
  const g2 = sortedString(body.substring(2, 4));

  const ns1 = new Int32Array(7);
  const no1 = new Int32Array(7);
  const ns2 = new Int32Array(7);
  const no2 = new Int32Array(7);
  for (let j: i32 = 0; j < 7; j++) {
    ns1[j] = selfArea[j]; no1[j] = oppArea[j];
    ns2[j] = selfArea[j]; no2[j] = oppArea[j];
  }
  addLetters(ns1, g1); addLetters(no1, g2);
  addLetters(ns2, g2); addLetters(no2, g1);

  let s1 = evaluatePosition(ns1, no1, board) + weightOfLetters(g1, board, selfArea, oppArea, handCount);
  let s2 = evaluatePosition(ns2, no2, board) + weightOfLetters(g2, board, selfArea, oppArea, handCount);
  return s1 >= s2 ? "-" + g1 : "-" + g2;
}

function containsString(arr: Array<string>, value: string): bool {
  for (let i: i32 = 0; i < arr.length; i++) {
    if (arr[i] == value) return true;
  }
  return false;
}

function uniquePush(out: Array<string>, value: string): void {
  if (!containsString(out, value)) out.push(value);
}

function generateSingles(cards: string): Array<string> {
  const out = new Array<string>();
  for (let i: i32 = 0; i < cards.length; i++) {
    const c = cards.charAt(i);
    if (isCardChar(c)) uniquePush(out, c);
  }
  return out;
}

function generateCombos(cards: string, take: i32): Array<string> {
  const arr = tokenizeCards(cards);
  const n = arr.length;
  const out = new Array<string>();

  if (take == 2) {
    for (let i: i32 = 0; i < n; i++) {
      for (let j: i32 = i + 1; j < n; j++) {
        uniquePush(out, sortedString(arr[i] + arr[j]));
      }
    }
  } else if (take == 3) {
    for (let i: i32 = 0; i < n; i++) {
      for (let j: i32 = i + 1; j < n; j++) {
        for (let k: i32 = j + 1; k < n; k++) {
          uniquePush(out, sortedString(arr[i] + arr[j] + arr[k]));
        }
      }
    }
  } else if (take == 4) {
    for (let i: i32 = 0; i < n; i++) {
      for (let j: i32 = i + 1; j < n; j++) {
        for (let k: i32 = j + 1; k < n; k++) {
          for (let t: i32 = k + 1; t < n; t++) {
            uniquePush(out, sortedString(arr[i] + arr[j] + arr[k] + arr[t]));
          }
        }
      }
    }
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
    if (z.length != 4) continue;
    const a = z.charAt(0), b = z.charAt(1), c = z.charAt(2), d = z.charAt(3);
    uniquePush(out, canonical4(a + b, c + d));
    uniquePush(out, canonical4(a + c, b + d));
    uniquePush(out, canonical4(a + d, b + c));
  }
  return out;
}

function evaluateSingle(
  card: string,
  board: Int8Array,
  selfArea: Int32Array,
  oppArea: Int32Array,
  handCount: Int32Array
): i32 {
  return cardWeight(charToIndex(card), board, selfArea, oppArea, handCount) + 8;
}

function evaluateDiscard(
  two: string,
  board: Int8Array,
  selfArea: Int32Array,
  oppArea: Int32Array,
  handCount: Int32Array
): i32 {
  return 120 - weightOfLetters(two, board, selfArea, oppArea, handCount);
}

function simulateGiftOppBest(
  three: string,
  board: Int8Array,
  selfArea: Int32Array,
  oppArea: Int32Array
): i32 {
  let worst: i32 = 2147483647;
  for (let i: i32 = 0; i < three.length; i++) {
    const c = three.charAt(i);
    const idx = charToIndex(c);
    if (idx < 0) continue;

    const ns = new Int32Array(7);
    const no = new Int32Array(7);
    for (let j: i32 = 0; j < 7; j++) {
      ns[j] = selfArea[j];
      no[j] = oppArea[j];
    }
    no[idx] += 1;
    const rest = removeLetters(three, c);
    addLetters(ns, rest);

    const sc = evaluatePosition(ns, no, board);
    if (sc < worst) worst = sc;
  }
  return worst;
}

function simulateCompOppBest(
  payload: string,
  board: Int8Array,
  selfArea: Int32Array,
  oppArea: Int32Array
): i32 {
  const g1 = payload.substring(0, 2);
  const g2 = payload.substring(2, 4);

  const ns1 = new Int32Array(7);
  const no1 = new Int32Array(7);
  const ns2 = new Int32Array(7);
  const no2 = new Int32Array(7);
  for (let j: i32 = 0; j < 7; j++) {
    ns1[j] = selfArea[j]; no1[j] = oppArea[j];
    ns2[j] = selfArea[j]; no2[j] = oppArea[j];
  }
  addLetters(no1, g1); addLetters(ns1, g2);
  addLetters(no2, g2); addLetters(ns2, g1);

  const sc1 = evaluatePosition(ns1, no1, board);
  const sc2 = evaluatePosition(ns2, no2, board);
  return sc1 < sc2 ? sc1 : sc2;
}

function actionValidForSeat(
  history: Array<string>,
  cards: string,
  action: string,
  selfIsFirst: bool
): bool {
  if (action.length == 0) return false;
  const st = parseHistory(history, selfIsFirst);
  const selfPlayer = selfIsFirst ? 0 : 1;

  if (st.pending) {
    if (st.responder != selfPlayer) return false;
    if (action.charAt(0) != '-') return false;
    const body = normalizeChoice(action.substring(1));
    if (st.pendingKind == 3) return body.length == 1 && st.pendingBody.indexOf(body) >= 0;
    if (st.pendingKind == 4) {
      if (st.pendingBody.length < 4 || body.length != 2) return false;
      const g1 = sortedString(st.pendingBody.substring(0, 2));
      const g2 = sortedString(st.pendingBody.substring(2, 4));
      return sameMultiset(body, g1) || sameMultiset(body, g2);
    }
    return false;
  }

  if (st.actorToMove != selfPlayer) return false;
  const kind = action.charCodeAt(0) - 48;
  if (kind < 1 || kind > 4) return false;
  if (action.length - 1 != kind) return false;
  if (st.used[kind] != 0) return false;
  return bodyInCards(cards, action.substring(1));
}

function fallbackAction(cards: string, used: Uint8Array): string {
  if (used[1] == 0 && cards.length >= 1) return "1" + cards.charAt(0);
  if (used[2] == 0 && cards.length >= 2) return "2" + sortedString(cards.substring(0, 2));
  if (used[3] == 0 && cards.length >= 3) return "3" + sortedString(cards.substring(0, 3));
  if (used[4] == 0 && cards.length >= 4) {
    const four = sortedString(cards.substring(0, 4));
    return "4" + canonical4(four.substring(0, 2), four.substring(2, 4));
  }
  if (cards.length >= 1 && used[1] == 0) return "1" + cards.charAt(0);
  return "1A";
}

function chooseActionForSeat(
  history: Array<string>,
  cards: string,
  board: Int8Array,
  selfIsFirst: bool
): string {
  const st = parseHistory(history, selfIsFirst);
  const selfArea = st.selfArea;
  const oppArea = st.oppArea;
  const handCount = buildHandCount(cards);
  const selfPlayer = selfIsFirst ? 0 : 1;

  if (st.pending) {
    if (st.responder != selfPlayer) return "";
    if (st.pendingKind == 3) return bestChoiceFor3(st.pendingBody, board, selfArea, oppArea, handCount);
    if (st.pendingKind == 4) return bestChoiceFor4(st.pendingBody, board, selfArea, oppArea, handCount);
    return "";
  }

  if (st.actorToMove != selfPlayer) return "";

  let bestScore: i32 = -2147483648;
  let bestAction = "";

  if (st.used[1] == 0) {
    const singles = generateSingles(cards);
    for (let i: i32 = 0; i < singles.length; i++) {
      const c = singles[i];
      const score = evaluateSingle(c, board, selfArea, oppArea, handCount);
      if (score > bestScore) {
        bestScore = score;
        bestAction = "1" + c;
      }
    }
  }

  if (st.used[2] == 0 && cards.length >= 2) {
    const twos = generateCombos(cards, 2);
    for (let i: i32 = 0; i < twos.length; i++) {
      const s = twos[i];
      const score = evaluateDiscard(s, board, selfArea, oppArea, handCount);
      if (score > bestScore) {
        bestScore = score;
        bestAction = "2" + s;
      }
    }
  }

  if (st.used[3] == 0 && cards.length >= 3) {
    const threes = generateCombos(cards, 3);
    for (let i: i32 = 0; i < threes.length; i++) {
      const s = threes[i];
      const score = simulateGiftOppBest(s, board, selfArea, oppArea);
      if (score > bestScore) {
        bestScore = score;
        bestAction = "3" + s;
      }
    }
  }

  if (st.used[4] == 0 && cards.length >= 4) {
    const fours = generateCompetitionPayloads(cards);
    for (let i: i32 = 0; i < fours.length; i++) {
      const p = fours[i];
      const score = simulateCompOppBest(p, board, selfArea, oppArea);
      if (score > bestScore) {
        bestScore = score;
        bestAction = "4" + p;
      }
    }
  }

  if (bestAction.length > 0) return bestAction;
  return fallbackAction(cards, st.used);
}

export function hanamikoji_action_raw(
  historyStr: string,
  cards: string,
  b0: i32, b1: i32, b2: i32, b3: i32, b4: i32, b5: i32, b6: i32
): string {
  const history = splitHistory(historyStr);
  const board = buildBoard(b0, b1, b2, b3, b4, b5, b6);

  const inferred = inferSeat(history, cards.length);

  let action = chooseActionForSeat(history, cards, board, inferred);
  if (actionValidForSeat(history, cards, action, inferred)) return action;

  action = chooseActionForSeat(history, cards, board, !inferred);
  if (actionValidForSeat(history, cards, action, !inferred)) return action;

  const st = parseHistory(history, inferred);
  if (st.pending) {
    if (st.pendingKind == 3 && st.pendingBody.length >= 1) return "-" + st.pendingBody.charAt(0);
    if (st.pendingKind == 4 && st.pendingBody.length >= 2) return "-" + sortedString(st.pendingBody.substring(0, 2));
  }

  return fallbackAction(cards, st.used);
}
