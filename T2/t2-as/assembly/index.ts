function charToIndex(ch: string): i32 {
  return ch.charCodeAt(0) - 65; // 'A' -> 0
}

function zero7(): Array<i32> {
  const arr = new Array<i32>(7);
  for (let i: i32 = 0; i < 7; i++) arr[i] = 0;
  return arr;
}

function clone7(src: Array<i32>): Array<i32> {
  const out = new Array<i32>(7);
  for (let i: i32 = 0; i < 7; i++) out[i] = src[i];
  return out;
}

function addLetters(target: Array<i32>, letters: string): void {
  for (let i: i32 = 0; i < letters.length; i++) {
    const c = letters.charAt(i);
    if (c == "X") continue;
    target[charToIndex(c)] += 1;
  }
}

function removeLetters(src: string, used: string): string {
  const cnt = zero7();
  addLetters(cnt, src);

  for (let i: i32 = 0; i < used.length; i++) {
    const c = used.charAt(i);
    if (c == "X") continue;
    cnt[charToIndex(c)] -= 1;
  }

  let out = "";
  for (let i: i32 = 0; i < 7; i++) {
    for (let k: i32 = 0; k < cnt[i]; k++) {
      out += String.fromCharCode(65 + i);
    }
  }
  return out;
}

function sameMultiset(a: string, b: string): bool {
  if (a.length != b.length) return false;

  const ca = zero7();
  const cb = zero7();
  addLetters(ca, a);
  addLetters(cb, b);

  for (let i: i32 = 0; i < 7; i++) {
    if (ca[i] != cb[i]) return false;
  }
  return true;
}

function buildBoard(
  b0: i32,
  b1: i32,
  b2: i32,
  b3: i32,
  b4: i32,
  b5: i32,
  b6: i32,
): Array<i32> {
  const board = new Array<i32>(7);
  board[0] = b0;
  board[1] = b1;
  board[2] = b2;
  board[3] = b3;
  board[4] = b4;
  board[5] = b5;
  board[6] = b6;
  return board;
}

function updateBoard(
  selfArea: Array<i32>,
  oppArea: Array<i32>,
  board: Array<i32>,
): Array<i32> {
  const next = clone7(board);
  for (let i: i32 = 0; i < 7; i++) {
    if (selfArea[i] > oppArea[i]) next[i] = 1;
    else if (selfArea[i] < oppArea[i]) next[i] = -1;
    // 相等则保持原 board 不变
  }
  return next;
}

function actorIsSelf(actionIndex: i32, selfIsFirst: bool): bool {
  return selfIsFirst ? (actionIndex % 2 == 0) : (actionIndex % 2 == 1);
}

function applyToken(
  token: string,
  actorSelf: bool,
  selfArea: Array<i32>,
  oppArea: Array<i32>,
): void {
  if (token.length == 0) return;

  const kind = token.charCodeAt(0) - 48; // '1'..'4'
  const dash = token.indexOf("-");
  const body = dash >= 0 ? token.substring(1, dash) : token.substring(1);
  const choice = dash >= 0 ? token.substring(dash + 1) : "";

  // 1X / 1A：进入行动者自己的区域
  if (kind == 1) {
    if (actorSelf) addLetters(selfArea, body);
    else addLetters(oppArea, body);
    return;
  }

  // 2XX / 2BC：弃掉，不进任何区域
  if (kind == 2) {
    return;
  }

  // 3BCC-C：提供者出 body，被选的是 choice，剩下的归提供者
  if (kind == 3) {
    if (choice.length == 0) return; // 不完整记录时不结算
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

  // 4ACBD-BD：body 前两张为一组，后两张为一组；choice 是被对手拿走的一组
  if (kind == 4) {
    if (choice.length == 0) return; // 不完整记录时不结算

    const g1 = body.substring(0, 2);
    const g2 = body.substring(2, 4);

    const chosen = sameMultiset(g1, choice) ? g1 : g2;
    const other = sameMultiset(g1, choice) ? g2 : g1;

    if (actorSelf) {
      addLetters(oppArea, chosen);
      addLetters(selfArea, other);
    } else {
      addLetters(selfArea, chosen);
      addLetters(oppArea, other);
    }
    return;
  }
}

function splitHistory(history: string): Array<string> {
  if (history.length == 0) return new Array<string>();
  return history.split(" ");
}

/**
 * 原始 Wasm 接口：
 * - history: 字符串
 * - b0..b6: board 的七个元素
 * - selfIsFirst: 1 表示第 0/2/4/6 条是我方动作；0 表示第 1/3/5/7 条是我方动作
 * 返回长度 21 的扁平数组：
 * [self(7), opp(7), nextBoard(7)]
 */
export function calc_current_state_raw(
  history: string,
  b0: i32,
  b1: i32,
  b2: i32,
  b3: i32,
  b4: i32,
  b5: i32,
  b6: i32,
  selfIsFirst: i32 = 1,
): Array<i32> {
  const selfArea = zero7();
  const oppArea = zero7();
  const tokens = splitHistory(history);

  for (let i: i32 = 0; i < tokens.length; i++) {
    applyToken(tokens[i], actorIsSelf(i, selfIsFirst == 1), selfArea, oppArea);
  }

  const board = buildBoard(b0, b1, b2, b3, b4, b5, b6);
  const nextBoard = updateBoard(selfArea, oppArea, board);

  const flat = new Array<i32>(21);
  for (let i: i32 = 0; i < 7; i++) {
    flat[i] = selfArea[i];
    flat[7 + i] = oppArea[i];
    flat[14 + i] = nextBoard[i];
  }
  return flat;
}