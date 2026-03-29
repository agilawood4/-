import assert from "assert";
import { existsSync, readFileSync } from "node:fs";

function loadLocalEnv() {
  const envPath = new URL("./.env", import.meta.url);
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf8");
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const pos = line.indexOf("=");
    if (pos <= 0) continue;
    const key = line.slice(0, pos).trim();
    const value = line.slice(pos + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadLocalEnv();

function pickExport(moduleObject, names) {
  for (const name of names) {
    if (typeof moduleObject?.[name] === "function") {
      return moduleObject[name];
    }
  }
  return null;
}

async function loadCalcCurrentStateFunction() {
  const exportCandidates = ["calc_current_state", "calcCurrentState", "CalcCurrentState"];
  const explicitModulePath = process.env.HM_T2_MODULE;
  if (explicitModulePath) {
    const moduleObject = await import(explicitModulePath);
    const fn = pickExport(moduleObject, exportCandidates);
    if (!fn) {
      throw new Error(`模块 ${explicitModulePath} 未找到可用导出：${exportCandidates.join(", ")}`);
    }
    return fn;
  }

  const modulePathCandidates = [
    "./t2-as/build/release.js",
    "./t2-rust/pkg/t2_rust.js",
    "./t2-cpp/pkg/t2_cpp.js"
  ];

  for (const modulePath of modulePathCandidates) {
    try {
      const moduleObject = await import(modulePath);
      const fn = pickExport(moduleObject, exportCandidates);
      if (fn) {
        return fn;
      }
    } catch {
    }
  }

  throw new Error(
    "无法自动加载 wasm 胶水模块。如果你采用了 AS、rust、cpp 以外的语言：请在.env设置变量 HM_T2_MODULE 指向你的 JS 胶水文件，例如：set HM_T2_MODULE=./t2-rust/pkg/t2_rust.js"
  );
}

function cardIndex(ch) {
  return ch.charCodeAt(0) - 65;
}

function addCards(counter, cards) {
  for (const ch of cards) {
    if (ch === "X") continue;
    counter[cardIndex(ch)] += 1;
  }
}

function removeOne(cards, target) {
  const array = cards.split("");
  const pos = array.indexOf(target);
  if (pos === -1) {
    throw new Error(`选择 ${target} 不在候选 ${cards} 中`);
  }
  array.splice(pos, 1);
  return array.join("");
}

function sameMultiset(left, right) {
  if (left.length !== right.length) return false;
  const a = left.split("").sort().join("");
  const b = right.split("").sort().join("");
  return a === b;
}

function normalizeMatrix3x7(output) {
  if (Array.isArray(output) && output.length === 21) {
    const flat = output.map((v) => Number(v));
    return [flat.slice(0, 7), flat.slice(7, 14), flat.slice(14, 21)];
  }

  if (output && typeof output.length === "number" && output.length === 21 && typeof output[0] !== "undefined" && !Array.isArray(output[0])) {
    const flat = Array.from(output).map((v) => Number(v));
    return [flat.slice(0, 7), flat.slice(7, 14), flat.slice(14, 21)];
  }

  if (!Array.isArray(output) || output.length !== 3) {
    throw new Error(`返回值应为长度为3的二维数组，实际：${JSON.stringify(output)}`);
  }

  const normalized = output.map((row) => Array.from(row));

  for (const row of normalized) {
    if (!Array.isArray(row) || row.length !== 7) {
      throw new Error(`每一行应为长度为7的数组，实际：${JSON.stringify(output)}`);
    }
    for (const value of row) {
      if (!Number.isInteger(Number(value))) {
        throw new Error(`返回值元素应为整数，实际：${JSON.stringify(output)}`);
      }
    }
  }

  return normalized.map((row) => row.map((v) => Number(v)));
}

const calcCurrentState = await loadCalcCurrentStateFunction();

const history = "1A 1A 2BC 2BC 3EEE-E 3DDD-D 4FGFG-FG 4FGFG-FG";
const board = [0, 0, 0, 0, 0, 0, 0];
const expected = [
  [1, 0, 0, 1, 2, 2, 2],
  [1, 0, 0, 2, 1, 2, 2],
  [0, 0, 0, -1, 1, 0, 0]
];

const actualRaw = calcCurrentState(history, Int8Array.from(board));
const actual = normalizeMatrix3x7(actualRaw);

assert.deepStrictEqual(
  actual,
  expected,
  `测试失败：history=${history}, board=${JSON.stringify(board)}\nexpected=${JSON.stringify(expected)}\nactual=${JSON.stringify(actual)}`
);

console.log("🎉 You have passed all the tests provided.");
