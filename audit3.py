import sys, os, json, glob

base = sys.argv[1]
files = sorted(glob.glob(os.path.join(base, "*.json")))

def words_of(path):
    ws=set()
    with open(path, encoding='utf-8') as f:
        for line in f:
            s=line.strip()
            if not s: continue
            o=json.loads(s)
            w=o.get('headWord') or ((o.get('content') or {}).get('word') or {}).get('wordHead','')
            if w: ws.add(w.strip().lower())
    return ws

total=0
per={}
for p in files:
    w=words_of(p)
    per[os.path.basename(p)]=len(w)
    total+=len(w)
print("TOTAL entries (sum of all files, counting dups across files):", total)
print("FILE COUNT:", len(files))

# check luan duplicates
pairs=[('CET4_2.json','CET4luan_2.json'),('CET4_1.json','' ),('CET6_2.json','CET6luan_1.json'),('GMAT_2.json','GMATluan_2.json'),('Level4_2.json','Level4luan_2.json')]
print("\nLUAN vs BASE word-set overlap:")
for a,b in pairs:
    if not b: continue
    pa=os.path.join(base,a); pb=os.path.join(base,b)
    if os.path.exists(pa) and os.path.exists(pb):
        wa=words_of(pa); wb=words_of(pb)
        print("%s (%d) vs %s (%d): identical=%s  overlap=%d/%d" % (a,len(wa),b,len(wb), wa==wb, len(wa&wb), max(len(wa),len(wb))))

# find biggest files by entry
print("\nTOP 10 files by entry count:")
for k,v in sorted(per.items(), key=lambda x:-x[1])[:10]:
    print("  %s: %d" % (k,v))
