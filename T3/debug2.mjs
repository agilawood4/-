import { hanamikoji_action } from "./t3-as-v2/build/release-old.js";

try {
  const result = hanamikoji_action("", "EEFFGG", Int8Array.from([0,0,0,0,0,0,0]));
  console.log("v2 调用成功:", result);
} catch(e) {
  console.error("v2 调用失败:", e.message);
}