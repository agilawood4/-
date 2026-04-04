// T3 自动化测试：hanamikoji_action（策略函数正确性验证）
// 用法：在 /T3 目录下执行  node my_test.js
//
// ⚠️ 只允许修改下面这行路径，其余代码不要改动
import { hanamikoji_action } from "./t3-as/build/release-old.js";

// ─── 工具函数 ────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function validateAction(action, cards) {
  if (typeof action !== "string" || action.length === 0) return "空字符串";
  if (action.startsWith("-")) return null; // 响应由 customCheck 检查

  const prefix = action.charCodeAt(0) - 48;
  const body = action.slice(1);

  if (prefix < 1 || prefix > 4) return `非法前缀 "${action[0]}"`;
  if (body.length !== prefix) return `前缀=${prefix} 但牌数=${body.length}`;

  const cardCount = {};
  for (const c of cards) cardCount[c] = (cardCount[c] || 0) + 1;
  for (const c of body) {
    if (!cardCount[c] || cardCount[c] <= 0) return `手牌中没有 "${c}"（手牌:${cards}）`;
    cardCount[c]--;
  }
  return null;
}

function check(desc, history, cards, board, { customCheck = null } = {}) {
  let action;
  try {
    action = hanamikoji_action(history, cards, Int8Array.from(board));
  } catch (e) {
    console.log(`  ❌ FAIL  ${desc}`);
    console.log(`           exception: ${e.message}`);
    failed++;
    return;
  }

  let err = validateAction(action, cards);
  if (!err && customCheck) err = customCheck(action);

  if (!err) {
    console.log(`  ✅ PASS  ${desc}  → "${action}"`);
    passed++;
  } else {
    console.log(`  ❌ FAIL  ${desc}`);
    console.log(`           history="${history}"  cards="${cards}"  board=${JSON.stringify(board)}`);
    console.log(`           action="${action}"  错误: ${err}`);
    failed++;
  }
}

// ─── 分类1：格式正确性 ──────────────────────────────────────
console.log("\n【分类1】基本格式正确性（输出符合协议）");

check("无历史，第一回合，格式合法",
  "", "ABCDEF", [0,0,0,0,0,0,0]);

check("无历史，手牌含高分牌，格式合法",
  "", "DEFGGG", [0,0,0,0,0,0,0]);

// 已用密约(index=0我方)，不能再用密约
check("已用密约，不返回1x格式",
  "1G", "ABCDE", [0,0,0,0,0,0,0],
  { customCheck: (a) => a.startsWith("1") ? "已使用密约却再次出1x" : null }
);

// 已用取舍(index=0我方2GG)，不能再用取舍
check("已用取舍，不返回2xx格式",
  "2GG 1X", "ABCD", [0,0,0,0,0,0,0],
  { customCheck: (a) => a.startsWith("2") ? "已使用取舍却再次出2xx" : null }
);

// ─── 分类2：响应模式 ─────────────────────────────────────────
console.log("\n【分类2】响应模式（对手的赠予/竞争后我方选择）");

// history="3FGG"：index=0是我方提供3FGG，对手需要响应，不是我方响应
// 改为：我方先密约1G(index=0)，对手提供3FGG(index=1)，轮到我方响应
check("响应对手赠予3FGG，返回-X格式",
  "1G 3FGG", "ABCDE", [0,0,0,0,0,0,0],
  {
    customCheck: (a) => {
      if (!a.startsWith("-")) return `期望响应（-开头），得到 "${a}"`;
      if (a.length !== 2) return `响应赠予应为-X（长度2），得到 "${a}"`;
      if (!"FGG".includes(a[1])) return `选择的牌 "${a[1]}" 不在FGG中`;
      return null;
    }
  }
);

