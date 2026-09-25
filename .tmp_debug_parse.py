from pathlib import Path
path = Path('c:/Users/Cosmo/OneDrive/Desktop/geofs-live-radar-main/boc/client.user.js')
src = path.read_text(encoding='utf-8')
print('length:', len(src))
print('backticks:', src.count('`'))
count = 0
for i, line in enumerate(src.splitlines(), 1):
    if '`' in line:
        print('line', i, 'contains backticks')
    count += line.count('`')
    if count % 2 == 1:
        print('odd backtick balance at line', i)
        break
else:
    print('backtick balance is even')
