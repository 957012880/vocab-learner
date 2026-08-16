// 顺序执行 scripts/seed_parts 下的所有分片（先词书，后单词），用于 wrangler d1 批量导入
// 用法: node scripts/seed-parts.cjs   (需先 npm install 并 wrangler login)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = 'scripts/seed_parts';
const db = 'vocab-db';
const wranglerBin = path.join('node_modules', 'wrangler', 'bin', 'wrangler.js');
const nodeBin = process.execPath; // 使用运行本脚本的 node（managed node）

const files = fs.readdirSync(dir)
  .filter(f => f.endsWith('.sql'))
  .sort(); // 01_books.sql, 02_words.sql ... 字典序即正确顺序

console.log(`开始导入 ${files.length} 个分片到 D1 数据库 "${db}" ...\n`);

let ok = 0;
for (const f of files) {
  const fp = path.join(dir, f);
  const sizeMB = (fs.statSync(fp).size / 1024 / 1024).toFixed(2);
  process.stdout.write(`▶ [${ok + 1}/${files.length}] ${f} (${sizeMB} MB) ... `);
  const r = spawnSync(nodeBin, [wranglerBin, 'd1', 'execute', db, '--file=' + fp, '--remote'], {
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    console.error(`\n✗ ${f} 导入失败（exit ${r.status}）。后续分片已停止。`);
    console.error('请检查网络 / 登录状态 / wrangler.toml 中的 database_id，然后重新运行本脚本（已成功的分片可忽略，D1 的 INSERT OR IGNORE 可重复执行）。');
    process.exit(1);
  }
  ok++;
  console.log('✓ 完成');
}

console.log(`\n全部导入完成：${ok} 个分片。`);
