// ============================================================
// 导入脚本：抓取 remix-words-funny 的源词库 (kajweb/dict) 全部词书，
// 解析为 Book + Word，输出 D1 种子 SQL (seed.sql)。
//
// 数据来源：
//   - 词书清单: https://github.com/kajweb/dict -> bookLists.txt
//   - 词书 zip:  https://github.com/kajweb/dict -> book/<timestamp>_<slug>.zip
//   （即 remix-words-funny 的 15 万词来源）
//
// 用法：
//   node scripts/import-words.mjs                 # 导入全部
//   node scripts/import-words.mjs --limit 5      # 只导入前 5 本（测试用）
//   node scripts/import-words.mjs --slug CET4_1   # 只导入指定词书
//
// 输出：seed.sql  （然后 `wrangler d1 execute vocab-db --file=seed.sql --remote`）
// ============================================================

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const GITHUB_API = 'https://api.github.com/repos/kajweb/dict/git/trees/master?recursive=1';
const RAW_BASE = 'https://raw.githubusercontent.com/kajweb/dict/master/';
const BOOKLISTS_URL = 'https://raw.githubusercontent.com/kajweb/dict/master/bookLists.txt';
const OUT_DIR = path.resolve(process.cwd(), 'scripts');
const SEED_FILE = path.join(OUT_DIR, 'seed.sql');
const TMP_DIR = path.join(OUT_DIR, '.tmp');

const args = process.argv.slice(2);
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? parseInt(args[i + 1]) : null; })();
const ONLY_SLUG = (() => { const i = args.indexOf('--slug'); return i >= 0 ? args[i + 1] : null; })();
const LOCAL = args.includes('--local'); // 直接读取 scripts/.tmp/*.zip，不再联网下载

function log(...a) { console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a); }

// ---------- 工具 ----------
function escapeSql(s) {
  if (s == null) return '';
  return String(s).replace(/'/g, "''").replace(/\u0000/g, '');
}
function uniq(arr) { return [...new Set(arr)]; }

// 括号匹配，从拼接 JSON 流里逐个提取顶层对象
function extractObjects(s) {
  const out = [];
  let depth = 0, start = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '{') { if (depth === 0) start = i; depth++; }
    else if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) { out.push(s.slice(start, i + 1)); start = -1; }
    }
  }
  return out;
}

async function fetchText(url) {
  const tmp = path.join(OUT_DIR, '.fetch_tmp.txt');
  execSync(`curl ${CURL_RETRY} "${url}" -o "${tmp}"`, { stdio: 'ignore', maxBuffer: 1024 * 1024 * 50 });
  const t = fs.readFileSync(tmp, 'utf8');
  return t; // 临时文件复用，不删除（避免触发安全删除拦截）
}

// 用 curl 下载（本环境 node fetch 对大二进制不稳定，curl 更稳定）
const CURL_RETRY = '--retry 8 --retry-delay 3 --retry-all-errors --connect-timeout 30 --max-time 180 -sL --fail';
function curlDownload(url, dest) {
  execSync(`curl ${CURL_RETRY} "${url}" -o "${dest}"`, { stdio: 'ignore', maxBuffer: 1024 * 1024 * 200 });
}

// ---------- 1. 词书清单（标题/封面/词数） ----------
async function loadBookMeta() {
  try {
    const txt = await fetchText(BOOKLISTS_URL);
    const json = JSON.parse(txt);
    const map = {};
    for (const b of (json.data?.normalBooksInfo || [])) {
      map[b.id] = { name: b.title, cover: b.cover, wordNum: b.wordNum };
    }
    return map;
  } catch (e) {
    log('⚠ 词书清单获取失败，将使用 slug 作为书名: ' + e.message);
    return {};
  }
}

// ---------- 2. 解析单个词书 zip ----------
function extractWord(wordObj) {
  try {
    const headWord = wordObj.headWord;
    const cw = wordObj.content?.word || {};
    const wordId = cw.wordId || null;
    const c = cw.content || {};
    const us = c.usphone || '';
    const uk = c.ukphone || '';
    // 释义：trans 数组 -> "词性 中文"
    let meaning = '';
    if (Array.isArray(c.trans) && c.trans.length) {
      meaning = c.trans.map(t => {
        const pos = t.pos ? `[${t.pos}] ` : '';
        return pos + (t.tranCn || '').trim();
      }).filter(Boolean).join('; ');
    }
    // 例句：取第一句
    let example = '';
    const sents = c.sentence?.sentences;
    if (Array.isArray(sents) && sents[0]) {
      const s = sents[0];
      example = (s.sContent || '') + (s.sCn ? '  ' + s.sCn : '');
    }
    if (!headWord) return null;
    return {
      word: headWord,
      slug: wordId || headWord,
      phonetic_us: us,
      phonetic_uk: uk,
      meaning: meaning.slice(0, 1000),
      example: example.slice(0, 500),
    };
  } catch (e) { return null; }
}

