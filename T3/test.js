import assert from "assert";
import { existsSync, readFileSync } from "node:fs";
import { formatWinnerLabel, runSingleMatch, winnerReasonText } from "./hanamikoji-engine.js";

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

const { MAX_DECISION_MS, PLAYER_SPECS } = await import("./game-config.js");

function pickExport(moduleObject, names) {
  for (const name of names) {
    if (typeof moduleObject?.[name] === "function") {
      return { fn: moduleObject[name], name };
    }
  }
  return null;
}

async function loadPlayers() {
  const players = [];
  const fallbackExportNames = ["hanamikoji_action", "HanamikojiAction", "hanamikojiAction"];

  for (const spec of PLAYER_SPECS) {
    const moduleCandidates = [];
    if (spec.modulePath) {
      moduleCandidates.push(spec.modulePath);
    } else if (Array.isArray(spec.modulePathCandidates)) {
      for (const candidate of spec.modulePathCandidates) {
        if (!moduleCandidates.includes(candidate)) {
          moduleCandidates.push(candidate);
        }
      }
    }

    if (moduleCandidates.length === 0) {
      throw new Error(
        `未配置 ${spec.name} 的模块路径。请在.env设置变量 ${spec.name === "P1" ? "HM_P1_MODULE" : "HM_P2_MODULE"}`
      );
    }

    const exportNames = spec.exportName ? [spec.exportName, ...fallbackExportNames] : fallbackExportNames;
    let loaded = null;
    const importErrors = [];

    for (const modulePath of moduleCandidates) {
      try {
        const moduleObject = await import(modulePath);
        const picked = pickExport(moduleObject, exportNames);
        if (picked) {
          loaded = { modulePath, picked };
          break;
        }
        importErrors.push(`${modulePath}: 未找到导出 ${exportNames.join("/")}`);
      } catch (error) {
        importErrors.push(`${modulePath}: ${error.message}`);
      }
    }

    if (!loaded) {
      throw new Error(
        `${spec.name} 自动加载失败。已尝试路径：${moduleCandidates.join(", ")}\n${importErrors.join("\n")}`
      );
    }

    players.push({
      name: spec.name,
      action: loaded.picked.fn,
      exportName: loaded.picked.name,
      modulePath: loaded.modulePath
    });
  }

  return players;
}

const players = await loadPlayers();

console.log(`Loaded players:`);
for (const player of players) {
  console.log(`- ${player.name}: ${player.modulePath} :: ${player.exportName}`);
}
console.log(`Decision time limit: ${MAX_DECISION_MS} ms`);
const result = runSingleMatch(players, MAX_DECISION_MS);
const winner = result.winnerCode;

console.log("\n=== FINAL RESULTS ===");
console.log(`赢家: ${formatWinnerLabel(players, winner)} (${winnerReasonText(result.reason)})`);
console.log(`${players[0].name} 耗时: ${result.timeSpent[0].toFixed(3)} ms`);
console.log(`${players[1].name} 耗时: ${result.timeSpent[1].toFixed(3)} ms`);

assert.ok(typeof winner !== "undefined", "未产生有效对局");

console.log("🎉 You have passed all the tests provided.");