// 我方先密约1G(index=0)，对手出4ACBD(index=1)，轮到我方响应
check("响应对手竞争4ACBD，返回-XX格式",
  "1G 4ACBD", "DEFGG", [0,0,0,0,0,0,0],
  {
    customCheck: (a) => {
      if (!a.startsWith("-")) return `期望响应（-开头），得到 "${a}"`;
      if (a.length !== 3) return `响应竞争应为-XX（长度3），得到 "${a}"`;
      const picked = a.slice(1).split("").sort().join("");
      const g1 = "AC".split("").sort().join("");
      const g2 = "BD".split("").sort().join("");
      if (picked !== g1 && picked !== g2) return `选择 "${picked}" 不是有效的一组（AC或BD）`;
      return null;
    }
  }
);

// 我方出了3BCC(index=0)，对手选了-C(附在3BCC后)，现在轮到我继续正常行动
check("赠予已结算完（含-），我方继续正常行动",
  "3BCC-C", "ADEFG", [0,0,0,0,0,0,0],
  { customCheck: (a) => a.startsWith("-") ? `不应为响应，得到 "${a}"` : null }
);

// ─── 分类3：行动唯一性 ──────────────────────────────────────
console.log("\n【分类3】每种行动只能用一次");

// 我方(偶数index=0,2)已用1和2，只能出3或4
// history="1G 1A 2CD 2EF"：index=0我方1G，index=2我方2CD
check("已用1和2，只能出3或4",
  "1G 1A 2CD 2EF", "ABCDE", [0,0,0,0,0,0,0],
  {
    customCheck: (a) => {
      if (a.startsWith("1") || a.startsWith("2")) return `已用1和2，不能再出 "${a}"`;
      return null;
    }
  }
);

// 我方(index=0,2,4)已用1/2/3，只能出4
// history="1G 1A 2CD 2EF 3FGA-G 3ABC-A"：index=0我方1G，index=2我方2CD，index=4我方3FGA-G
check("已用1、2、3，只能出4",
  "1G 1A 2CD 2EF 3FGA-G 3ABC-A", "BCDE", [0,0,0,0,0,0,0],
  {
    customCheck: (a) => {
      if (!a.startsWith("4")) return `已用1/2/3，必须出4，得到 "${a}"`;
      return null;
    }
  }
);

// 我方(index=0,2,4)已用2/3/4，只能出1
// 构造要点：对手（奇数位）的密约/取舍必须写 1X/2XX，
// 这样 inferSeat 才能正确推断 selfIsFirst=true
// history="2GG 1X 3FFA-F 1X 4ABEG-AB 1X"
// 我方用了 index=0(2GG) index=2(3FFA-F) index=4(4ABEG-AB)
// 手牌：6 + 3回合摸3 - 消耗(2+3+4)=9 + 下回合摸1 = 1张
check("已用2、3、4，只能出密约(1)",
  "2GG 1X 3FFA-F 1X 4ABEG-AB 1X", "D", [0,0,0,0,0,0,0],
  {
    customCheck: (a) => {
      if (!a.startsWith("1")) return `已用2/3/4，必须出1，得到 "${a}"`;
      return null;
    }
  }
);

// ─── 分类4：使用的牌必须在手牌中 ───────────────────────────
console.log("\n【分类4】使用的牌必须都在手牌中");

check("手牌ABCDE，不能用F或G",
  "", "ABCDE", [0,0,0,0,0,0,0],
  {
    customCheck: (a) => {
      if (a.startsWith("-")) return null;
      const allowed = new Set("ABCDE");
      for (const c of a.slice(1)) {
        if (!allowed.has(c)) return `使用了手牌中没有的牌 "${c}"（手牌:ABCDE）`;
      }
      return null;
    }
  }
);

check("手牌只有GGG，只能用G",
  "", "GGG", [0,0,0,0,0,0,0],
  {
    customCheck: (a) => {
      if (a.startsWith("-")) return null;
      for (const c of a.slice(1)) {
        if (c !== "G") return `手牌只有G却用了 "${c}"`;
      }
      return null;
    }
  }
);

