import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import loader from "@assemblyscript/loader";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const wasmPath = path.join(__dirname, "release.wasm");
const wasmModule = loader.instantiateSync(fs.readFileSync(wasmPath), {});
const { exports } = wasmModule;

export function hanamikoji_action(history, cards, board) {
  const b = board instanceof Int8Array ? board : Int8Array.from(board);

  const historyPtr = exports.__newString(String(history));
  const cardsPtr = exports.__newString(String(cards));

  const resultPtr = exports.hanamikoji_action_raw(
    historyPtr,
    cardsPtr,
    Number(b[0]) | 0,
    Number(b[1]) | 0,
    Number(b[2]) | 0,
    Number(b[3]) | 0,
    Number(b[4]) | 0,
    Number(b[5]) | 0,
    Number(b[6]) | 0
  );

  return exports.__getString(resultPtr);
}