// 把 scripts/seed.sql 切成合法的分片，便于 wrangler d1 execute 逐片导入。
// 说明：seed.sql 的 words 段本身已是多条 INSERT 语句（每条约 500 行），
// 本脚本先正确解析出所有单词值行，再按 BATCH(每条语句行数) 与 PER(每文件行数) 重新切分，
// 确保每条 INSERT 语句不超过 D1/SQLite 的 SQLITE_TOOBIG 上限(~1MB)。
const fs = require('fs');
const path = require('path');

const src = 'scripts/seed.sql';
const outDir = 'scripts/seed_parts';
const PER = 15000;   // 每个分片文件的单词行数
const BATCH = 200;   // 每条 INSERT 语句的行数（D1 单语句上限远低于 400KB，实测 200 行≈40KB 安全）

const sql = fs.readFileSync(src, 'utf8');
const lines = sql.split('\n');

// ---- 词书段：从第一个 books INSERT 到其结束的 ';' ----
const bi = lines.findIndex(l => l.startsWith('INSERT OR IGNORE INTO books'));
const be = lines.findIndex((l, i) => i >= bi && l.trim().endsWith(';'));
if (bi < 0 || be < 0) { console.error('未找到 books INSERT'); process.exit(1); }
const booksPart = lines.slice(bi, be + 1).join('\n');

// ---- 单词段：解析所有 words INSERT 块，提取值行（顺序保持） ----
const allWordRows = [];
let i = 0;
while (i < lines.length) {
  if (lines[i].startsWith('INSERT OR IGNORE INTO words')) {
    i++; // 跳过表头行
    while (i < lines.length) {
      const trimmed = lines[i].trim();
      if (trimmed === '') { i++; continue; }
      const row = trimmed.replace(/[;,]\s*$/, '');
      if (row.length > 0) allWordRows.push(row);
      if (trimmed.endsWith(';')) { i++; break; }
      i++;
    }
  } else {
    i++;
  }
}
if (allWordRows.length === 0) { console.error('未解析到任何单词行'); process.exit(1); }

fs.mkdirSync(outDir, { recursive: true });

// 词书分片（小，单独一个文件）
fs.writeFileSync(path.join(outDir, '01_books.sql'), booksPart + '\n');

// 单词分片：每片文件内按 BATCH 拆成多条 INSERT 语句
const WORD_HEADER = 'INSERT OR IGNORE INTO words (book_slug, slug, word, phonetic_us, phonetic_uk, meaning, example) VALUES';
let n = 0;
let totalRows = 0;
for (let s = 0; s < allWordRows.length; s += PER) {
  n++;
  const fileRows = allWordRows.slice(s, s + PER);
  totalRows += fileRows.length;
  let content = '';
  for (let j = 0; j < fileRows.length; j += BATCH) {
    const batch = fileRows.slice(j, j + BATCH);
    const body = batch.map((r, idx) => (idx === batch.length - 1 ? r + ';' : r + ',')).join('\n');
    content += WORD_HEADER + '\n' + body + '\n';
  }
  const name = String(n + 1).padStart(2, '0') + '_words.sql';
  fs.writeFileSync(path.join(outDir, name), content);
}

console.log('词书分片: 01_books.sql');
console.log('单词分片数:', n, '| 每片约', PER, '行 | 每条 INSERT', BATCH, '行 | 合计单词行:', totalRows);
console.log('输出目录:', outDir);
