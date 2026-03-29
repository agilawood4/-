// ============================================================
// T2 功能测试：calc_current_state
// 运行命令：node my_test.js（在 /T2 目录下）
//
// 约定：selfIsFirst=1（默认），即 history 中
//   index=0,2,4,6 是我方（P1）行动
//   index=1,3,5,7 是对手（P2）行动
//
// 行动3/4 的 token 格式（响应已合并入同一 token）：
//   "3BCC-C"  = 提供者出 BCC，另一方选 C（合并为一条）
//   "4ABEG-AB"= 提供者出 ABEG(g1=AB,g2=EG)，另一方选 AB
//
// 输出格式（长度21扁平数组）：
//   [0..6]   selfArea   己方场面各牌数 A-G
//   [7..13]  oppArea    对手场面各牌数 A-G
//   [14..20] nextBoard  本轮结算后倾心标记
// ============================================================

import { calc_current_state } from "./t2-as/build/release.js";

let passed = 0;
let failed = 0;

function flat(raw) {
  if (Array.isArray(raw[0])) return [...raw[0], ...raw[1], ...raw[2]];
  return Array.from(raw);
}

function check(desc, history, board, expSelf, expOpp, expBoard) {
  let raw;
  try {
    raw = calc_current_state(history, Int8Array.from(board));
  } catch (e) {
    console.log(`  ❌ FAIL  ${desc}`);
    console.log(`           exception: ${e.message}`);
    failed++;
    return;
  }
  const r = flat(raw);
  const self   = r.slice(0, 7);
  const opp    = r.slice(7, 14);
  const board2 = r.slice(14, 21);
  const selfOk  = expSelf.every((v, i) => v === self[i]);
  const oppOk   = expOpp.every((v, i)  => v === opp[i]);
  const boardOk = expBoard.every((v, i) => v === board2[i]);
  if (selfOk && oppOk && boardOk) {
    console.log(`  ✅ PASS  ${desc}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL  ${desc}`);
    console.log(`           history="${history}"  board=${JSON.stringify(board)}`);
    if (!selfOk)  console.log(`           self:  got=${JSON.stringify(self)}  exp=${JSON.stringify(expSelf)}`);
    if (!oppOk)   console.log(`           opp:   got=${JSON.stringify(opp)}   exp=${JSON.stringify(expOpp)}`);
    if (!boardOk) console.log(`           board: got=${JSON.stringify(board2)} exp=${JSON.stringify(expBoard)}`);
    failed++;
  }
}

const Z = [0,0,0,0,0,0,0];

// ─────────────────────────────────────────────────────────────
console.log("【1】空历史，场面为全零，board 不变");
// ─────────────────────────────────────────────────────────────

check("空历史，初始board全0",
  "", Z,  Z, Z, Z);

check("空历史，初始board有历史记录",
  "", [1,0,0,0,0,0,-1],
  Z, Z, [1,0,0,0,0,0,-1]);

// ─────────────────────────────────────────────────────────────
console.log("\n【2】只含密约行动（行动1）");
// ─────────────────────────────────────────────────────────────

// index=0 我方密约E，index=1 对手密约X不计
check("P1密约E，P2密约未知(1X)",
  "1E 1X", Z,
  [0,0,0,0,1,0,0], Z, [0,0,0,0,1,0,0]);

// index=0 我方密约G → self[G]+1；index=1 对手密约F → opp[F]+1
// nextBoard: F→-1(opp=1>self=0), G→1(self=1>opp=0)
check("P1密约G，P2密约F",
  "1G 1F", Z,
  [0,0,0,0,0,0,1], [0,0,0,0,0,1,0], [0,0,0,0,0,-1,1]);

// ─────────────────────────────────────────────────────────────
console.log("\n【3】只含取舍行动（行动2），双方区域不变");
// ─────────────────────────────────────────────────────────────

check("P1取舍GG，P2取舍FF，全零board",
  "2GG 2FF", Z,  Z, Z, Z);

check("取舍行动不改变已有board",
  "2GG 2FF", [1,0,0,0,0,0,-1],
  Z, Z, [1,0,0,0,0,0,-1]);

