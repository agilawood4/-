// Answer by AssemblyScript

export const INT8_ARRAY_ID: u32 = idof<Int8Array>();

const SCORES: i32[] = [2, 2, 2, 3, 3, 4, 5];

function calcScore(board: Int8Array, side: i32): i32 {
  let score: i32 = 0;
  for (let i: i32 = 0; i < 7; i++) {
    if (board[i] == side) score += SCORES[i];
  }
  return score;
}

function countMarks(board: Int8Array, side: i32): i32 {
  let count: i32 = 0;
  for (let i: i32 = 0; i < 7; i++) {
    if (board[i] == side) count++;
  }
  return count;
}

function sideHasAny(board: Int8Array, side: i32, a: i32, b: i32): bool {
  for (let i: i32 = a; i <= b; i++) {
    if (board[i] == side) return true;
  }
  return false;
}

export function hanamikoji_judge(board: Int8Array, round: i32): i32 {
  const selfScore = calcScore(board, 1);
  const oppScore = calcScore(board, -1);
  const selfMarks = countMarks(board, 1);
  const oppMarks = countMarks(board, -1);

  if (selfScore >= 11) return 1;
  if (oppScore >= 11) return -1;

  if (selfMarks >= 4 && oppScore < 11) return 1;
  if (oppMarks >= 4 && selfScore < 11) return -1;

  if (round < 3) return 0;

  if (selfScore > oppScore) return 1;
  if (oppScore > selfScore) return -1;

  if (board[6] == 1) return 1;
  if (board[6] == -1) return -1;

  if (board[5] == 1) return 1;
  if (board[5] == -1) return -1;

  const selfDE = sideHasAny(board, 1, 3, 4);
  const oppDE = sideHasAny(board, -1, 3, 4);
  if (selfDE != oppDE) return selfDE ? 1 : -1;

  const selfABC = sideHasAny(board, 1, 0, 2);
  const oppABC = sideHasAny(board, -1, 0, 2);
  if (selfABC != oppABC) return selfABC ? 1 : -1;

  return 2;
}