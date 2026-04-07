// ============================================================
// 公平随机对战测试：v1（原版）vs v2（优化版）
// 特点：
// 1. 两个 wasm 独立实例化，避免共享内存污染
// 2. 使用“同一种子、同三轮牌堆、互换先后手”的成对测试
// 3. 统计结果更公平，也更接近真正双循环赛的思路
// 用法：在 /T3 目录下执行 node battle_test.js
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import loader from "@assemblyscript/loader";
import { runSingleMatch, buildMatchRoundDecks } from "./hanamikoji-engine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── 参数 ─────────────────────────────────────────────────────
const PAIRED_MATCHES = 200;     // 成对测试次数；总局数 = 2 * PAIRED_MATCHES
const MAX_MS = 2000;
const MASTER_SEED = 20260406;   // 固定主种子，便于复现
const SHOW_PROGRESS_EVERY = 10;

// ── wasm 独立加载 ───────────────────────────────────────────
function loadWasm(relativePath) {
  const wasmPath = path.join(__dirname, relativePath);
  const wasmBuffer = fs.readFileSync(wasmPath);
  const { exports } = loader.instantiateSync(wasmBuffer, {});

  if (typeof exports.hanamikoji_action_raw !== "function") {
    throw new Error(`❌ ${relativePath} 未导出 hanamikoji_action_raw`);
  }
  if (
    typeof exports.__newString !== "function" ||
    typeof exports.__getString !== "function" ||
    typeof exports.__pin !== "function" ||
    typeof exports.__unpin !== "function"
  ) {
    throw new Error(`❌ ${relativePath} 缺少运行时导出，请确认编译时开启了 --exportRuntime`);
  }

  return exports;
}

function makeAction(exports) {
  if (
    typeof exports.__pin !== "function" ||
    typeof exports.__unpin !== "function"
  ) {
    throw new Error("❌ wasm 缺少 __pin / __unpin，请确认编译时开启了 --exportRuntime");
  }

  return function hanamikoji_action(history, cards, board) {
    const b = board instanceof Int8Array ? board : Int8Array.from(board);
    if (b.length !== 7) throw new Error("board 长度必须为 7");

    let historyPtr = 0;
    let cardsPtr = 0;
    let resultPtr = 0;

    try {
      historyPtr = exports.__pin(exports.__newString(String(history)));
      cardsPtr = exports.__pin(exports.__newString(String(cards)));

      resultPtr = exports.__pin(
        exports.hanamikoji_action_raw(
          historyPtr,
          cardsPtr,
          Number(b[0]) | 0,
          Number(b[1]) | 0,
          Number(b[2]) | 0,
          Number(b[3]) | 0,
          Number(b[4]) | 0,
          Number(b[5]) | 0,
          Number(b[6]) | 0
        )
      );

      return exports.__getString(resultPtr);
    } finally {
      if (resultPtr) exports.__unpin(resultPtr);
      if (cardsPtr) exports.__unpin(cardsPtr);
      if (historyPtr) exports.__unpin(historyPtr);
    }
  };
}

const v1Exports = loadWasm("t3-as/build/release.wasm");
const v2Exports = loadWasm("t3-as-v2/build/release.wasm");

const v1Action = makeAction(v1Exports);
const v2Action = makeAction(v2Exports);

console.log("✅ v1 和 v2 策略模块加载成功（独立实例化）");
console.log(`🎲 公平随机测试主种子：${MASTER_SEED}`);
console.log(`🔁 成对测试组数：${PAIRED_MATCHES}（总局数 ${PAIRED_MATCHES * 2}）`);

// ── 统计 ─────────────────────────────────────────────────────
const stat = {
  v2First:  { v2: 0, v1: 0, draw: 0, err: 0 },
  v2Second: { v2: 0, v1: 0, draw: 0, err: 0 },
};

function bar(done, total, width = 28) {
  const fill = Math.round((done / total) * width);
  return "[" + "█".repeat(fill) + "░".repeat(width - fill) + `] ${done}/${total}`;
}

function nthSeed(i) {
  // 用一个固定主种子派生每组对局的子种子
  return (MASTER_SEED + Math.imul(i + 1, 0x9e3779b1)) >>> 0;
}

function classifyResult(result, p1isV2, bucket) {
  const wc = result.winnerCode;
  if (wc === 2 || wc === 0) {
    bucket.draw++;
  } else if (wc === 1) {
    if (p1isV2) bucket.v2++;
    else bucket.v1++;
  } else if (wc === -1) {
    if (p1isV2) bucket.v1++;
    else bucket.v2++;
  } else {
    bucket.draw++;
  }
}

function runOne(players, p1isV2, bucket, seed) {
  try {
    const roundDecks = buildMatchRoundDecks(seed);
    const result = runSingleMatch(players, MAX_MS, {
      firstPlayer: 0,
      seed,
      roundDecks,
      verbose: false,
    });
    classifyResult(result, p1isV2, bucket);
  } catch (e) {
    bucket.err++;
    if (bucket.err <= 3) {
      process.stdout.write("\n");
      console.error(`  ⚠️ 异常（第${bucket.err}次，seed=${seed}）:`, e?.stack ?? e);
    }
  }
}

// ── 单组成对冒烟测试 ─────────────────────────────────────────
console.log("⏳ 运行成对冒烟测试...");