// ─────────────────────────────────────────────────────────────
console.log("\n【4】赠予行动（行动3）");
// 规则：actorSelf 提供 body，另一方选 choice
//   actorSelf=true:  opp+=choice, self+=rest
//   actorSelf=false: self+=choice, opp+=rest
// ─────────────────────────────────────────────────────────────

// index=0 我方(actorSelf=true)提供BCC，对手选C
// opp+=C(1), self+=rest(BC)
// self: B=1,C=1; opp: C=1
// nextBoard: B→1(1>0), C平(1=1)→0
check("P1赠予BCC，P2选C",
  "3BCC-C", Z,
  [0,1,1,0,0,0,0], [0,0,1,0,0,0,0], [0,1,0,0,0,0,0]);

// index=0 我方(actorSelf=true)提供EEG，对手选E
// opp+=E(1), self+=rest(EG)
// self: E=1,G=1; opp: E=1
// nextBoard: E平(1=1)→0, G→1(1>0)
check("P1赠予EEG，P2选E",
  "3EEG-E", Z,
  [0,0,0,0,1,0,1], [0,0,0,0,1,0,0], [0,0,0,0,0,0,1]);

// index=0 我方(actorSelf=true)提供AFF，对手选F
// opp+=F(1), self+=rest(AF)
// self: A=1,F=1; opp: F=1
// nextBoard: A→1(1>0), F平(1=1)→0
check("P1赠予AFF，P2选F",
  "3AFF-F", Z,
  [1,0,0,0,0,1,0], [0,0,0,0,0,1,0], [1,0,0,0,0,0,0]);

// ─────────────────────────────────────────────────────────────
console.log("\n【5】竞争行动（行动4）");
// 规则：actorSelf 提供 body(g1=前2,g2=后2)，另一方选 choice
//   actorSelf=true:  opp+=chosen, self+=other
//   actorSelf=false: self+=chosen, opp+=other
// ─────────────────────────────────────────────────────────────

// index=0 我方(actorSelf=true)提供ABEG(g1=AB,g2=EG)，对手选AB
// opp+=AB, self+=EG
// self: E=1,G=1; opp: A=1,B=1
// nextBoard: A→-1(0<1), B→-1(0<1), E→1(1>0), G→1(1>0)
check("P1竞争ABEG，P2选AB",
  "4ABEG-AB", Z,
  [0,0,0,0,1,0,1], [1,1,0,0,0,0,0], [-1,-1,0,0,1,0,1]);

// index=0 我方(actorSelf=true)提供BCDD(g1=BC,g2=DD)，对手选DD
// opp+=DD, self+=BC
// self: B=1,C=1; opp: D=2
// nextBoard: B→1(1>0), C→1(1>0), D→-1(0<2)
check("P1竞争BCDD，P2选DD",
  "4BCDD-DD", Z,
  [0,1,1,0,0,0,0], [0,0,0,2,0,0,0], [0,1,1,-1,0,0,0]);

// index=0 我方密约G，index=1 对手(actorSelf=false)提供ABCD(g1=AB,g2=CD)，我方选AB
// self+=AB, opp+=CD
// self: G=1,A=1,B=1; opp: C=1,D=1
// nextBoard: A→1(1>0), B→1(1>0), C→-1(0<1), D→-1(0<1), G→1(1>0)
check("P1密约G，P2竞争ABCD，P1选AB",
  "1G 4ABCD-AB", Z,
  [1,1,0,0,0,0,1], [0,0,1,1,0,0,0], [1,1,-1,-1,0,0,1]);

