// 胶水代码 -> wasm

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import loader from "@assemblyscript/loader";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const wasmPath = path.join(__dirname, "release.wasm");
const wasmModule = loader.instantiateSync(fs.readFileSync(wasmPath), {});
const { exports } = wasmModule;

export function hanamikoji_judge(board, round) {
  const input = board instanceof Int8Array ? board : Int8Array.from(board);
  const boardPtr = exports.__newArray(exports.INT8_ARRAY_ID, Array.from(input));
  return exports.hanamikoji_judge(boardPtr, round | 0);
}