import sys, os, json, glob, re

base = sys.argv[1]
files = sorted(glob.glob(os.path.join(base, "*.json")))
REPL = '\ufffd'
CJK = re.compile(r'[\u4e00-\u9fff]')

def norm(obj):
    head = obj.get('headWord','')
    cw = (obj.get('content') or {}).get('word') or {}
    word = head or cw.get('wordHead','')
    cb = cw.get('content') or {}
    uk = cb.get('ukphone','') or ''
    us = cb.get('usphone','') or ''
    sent = cb.get('sentence') or {}
    sents = sent.get('sentences') or []
    ex = sents[0].get('sContent','') if sents else ''
    return word, uk, us, ex

print("=== word_non_ascii EXAMPLES (non-ASCII chars shown) ===")
cnt=0
for path in files:
    with open(path, encoding='utf-8') as f:
        for line in f:
            s=line.strip()
            if not s: continue
            obj=json.loads(s)
            word,uk,us,ex = norm(obj)
            if word and not re.match(r'^[\x00-\x7f]*$', word):
                cnt+=1
                if cnt<=30:
                    nonascii = [c for c in word if ord(c)>127]
                    print("%s | word=%r | nonascii_codepoints=%s" % (os.path.basename(path), word, [hex(ord(c)) for c in nonascii]))
print("TOTAL word_non_ascii =", cnt)

print("\n=== word_has_CJK (word contains Chinese) ===")
for path in files:
    with open(path, encoding='utf-8') as f:
        for line in f:
            s=line.strip()
            if not s: continue
            obj=json.loads(s)
            word,uk,us,ex = norm(obj)
            if CJK.search(word or ''):
                print("%s | word=%r uk=%r us=%r" % (os.path.basename(path), word, uk, us))

print("\n=== mojibake_replacement_char EXAMPLES (U+FFFD) ===")
c=0
for path in files:
    with open(path, encoding='utf-8') as f:
        for line in f:
            s=line.strip()
            if not s: continue
            obj=json.loads(s)
            blob=json.dumps(obj, ensure_ascii=False)
            if REPL in blob:
                c+=1
                word,uk,us,ex = norm(obj)
                # locate field
                field='?'
                for k,v in obj.items():
                    if REPL in json.dumps(v, ensure_ascii=False):
                        field=k; break
                if c<=20:
                    print("%s | word=%r field=%s uk=%r ex=%r" % (os.path.basename(path), word, field, uk, ex[:80]))
print("TOTAL mojibake entries =", c)

print("\n=== duplicate_words EXAMPLES (first dup per file) ===")
for path in files:
    seen={}
    dups=[]
    with open(path, encoding='utf-8') as f:
        for line in f:
            s=line.strip()
            if not s: continue
            obj=json.loads(s)
            word,uk,us,ex = norm(obj)
            wk=(word or '').strip().lower()
            if wk:
                if wk in seen:
                    if wk not in dups: dups.append(wk)
                else:
                    seen[wk]=1
    if dups:
        print("%s -> %s" % (os.path.basename(path), dups[:8]))
