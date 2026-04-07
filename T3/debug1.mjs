import { hanamikoji_action } from "./t3-as/build/release-old.js";

try {
  const result = hanamikoji_action("", "EEFFGG", Int8Array.from([0,0,0,0,0,0,0]));
  console.log("v1 调用成功:", result);
} catch(e) {
  console.error("v1 调用失败:", e.message);
}