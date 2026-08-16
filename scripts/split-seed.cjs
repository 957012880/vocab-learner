// 把 31MB 的 scripts/seed.sql 切成合法的分片，便于 wrangler d1 execute 逐片导入
// 每个分片都是独立的、完整的 INSERT 语句（保留列头 + 组内行逗号连接 + 末行分号）
const fs = require('fs');
const path = require('path');

const src = 'scripts/seed.sql';
const outDir = 'scripts/seed_parts';
const PER = 15000; // 每个分片的单词行数

const sql = fs.readFileSync(src, 'utf8');
const lines = sql.split('\n');

// ---- 词书段：从文件开头到第一个以 ; 结尾的 books INSERT 行 ----
const bi = lines.findIndex(l => l.startsWith('INSERT OR IGNORE INTO books'));
const be = lines.findIndex((l, i) => i >= bi && l.trim().endsWith(';'));
if (bi < 0 || be < 0) { console.error('未找到 books INSERT'); process.exit(1); }
const booksPart = lines.slice(0, be + 1).join('\n');

// ---- 单词段：从 words INSERT 表头之后的每一行值 ----
const wi = lines.findIndex(l => l.startsWith('INSERT OR IGNORE INTO words'));
if (wi < 0) { console.error('未找到 words INSERT'); process.exit(1); }
const header = lines[wi];
const valueLines = lines.slice(wi + 1);
const rows = valueLines.map(l => l.replace(/[;,]\s*$/, '').trim()).filter(Boolean);

fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) fs.rmSync(path.join(outDir, f));

// 词书分片（小，单独一个文件）
fs.writeFileSync(path.join(outDir, '01_books.sql'), booksPart + '\n');

// 单词分片
let n = 0;
let totalRows = 0;
for (let i = 0; i < rows.length; i += PER) {
  n++;
  const chunk = rows.slice(i, i + PER);
  totalRows += chunk.length;
  const body = chunk.map((r, idx) => (idx === chunk.length - 1 ? r + ';' : r + ',')).join('\n');
  const content = header + '\n' + body + '\n';
  const name = String(n + 1).padStart(2, '0') + '_words.sql';
  fs.writeFileSync(path.join(outDir, name), content);
}

console.log('词书分片: 01_books.sql');
console.log('单词分片数:', n, '| 每片约', PER, '行 | 合计单词行:', totalRows);
console.log('输出目录:', outDir);