async function processZip(zipPath, slug) {
  // 每本书独立解压到自己的子目录，避免多个 zip 的 json 互相污染
  // （reciteWord_*/BeiShiGaoZhong_* 等书的内部 json 文件名与 slug 不完全一致）
  const bookDir = path.join(TMP_DIR, 'bk_' + slug);
  fs.mkdirSync(bookDir, { recursive: true });
  execSync(`unzip -o -j "${zipPath}" -d "${bookDir}"`, { stdio: 'ignore' });
  // zip 内通常是 <slug>.json
  const inner = path.join(bookDir, slug + '.json');
  let src;
  if (fs.existsSync(inner)) {
    src = inner;
  } else {
    // 兜底：取该目录下体积最大的 json（主数据文件通常最大）
    const js = fs.readdirSync(bookDir)
      .filter(f => f.endsWith('.json'))
      .sort((a, b) => {
        try { return fs.statSync(path.join(bookDir, b)).size - fs.statSync(path.join(bookDir, a)).size; }
        catch { return 0; }
      });
    if (!js.length) return [];
    src = path.join(bookDir, js[0]);
  }
  const raw = fs.readFileSync(src, 'utf8');
  const objs = extractObjects(raw);
  const words = [];
  for (const o of objs) {
    try { const w = JSON.parse(o); const ex = extractWord(w); if (ex) words.push(ex); }
    catch { /* skip */ }
  }
  return words;
}

// ---------- 3. 生成 seed.sql ----------
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  log('加载词书清单...');
  const meta = await loadBookMeta();

  log('获取词书 zip 列表...');
  let zips; // 每项: { path, slug }
  if (LOCAL) {
    const files = fs.readdirSync(TMP_DIR).filter(f => f.endsWith('.zip'));
    zips = files.map(f => ({ path: f, slug: f.replace(/^\d+_/, '').replace(/\.zip$/, '') }));
    log(`本地模式：读取 scripts/.tmp 下 ${zips.length} 个 zip`);
  } else {
    const tree = JSON.parse(await fetchText(GITHUB_API));
    const paths = tree.tree.filter(x => x.path.startsWith('book/') && x.path.endsWith('.zip')).map(x => x.path);
    zips = paths.map(p => ({ path: p, slug: p.split('/').pop().replace(/^\d+_/, '').replace(/\.zip$/, '') }));
  }
  if (ONLY_SLUG) zips = zips.filter(z => z.slug === ONLY_SLUG || z.path.includes(ONLY_SLUG));
  if (LIMIT) zips = zips.slice(0, LIMIT);
  log(`待处理词书: ${zips.length} 本`);

  const bookRows = [];
  const wordRows = [];
  let totalWords = 0;

  for (let i = 0; i < zips.length; i++) {
    const z = zips[i];
    const slug = z.slug;
    const m = meta[slug] || {};
    const zipPath = LOCAL ? path.join(TMP_DIR, z.path) : path.join(TMP_DIR, z.path.split('/').pop());
    try {
      if (!LOCAL) {
        log(`(${i + 1}/${zips.length}) 下载 ${slug} ...`);
        curlDownload(RAW_BASE + z.path, zipPath);
      } else {
        log(`(${i + 1}/${zips.length}) 解析本地 ${slug} ...`);
      }
      const words = await processZip(zipPath, slug);
      if (!words.length) { log(`  ⚠ ${slug} 解析为 0 词，跳过`); continue; }
      bookRows.push({ slug, name: m.name || slug, cover: m.cover || '', wordNum: words.length });
      for (const w of words) wordRows.push({ book_slug: slug, ...w });
      totalWords += words.length;
      log(`  ✓ ${slug}: ${words.length} 词 (累计 ${totalWords})`);
    } catch (e) {
      log(`  ✗ ${slug} 失败: ${e.message}`);
    }
  }

  log('生成 seed.sql ...');
  const lines = [];
  lines.push('-- remix-words-funny 词库种子数据（由 scripts/import-words.mjs 生成）');
  lines.push('-- 用法: wrangler d1 execute vocab-db --file=seed.sql --remote');
  lines.push('');
  lines.push('-- 词书');
  lines.push('INSERT OR IGNORE INTO books (slug, name, cover, is_public, owner_id) VALUES');
  bookRows.forEach((b, i) => {
    const comma = i < bookRows.length - 1 ? ',' : ';';
    lines.push(`('${escapeSql(b.slug)}','${escapeSql(b.name)}','${escapeSql(b.cover)}',1,NULL)${comma}`);
  });
  lines.push('');

  // 单词：分批多行 INSERT，每批 500 行
  lines.push('-- 单词');
  const BATCH = 500;
  for (let i = 0; i < wordRows.length; i += BATCH) {
    const chunk = wordRows.slice(i, i + BATCH);
    lines.push('INSERT OR IGNORE INTO words (book_slug, slug, word, phonetic_us, phonetic_uk, meaning, example) VALUES');
    chunk.forEach((w, j) => {
      const comma = j < chunk.length - 1 ? ',' : ';';
      lines.push(`('${escapeSql(w.book_slug)}','${escapeSql(w.slug)}','${escapeSql(w.word)}','${escapeSql(w.phonetic_us)}','${escapeSql(w.phonetic_uk)}','${escapeSql(w.meaning)}','${escapeSql(w.example)}')${comma}`);
    });
    lines.push('');
  }

  fs.writeFileSync(SEED_FILE, lines.join('\n'), 'utf8');
  log(`完成！词书 ${bookRows.length} 本，单词 ${totalWords} 个`);
  log(`种子文件: ${SEED_FILE}`);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
