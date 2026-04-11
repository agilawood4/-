import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const wasmPath = path.join(__dirname, "release.wasm");
const wasmBuffer = fs.readFileSync(wasmPath);

const compiled = new WebAssembly.Module(wasmBuffer);
const instance = new WebAssembly.Instance(compiled, {
  env: {
    abort(msg, file, line, col) {
      throw new Error(`[wasm abort] @ ${line}:${col}`);
    }
  }
});
const exports = instance.exports;
const memory = exports.memory;

if (typeof exports.hanamikoji_action_raw !== "function") {
  throw new Error("release.wasm 未导出 hanamikoji_action_raw");
}
if (typeof exports.__new !== "function" || typeof exports.__pin !== "function") {
  throw new Error("当前 wasm 缺少运行时导出，请确认编译时使用了 --exportRuntime");
}

function newString(str) {
  const len = str.length;
  const ptr = exports.__pin(exports.__new(len * 2, 2) >>> 0);
  const view = new Uint16Array(memory.buffer, ptr, len);
  for (let i = 0; i < len; i++) view[i] = str.charCodeAt(i);
  return ptr;
}

function getString(ptr) {
  ptr = ptr >>> 0;
  const lenBytes = new Uint32Array(memory.buffer)[(ptr - 4) >>> 2];
  const len = lenBytes >>> 1;
  const chars = new Uint16Array(memory.buffer, ptr, len);
  return String.fromCharCode(...chars);
}

export function hanamikoji_action(history, cards, board) {
  const b = board instanceof Int8Array ? board : Int8Array.from(board);
  if (b.length !== 7) throw new Error("board 长度必须为 7");

  const historyPtr = newString(String(history));
  const cardsPtr   = newString(String(cards));
  let resultPtr = 0;

  try {
    resultPtr = exports.__pin(
      exports.hanamikoji_action_raw(
        historyPtr, cardsPtr,
        Number(b[0]) | 0, Number(b[1]) | 0, Number(b[2]) | 0,
        Number(b[3]) | 0, Number(b[4]) | 0, Number(b[5]) | 0,
        Number(b[6]) | 0
      )
    );
    return getString(resultPtr);
  } finally {
    if (resultPtr) exports.__unpin(resultPtr);
    exports.__unpin(cardsPtr);
    exports.__unpin(historyPtr);
  }
}