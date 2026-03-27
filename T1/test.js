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

async function loadJudgeFunction() {
  const exportCandidates = ["hanamikoji_judge", "HanamikojiJudge", "hanamikojiJudge"];
  const explicitModulePath = process.env.HM_T1_MODULE;
  if (explicitModulePath) {
    const moduleObject = await import(explicitModulePath);
    const fn = pickExport(moduleObject, exportCandidates);
    if (!fn) {
      throw new Error(`模块 ${explicitModulePath} 未找到可用导出：${exportCandidates.join(", ")}`);
    }
    return fn;
  }

  const modulePathCandidates = [
    "./t1-as/build/release.js",
    "./t1-rust/pkg/t1_rust.js",
    "./t1-cpp/pkg/t1_cpp.js"
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
    "无法自动加载 wasm 胶水模块。如果你采用了 AS、rust、cpp 以外的语言：请在.env设置变量 HM_T1_MODULE 指向你的 JS 胶水文件，例如：set HM_T1_MODULE=./t1-rust/pkg/t1_rust.js"
  );
}

function validateReturnValue(value, board, round) {
  assert.ok(
    value === -1 || value === 0 || value === 1 || value === 2,
    `返回值必须属于 {-1,0,1,2}，实际为 ${value}; board=${JSON.stringify(board)}, round=${round}`
  );
}

const hanamikojiJudge = await loadJudgeFunction();

const sampleTests = [
  { board: [1, 1, 1, 1, 1, 0, 0], round: 1, expected: 1 },
  { board: [-1, -1, 0, -1, 0, -1, 0], round: 2, expected: -1 },
  { board: [1, -1, 0, -1, 1, 0, 0], round: 3, expected: 2 }
];

for (const testCase of sampleTests) {
  const actual = Number(hanamikojiJudge(Int8Array.from(testCase.board), testCase.round));
  validateReturnValue(actual, testCase.board, testCase.round);
  assert.strictEqual(
    actual,
    testCase.expected,
    `样例校验失败：board=${JSON.stringify(testCase.board)}, round=${testCase.round}, expected=${testCase.expected}, actual=${actual}`
  );
}

console.log("🎉 You have passed all the tests provided.");