// ─────────────────────────────────────────────────────────────
console.log("\n【6】README 完整示例（一小轮完整对局）");
// 逐条追踪（selfIsFirst=1）：
// [0] 2GG  我方取舍 → 丢弃
// [1] 2FF  对手取舍 → 丢弃
// [2] 1D   我方密约D    → self[D]+=1
// [3] 3EEG-E 对手提供(actorSelf=false)，我方选E
//            self+=E(1), opp+=rest(EG)
// [4] 3AFF-F 我方提供(actorSelf=true)，对手选F
//            opp+=F(1), self+=rest(AF)
// [5] 1C   对手密约C    → opp[C]+=1
// [6] 4ABEG-AB 我方提供(actorSelf=true,g1=AB,g2=EG)，对手选AB
//              opp+=AB, self+=EG
// [7] 4BCDD-DD 对手提供(actorSelf=false,g1=BC,g2=DD)，我方选DD
//              self+=DD, opp+=BC
//
// self 汇总: D:1 + E:1 + A:1,F:1 + E:1,G:1 + D:2
//          = A:1, D:3, E:2, F:1, G:1  → [1,0,0,3,2,1,1]
// opp  汇总: E:1,G:1 + F:1 + C:1 + A:1,B:1 + B:1,C:1
//          = A:1, B:2, C:2, E:1, F:1, G:1  → [1,2,2,0,1,1,1]
// nextBoard: A(1=1)→0, B(0<2)→-1, C(0<2)→-1, D(3>0)→1,
//            E(2>1)→1, F(1=1)→0, G(1=1)→0  → [0,-1,-1,1,1,0,0]
// ─────────────────────────────────────────────────────────────

check("README完整示例（board初始全0）",
  "2GG 2FF 1D 3EEG-E 3AFF-F 1C 4ABEG-AB 4BCDD-DD", Z,
  [1,0,0,3,2,1,1],
  [1,2,2,0,1,1,1],
  [0,-1,-1,1,1,0,0]);

// ─────────────────────────────────────────────────────────────
console.log("\n【7】board有上一轮历史记录");
// ─────────────────────────────────────────────────────────────

// index=0 我方密约G，index=1 对手密约F
// self: G=1; opp: F=1
// board=[0,0,0,0,0,1,0]（F原归我方）
// nextBoard: F(self=0<opp=1)→-1(翻转！), G(self=1>opp=0)→1
check("上一轮我赢F，本轮P1密约G，P2密约F（F归属翻转）",
  "1G 1F", [0,0,0,0,0,1,0],
  [0,0,0,0,0,0,1], [0,0,0,0,0,1,0], [0,0,0,0,0,-1,1]);

// index=0 我方密约D，index=1 对手密约E
// self: D=1; opp: E=1
// board=[0,0,0,0,0,1,-1]（F我方，G对手）
// nextBoard: D→1(1>0), E→-1(0<1), F平手保持1, G平手保持-1
check("上一轮我赢F对手赢G，本轮密约D和E",
  "1D 1E", [0,0,0,0,0,1,-1],
  [0,0,0,1,0,0,0], [0,0,0,0,1,0,0], [0,0,0,1,-1,1,-1]);

// ─────────────────────────────────────────────────────────────
console.log("\n【8】含 X 的不完整历史（T3场景）");
// ─────────────────────────────────────────────────────────────

// index=0 我方密约X（不计），index=1 对手密约F
// opp: F=1; nextBoard: F→-1
check("P1密约X，P2密约F",
  "1X 1F", Z,
  Z, [0,0,0,0,0,1,0], [0,0,0,0,0,-1,0]);

// 取舍XX不影响区域，board保持
check("P1取舍XX，P2取舍GG，board不变",
  "2XX 2GG", [1,0,0,0,0,0,-1],
  Z, Z, [1,0,0,0,0,0,-1]);

// ─────────────────────────────────────────────────────────────
console.log("\n【9】不完整记录（3/4无选择部分）不结算");
// ─────────────────────────────────────────────────────────────

check("3BCC 无选择记录，不结算",
  "3BCC", Z,  Z, Z, Z);

check("4ABCD 无选择记录，不结算",
  "4ABCD", Z,  Z, Z, Z);

// ─────────────────────────────────────────────────────────────
console.log("\n========================================");
console.log(`结果：${passed} 通过，${failed} 失败，共 ${passed+failed} 项`);
if (failed === 0) {
  console.log("🎉 All T2 tests passed!");
} else {
  console.log("⚠️  部分测试未通过，请检查实现。");
  process.exit(1);
}