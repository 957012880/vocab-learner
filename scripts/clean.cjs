const fs = require("fs");
const lines = fs.readFileSync("scripts/seed.sql", "utf8").split("\n");
const out = [];
lines.forEach((l, i) => {
  if (l.includes("�")) {
    out.push("LINE " + (i + 1) + ": " + l.slice(0, 160));
  }
});
console.log("真实 U+FFFD 行数:", out.length);
out.forEach(s => console.log(s));

// 同时清理：把 U+FFFD 替换为空串，回写 seed.sql
const cleaned = lines.map(l => l.replace(/�/g, "")).join("\n");
fs.writeFileSync("scripts/seed.sql", cleaned, "utf8");
console.log("已清理并回写 seed.sql，剩余 U+FFFD:", (cleaned.match(/�/g) || []).length);
