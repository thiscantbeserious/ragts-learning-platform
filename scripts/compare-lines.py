import sys, json

d = json.load(sys.stdin)
lines = d['snapshot']['lines']

def lt(idx):
    return ''.join(s.get('text','') for s in lines[idx].get('spans',[])).rstrip()

for i in range(2749, min(2760, len(lines))):
    txt = lt(i)
    print(f'L{i+1} ({len(txt)} chars): {repr(txt[:200])}')

t1 = lt(2749)
t2 = lt(2755)
print(f'\nL2750 == L2756: {t1 == t2}')
if t1 != t2:
    for j in range(min(len(t1), len(t2))):
        if t1[j] != t2[j]:
            print(f'  First diff at char {j}: {repr(t1[j:j+20])} vs {repr(t2[j:j+20])}')
            break

# Check next pairs
for a, b in [(2750, 2756), (2751, 2757)]:
    ta = lt(a)
    tb = lt(b)
    eq = ta == tb
    print(f'L{a+1} == L{b+1}: {eq}  ({repr(ta[:80])})')