// ─── 分类5：策略基本合理性 ──────────────────────────────────
console.log("\n【分类5】策略基本合理性");

check("手牌有多张G，第一回合，格式合法即可",
  "", "AGGGG", [0,0,0,0,0,0,0]);

check("我方快赢（已9分），格式合法即可",
  "", "ABCDE", [1,1,1,1,0,0,0]);

check("对手快赢（已9分），格式合法即可",
  "", "ABCDE", [0,0,0,0,0,-1,-1]);

// 后期：我方(index=0,2,4,6)已用1/2/3，只剩4；手牌B，但需4张才能竞争
// 改为合理场景：我方已用1/2/3/4，现在是响应阶段
// 对手(index=1)刚出赠予3DEG，轮到我选
check("后期，响应对手赠予3DEG",
  "1G 3DEG", "B", [0,0,0,1,0,-1,1],
  {
    customCheck: (a) => {
      if (!a.startsWith("-")) return `应响应，得到 "${a}"`;
      if (!"DEG".includes(a[1])) return `选择 "${a[1]}" 不在DEG中`;
      return null;
    }
  }
);

// ─── 分类6：响应竞争的合法性 ────────────────────────────────
console.log("\n【分类6】响应竞争的选择合法性");

// 我方先密约1A(index=0)，对手出4GGFF(index=1)，轮到我方响应
check("响应4GGFF，选GG或FF之一",
  "1A 4GGFF", "BCDE", [0,0,0,0,0,0,0],
  {
    customCheck: (a) => {
      if (!a.startsWith("-")) return `应响应（-开头），得到 "${a}"`;
      if (a.length !== 3) return `响应竞争应为3字符，得到 "${a}"`;
      const picked = a.slice(1).split("").sort().join("");
      const g1 = "GG".split("").sort().join("");
      const g2 = "FF".split("").sort().join("");
      if (picked !== g1 && picked !== g2) return `选择 "${a.slice(1)}" 不是GG或FF`;
      return null;
    }
  }
);

// 我方先密约1A(index=0)，对手出4DEBC(index=1)（DE一组，BC一组），轮到我方响应
// 手牌用合法字符 AFGG（只含A-G）
check("响应4DEBC，选DE或BC之一",
  "1A 4DEBC", "FGGG", [0,0,0,0,0,0,0],
  {
    customCheck: (a) => {
      if (!a.startsWith("-")) return `应响应，得到 "${a}"`;
      if (a.length !== 3) return `响应竞争应为3字符，得到 "${a}"`;
      const picked = a.slice(1).split("").sort().join("");
      const g1 = "DE".split("").sort().join("");
      const g2 = "BC".split("").sort().join("");
      if (picked !== g1 && picked !== g2) return `选择 "${a.slice(1)}" 不是DE或BC`;
      return null;
    }
  }
);

// ─── 分类7：响应赠予的合法性 ────────────────────────────────
console.log("\n【分类7】响应赠予的选择合法性");

// 我方先密约1A(index=0)，对手出3GFA(index=1)，轮到我方响应
check("响应3GFA，只能选G/F/A之一",
  "1A 3GFA", "BCDE", [0,0,0,0,0,0,0],
  {
    customCheck: (a) => {
      if (!a.startsWith("-")) return `应响应，得到 "${a}"`;
      if (a.length !== 2) return `响应赠予应为2字符，得到 "${a}"`;
      if (!"GFA".includes(a[1])) return `选择 "${a[1]}" 不在GFA中`;
      return null;
    }
  }
);

// ─── 汇总 ────────────────────────────────────────────────────
console.log(`\n========================================`);
console.log(`结果：${passed} 通过，${failed} 失败，共 ${passed + failed} 项`);
if (failed === 0) {
  console.log("🎉 You have passed all the tests provided.");
} else {
  console.log("⚠️  部分测试未通过，请检查实现。");
  process.exit(1);
}