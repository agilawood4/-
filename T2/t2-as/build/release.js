import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import loader from "@assemblyscript/loader";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const wasmPath = path.join(__dirname, "release.wasm");
const wasmModule = loader.instantiateSync(fs.readFileSync(wasmPath), {});
const { exports } = wasmModule;

/**
 * 对接课程测试的同步导出：
 * calc_current_state(history, board)
 *
 * - history: string
 * - board: Int8Array 或普通长度 7 数组
 * - 返回：长度 21 的扁平数组
 *
 * 你的 test.js 里的 normalizeMatrix3x7 会自动把它转成 [[7],[7],[7]]
 */
export function calc_current_state(history, board) {
  const b = board instanceof Int8Array ? board : Int8Array.from(board);

  const historyPtr = exports.__newString(String(history));
  const resultPtr = exports.calc_current_state_raw(
    historyPtr,
    Number(b[0]) | 0,
    Number(b[1]) | 0,
    Number(b[2]) | 0,
    Number(b[3]) | 0,
    Number(b[4]) | 0,
    Number(b[5]) | 0,
    Number(b[6]) | 0,
    1 // 默认按测试样例：第 0/2/4/6 条为我方动作
  );

  return exports.__getArray(resultPtr).map((v) => Number(v));
}