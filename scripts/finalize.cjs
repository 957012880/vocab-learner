const fs = require("fs");
let sql = fs.readFileSync("scripts/seed.sql", "utf8");

// 还原被损坏 en-dash 的日期区间（源文件坏字节→现双空格）
const before = (sql.match(/1787  July/g) || []).length;
sql = sql.replace(/1787  July/g, "1787–July"); // en-dash U+2013
const after = (sql.match(/1787–July/g) || []).length;

fs.writeFileSync("scripts/seed.sql", sql, "utf8");

// 最终校验
const lines = sql.split("\n");
const wordRe = /^\('([A-Za-z0-9_]+)','[A-Za-z0-9_]+','/;
const wordLines = lines.filter(l => wordRe.test(l));
const bookRe = /^\('([A-Za-z0-9_]+)','(?:[^']|'')*','(?:[^']|'')*',\d+,/;
const bookLines = lines.filter(l => bookRe.test(l));
const slugs = [...new Set(bookLines.map(l => l.match(bookRe)[1]))];
const fffd = (sql.match(/�/g) || []).length;

console.log("日期破折号修复: 前", before, "处 → 后", after, "处");
console.log("词书数:", slugs.length, " 词行数:", wordLines.length, " U+FFFD残留:", fffd);
console.log("en-dash 已写入示例:", after > 0);
