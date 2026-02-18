import sys, json

d = json.load(sys.stdin)
lines = d['snapshot']['lines']

def full_text(i):
    return ''.join(s.get('text','') for s in lines[i].get('spans',[]))

# Compare L2537-2541 vs L2543-2547 (0-indexed: 2536-2540 vs 2542-2546)
for offset in range(5):
    a = 2536 + offset
    b = 2542 + offset
    ta = full_text(a).rstrip()
    tb = full_text(b).rstrip()
    eq = ta == tb
    print(f'L{a+1} vs L{b+1}: eq={eq}, len={len(ta)} vs {len(tb)}')
    if not eq:
        for j in range(min(len(ta), len(tb))):
            if ta[j] != tb[j]:
                print(f'  Diff at char {j}: {repr(ta[j:j+30])} vs {repr(tb[j:j+30])}')
                break
        if len(ta) != len(tb):
            print(f'  Length diff: {len(ta)} vs {len(tb)}')
