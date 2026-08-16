const fs = require("fs");
const crypto = require("crypto");

const password = "admin123";
const salt = crypto.randomBytes(16);
const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256");

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const stored = b64url(salt) + ":" + b64url(hash);

// 写回 schema.sql
let sql = fs.readFileSync("schema.sql", "utf8");
const before = sql;
sql = sql.replace(/'CHANGE_VIA_API'/, "'" + stored + "'");
if (sql === before) {
  console.error("未找到 CHANGE_VIA_API，未修改");
  process.exit(1);
}
fs.writeFileSync("schema.sql", sql, "utf8");

// 自检：用同样算法重新校验
const [sB64, hB64] = stored.split(":");
const sBuf = Buffer.from(sB64.replace(/-/g, "+").replace(/_/g, "/"), "base64");
const check = crypto.pbkdf2Sync(password, sBuf, 100000, 32, "sha256").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
console.log("admin 密码哈希已写入:", stored.slice(0, 24) + "...");
console.log("自检 verifyPassword('admin123'):", check === hB64 ? "通过 ✅" : "失败 ❌");