try {
  const smokeSeed = nthSeed(0);

  const smoke1 = runSingleMatch(
    [
      { name: "v2", action: v2Action },
      { name: "v1", action: v1Action },
    ],
    MAX_MS,
    {
      firstPlayer: 0,
      seed: smokeSeed,
      roundDecks: buildMatchRoundDecks(smokeSeed),
      verbose: false,
    }
  );

  const smoke2 = runSingleMatch(
    [
      { name: "v1", action: v1Action },
      { name: "v2", action: v2Action },
    ],
    MAX_MS,
    {
      firstPlayer: 0,
      seed: smokeSeed,
      roundDecks: buildMatchRoundDecks(smokeSeed),
      verbose: false,
    }
  );

  console.log("✅ 冒烟测试通过");
  console.log(`   seed=${smokeSeed}`);
  console.log(`   同牌堆下：v2先手 winnerCode=${smoke1.winnerCode}，v1先手 winnerCode=${smoke2.winnerCode}`);
} catch (e) {
  console.error("❌ 冒烟测试失败：", e?.stack ?? e);
  process.exit(1);
}

// ── 正式测试 ─────────────────────────────────────────────────
console.log(`\n${"=".repeat(60)}`);
console.log(` 公平随机对战：v1（原版）vs v2（优化版）`);
console.log(` 同 seed 下固定三轮牌堆，交换先后手进行成对测试`);
console.log(`${"=".repeat(60)}\n`);

for (let i = 0; i < PAIRED_MATCHES; i++) {
  const seed = nthSeed(i);

  // Game A: v2 先手
  runOne(
    [
      { name: "v2", action: v2Action },
      { name: "v1", action: v1Action },
    ],
    true,
    stat.v2First,
    seed
  );

  // Game B: v1 先手，但三轮牌堆完全相同
  runOne(
    [
      { name: "v1", action: v1Action },
      { name: "v2", action: v2Action },
    ],
    false,
    stat.v2Second,
    seed
  );

  if ((i + 1) % SHOW_PROGRESS_EVERY === 0 || i + 1 === PAIRED_MATCHES) {
    process.stdout.write(`\r  ${bar(i + 1, PAIRED_MATCHES)}  `);
  }
}
console.log("\n");

// ── 汇总 ─────────────────────────────────────────────────────
const total = PAIRED_MATCHES * 2;
const v2Win = stat.v2First.v2 + stat.v2Second.v2;
const v1Win = stat.v2First.v1 + stat.v2Second.v1;
const drawTotal = stat.v2First.draw + stat.v2Second.draw;
const errTotal = stat.v2First.err + stat.v2Second.err;
const valid = total - errTotal;

const pct = (n) => (valid > 0 ? ((n / valid) * 100).toFixed(1) + "%" : "N/A");
const pad = (s, w = 7) => String(s).padStart(w);
const N = String(PAIRED_MATCHES);

console.log(`${"=".repeat(60)}`);
console.log(` 对战结果汇总`);
console.log(`${"=".repeat(60)}`);
console.log(`\n 总局数 ${total}  有效 ${valid}  异常 ${errTotal}\n`);

console.log(`┌${"─".repeat(17)}┬${"─".repeat(8)}┬${"─".repeat(8)}┬${"─".repeat(8)}┬${"─".repeat(8)}┐`);
console.log(`│                 │  v2胜  │  v1胜  │  平局  │  异常  │`);
console.log(`├${"─".repeat(17)}┼${"─".repeat(8)}┼${"─".repeat(8)}┼${"─".repeat(8)}┼${"─".repeat(8)}┤`);
console.log(
  `│ v2先手(${N}局)  │${pad(stat.v2First.v2)}  │${pad(stat.v2First.v1)}  │${pad(stat.v2First.draw)}  │${pad(stat.v2First.err)}  │`
);
console.log(
  `│ v1先手(${N}局)  │${pad(stat.v2Second.v2)}  │${pad(stat.v2Second.v1)}  │${pad(stat.v2Second.draw)}  │${pad(stat.v2Second.err)}  │`
);
console.log(`├${"─".repeat(17)}┼${"─".repeat(8)}┼${"─".repeat(8)}┼${"─".repeat(8)}┼${"─".repeat(8)}┤`);
console.log(
  `│ 合计(${total}局)   │${pad(v2Win)}  │${pad(v1Win)}  │${pad(drawTotal)}  │${pad(errTotal)}  │`
);
console.log(
  `│ 胜率            │${pad(pct(v2Win))}  │${pad(pct(v1Win))}  │${pad(pct(drawTotal))}  │        │`
);
console.log(`└${"─".repeat(17)}┴${"─".repeat(8)}┴${"─".repeat(8)}┴${"─".repeat(8)}┴${"─".repeat(8)}┘`);

console.log();
if (errTotal > 0) {
  console.log(`⚠️ 仍有 ${errTotal} 局异常，请优先查看前 3 个报错栈。`);
}

if (valid === 0) {
  console.log("❌ 没有有效对局");
} else if (v2Win > v1Win) {
  console.log(`✅ v2（优化版）领先：${pct(v2Win)} vs ${pct(v1Win)}`);
} else if (v1Win > v2Win) {
  console.log(`⚠️ v1（原版）反而更强：${pct(v1Win)} vs ${pct(v2Win)}`);
} else {
  console.log(`🤝 两版本胜率持平（${pct(v2Win)}）`);
}

const r1 = PAIRED_MATCHES - stat.v2First.err;
const r2 = PAIRED_MATCHES - stat.v2Second.err;
console.log(`\n先后手影响（v2 视角）：`);
console.log(`  v2 先手时胜率：${r1 > 0 ? (stat.v2First.v2 / r1 * 100).toFixed(1) : "N/A"}%`);
console.log(`  v2 后手时胜率：${r2 > 0 ? (stat.v2Second.v2 / r2 * 100).toFixed(1) : "N/A"}%`);
console.log();