"""Check required export integrity and the contribution's 8 MiB path budget."""
from pathlib import Path
import json, os, re, struct, zipfile

root = Path(__file__).resolve().parent.parent
excluded_dirs = {'.git', '.github', '.imd', 'node_modules', '.cache', '.npm', '.vite', 'npm-cache'}
files = []
for directory, dirs, names in os.walk(root):
    relative = Path(directory).relative_to(root)
    dirs[:] = [d for d in dirs if d not in excluded_dirs and not (relative == Path('test') and d == 'scratch')]
    for name in names:
        if name.startswith('.env') or name.endswith('.tsbuildinfo'):
            continue
        files.append(Path(directory) / name)

required = ['dist/index.html', 'src/App.tsx', 'src/i18n.ts', 'src/render.worker.ts', 'scripts/snapshot.ts', 'public/traits-snapshot.json', 'dist/traits-snapshot.json', 'package-lock.json', 'README.md', 'DESIGN.md']
for name in required:
    assert (root / name).is_file(), f'Missing {name}'
assert not (root / '.gitmodules').exists(), 'Submodules are not permitted'
assert not any(p.is_symlink() for p in files), 'Deliverable must not rely on symlinks'

html = (root / 'dist/index.html').read_text()
for path in re.findall(r'(?:src|href)="([^"#]+)"', html):
    assert path.startswith('./'), f'Asset URL must be relative: {path}'
    assert (root / 'dist' / path).is_file(), f'Missing exported asset: {path}'
for name in ['description', 'og:title', 'og:image']:
    assert name in html, f'Missing metadata: {name}'
for source in (root / 'public').iterdir():
    if source.is_file():
        target = root / 'dist' / source.name
        assert target.read_bytes() == source.read_bytes(), f'Stale public asset: {source.name}'

snapshot = json.loads((root / 'public/traits-snapshot.json').read_text())
assert len(snapshot['tokens']) == snapshot['supply']
assert len(snapshot['traits']) == 11
assert len(snapshot['tokens']) + len(snapshot['skipped']) == snapshot['maxId']
assert all(len(row) == 11 and all(isinstance(v, str) for v in row) for row in snapshot['tokens'].values())
assert 'data:image' not in json.dumps(snapshot), 'Snapshot must not contain images'
examples = json.loads((root / 'public/examples.json').read_text())
assert len(examples) >= 3 and all(t['image'].startswith('data:image/svg+xml') for t in examples)
image = (root / 'public/social.png').read_bytes()
assert struct.unpack('>II', image[16:24]) == (1200, 630)
with zipfile.ZipFile(root / 'public/source.zip') as archive:
    names = archive.namelist()
    assert all('node_modules/' not in n and '.cache/' not in n and not n.endswith('.tgz') for n in names)
    assert 'public/source.zip' not in names
    for name in ['src/App.tsx', 'src/style.css', 'src/render.worker.ts', 'package-lock.json', 'scripts/snapshot.ts', 'public/traits-snapshot.json', 'README.md']:
        assert name in names, f'Source archive missing {name}'
        assert archive.read(name) == (root / name).read_bytes(), f'Source archive is stale: {name}'
    for source in (root / 'src').rglob('*'):
        if source.is_file():
            assert str(source.relative_to(root)) in names, f'Source archive omitted {source.name}'
    for name in names:
        assert not Path(name).is_absolute() and '..' not in Path(name).parts
        assert archive.read(name) == (root / name).read_bytes(), f'Source archive is stale: {name}'

total = sum(p.stat().st_size for p in files)
assert total <= 8388608, f'Over 8 MiB budget: {total}'
print(json.dumps({'files': len(files), 'bytes': total, 'budget': 8388608, 'remaining': 8388608-total, 'snapshotPopulation': len(snapshot['tokens']), 'snapshotBlock': snapshot['blockNumber'], 'relativeExport': True, 'sourceArchiveComplete': True}, indent=2))
