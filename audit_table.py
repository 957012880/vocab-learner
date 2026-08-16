import sys, os, json, glob, re

base = sys.argv[1]
files = sorted(glob.glob(os.path.join(base, "*.json")))
CTRL = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f]')
CJK = re.compile(r'[\u4e00-\u9fff]')
REPL = '\ufffd'

rows=[]
for path in files:
    name=os.path.basename(path)
    n=pe=bl=0
    miss_ph=empty_ex=nonascii=dup=moj=0
    seen={}
    with open(path, encoding='utf-8') as f:
        for line in f:
            s=line.strip()
            if not s: bl+=1; continue
            try: o=json.loads(s)
            except: pe+=1; continue
            n+=1
            cw=((o.get('content') or {}).get('word') or {})
            word=o.get('headWord') or cw.get('wordHead','')
            cb=cw.get('content') or {}
            uk=cb.get('ukphone','') or ''; us=cb.get('usphone','') or ''
            sent=cb.get('sentence') or {}; ss=sent.get('sentences') or []
            ex=ss[0].get('sContent','') if ss else ''
            if not (us or uk).strip(): miss_ph+=1
            if not ex.strip(): empty_ex+=1
            if word and not re.match(r'^[\x00-\x7f]*$', word): nonascii+=1
            blob=json.dumps(o, ensure_ascii=False)
            if REPL in blob: moj+=1
            wk=(word or '').strip().lower()
            if wk:
                seen[wk]=seen.get(wk,0)+1
    dups=sum(v-1 for v in seen.values() if v>1)
    flags=[]
    if pe: flags.append("PARSE_ERR")
    if miss_ph: flags.append("phon%d"%miss_ph)
    if empty_ex: flags.append("ex%d"%empty_ex)
    if nonascii: flags.append("na%d"%nonascii)
    if moj: flags.append("moj%d"%moj)
    if dups: flags.append("dup%d"%dups)
    rows.append((name,n,pe,miss_ph,empty_ex,nonascii,moj,dups,"; ".join(flags)))

print("| File | Entries | ParseErr | MissPhon | EmptyEx | NonASCIIword | Mojibake | DupWords | Flags |")
print("|---|---|---|---|---|---|---|---|---|")
for r in rows:
    print("| %s | %d | %d | %d | %d | %d | %d | %d | %s |" % r)

tot=sum(r[1] for r in rows)
tot_mp=sum(r[3] for r in rows); tot_ex=sum(r[4] for r in rows)
tot_na=sum(r[5] for r in rows); tot_moj=sum(r[6] for r in rows); tot_dup=sum(r[7] for r in rows)
print("\n| **TOTAL** | **%d** | | **%d** | **%d** | **%d** | **%d** | **%d** | |" % (tot,tot_mp,tot_ex,tot_na,tot_moj,tot_dup))
