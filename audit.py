import sys, os, json, glob, re

base = sys.argv[1]
files = sorted(glob.glob(os.path.join(base, "*.json")))

CTRL = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f]')
CJK = re.compile(r'[\u4e00-\u9fff]')
REPL = '\ufffd'

global_problems = {}
file_summaries = []

for path in files:
    name = os.path.basename(path)
    entries = []
    parse_errors = 0
    blank_lines = 0
    problems = {}
    def bump(k):
        problems[k] = problems.get(k,0)+1
        global_problems[k] = global_problems.get(k,0)+1
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            s = line.strip()
            if not s:
                blank_lines += 1
                continue
            try:
                obj = json.loads(s)
            except Exception:
                parse_errors += 1
                continue
            entries.append(obj)
    seen_words = {}
    sample = None
    for obj in entries:
        head = obj.get('headWord','')
        cw = (obj.get('content') or {}).get('word') or {}
        word = head or cw.get('wordHead','')
        cb = cw.get('content') or {}
        meaning_parts = []
        syno = cb.get('syno') or {}
        if isinstance(syno, list):
            synos = syno
        elif isinstance(syno, dict):
            synos = syno.get('synos') or []
        else:
            synos = []
        for sy in synos:
            if not isinstance(sy, dict):
                continue
            pos = sy.get('pos','')
            tran = sy.get('tran','')
            if tran:
                meaning_parts.append((pos + '. ' + tran) if pos else tran)
        tr = cb.get('trans')
        if isinstance(tr, list):
            trans_list = tr
        elif isinstance(tr, dict):
            trans_list = tr.get('trans') or []
        else:
            trans_list = []
        for t in trans_list:
            if not isinstance(t, dict):
                continue
            tc = t.get('tranCn') or t.get('tran') or ''
            if tc:
                meaning_parts.append(tc)
        meaning = ' ; '.join(meaning_parts)
        uk = cb.get('ukphone','') or ''
        us = cb.get('usphone','') or ''
        phonetic = us or uk
        sent = cb.get('sentence') or {}
        sents = sent.get('sentences') or []
        example = sents[0].get('sContent','') if sents else ''
        example_cn = sents[0].get('sCn','') if sents else ''
        if sample is None:
            sample = {"word":word,"meaning":meaning[:140],"phonetic_uk":uk,"phonetic_us":us,"example":example[:140],"example_cn":example_cn[:140]}
        if word.strip() == '':
            bump('empty_word')
        if CJK.search(word):
            bump('word_has_CJK')
        if not re.match(r'^[\x00-\x7f]*$', word):
            bump('word_non_ascii')
        if meaning.strip()=='':
            bump('empty_meaning')
        if (not phonetic.strip()):
            bump('missing_phonetic')
        if not example.strip():
            bump('empty_example')
        blob = json.dumps(obj, ensure_ascii=False)
        if REPL in blob:
            bump('mojibake_replacement_char')
        if CTRL.search(blob):
            bump('control_chars')
        wkey = word.strip().lower()
        if wkey:
            seen_words[wkey] = seen_words.get(wkey,0)+1
    dups = {w:c for w,c in seen_words.items() if c>1}
    dup_count = sum(c-1 for c in dups.values())
    if dup_count>0:
        problems['duplicate_words']=dup_count
        global_problems['duplicate_words']=global_problems.get('duplicate_words',0)+dup_count
    file_summaries.append((name, len(entries), parse_errors, blank_lines, len(dups), problems, sample))

out = []
out.append("FILE,ANALYSIS")
for name, n, pe, bl, nd, prob, samp in file_summaries:
    out.append("\n### " + name)
    out.append("entries=%d parse_errors=%d blank_lines=%d duplicate_wordkeys=%d" % (n, pe, bl, nd))
    out.append("problems=" + json.dumps(prob, ensure_ascii=False))
    if samp:
        out.append("sample=" + json.dumps(samp, ensure_ascii=False))
out.append("")
out.append("=== GLOBAL PROBLEM TOTALS ===")
for k,v in sorted(global_problems.items(), key=lambda x:-x[1]):
    out.append("%s: %d" % (k, v))
sys.stdout.write("\n".join(out))
