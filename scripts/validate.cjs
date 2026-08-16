const fs = require("fs");
const sql = fs.readFileSync("scripts/seed.sql", "utf8");

// 真实 U+FFFD 替换符检测（按码点，不依赖 shell 传参）
const fffd = (sql.match(/\uFFFD/g) || []).length;

// 词书行：('slug','name','cover',is_public,owner_id);
const bookRe = /^\('([A-Za-z0-9_]+)','(?:[^']|'')*','(?:[^']|'')*',\d+,/;
const bookLines = sql.split("\n").filter(l => bookRe.test(l));
const bookSlugs = [...new Set(bookLines.map(l => l.match(bookRe)[1]))];

// 词行：('book_slug','word_slug','word',...)
const wordRe = /^\('([A-Za-z0-9_]+)','[A-Za-z0-9_]+','/;
const wordLines = sql.split("\n").filter(l => wordRe.test(l));

// 每本书词数（粗略：前缀匹配）
const perBook = {};
const wl = sql.split("\n");
for (const l of wl) {
  const m = l.match(/^\('([A-Za-z0-9_]+)','[A-Za-z0-9_]+','/);
  if (m) perBook[m[1]] = (perBook[m[1]] || 0) + 1;
}
const emptyBooks = bookSlugs.filter(s => !perBook[s] || perBook[s] === 0);

// 抽查中文释义是否完整（找一条含中文的行）
const cnLine = wl.find(l => /[\u4e00-\u9fff]/.test(l));
const cnOk = cnLine ? cnLine.includes(" adj") || cnLine.includes(" n") || /[\u4e00-\u9fff]/.test(cnLine) : false;

console.log("词书 INSERT 行数:", bookLines.length, " 去重词书数:", bookSlugs.length);
console.log("词 INSERT 行数:", wordLines.length);
console.log("空词书(0词):", emptyBooks.length ? emptyBooks.join(",") : "无");
console.log("真实 U+FFFD 替换符数量:", fffd);
console.log("含中文样例:", cnLine ? cnLine.slice(0, 90) : "(未找到中文)");
console.log("中文完整:", cnOk);
