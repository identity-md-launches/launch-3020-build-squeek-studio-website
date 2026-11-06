"""Bundle the complete rebuildable source for the static site's Source link."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root=Path(__file__).resolve().parent.parent
files=[]
for name in ['src','scripts','public','licenses','artifacts']:
 for p in (root/name).rglob('*'):
  if p.is_file() and p.suffix not in ['.zip','.pyc'] and '__pycache__' not in p.parts:
   files.append(p)
for name in ['.gitignore','package.json','package-lock.json','tsconfig.json','tsconfig.runtime.json','vite.config.ts','index.html','README.md','DESIGN.md','THIRD_PARTY_NOTICES.md']:
 p=root/name
 if p.exists():files.append(p)
with ZipFile(root/'public/source.zip','w',ZIP_DEFLATED,compresslevel=9) as archive:
 for p in sorted(files):archive.write(p,p.relative_to(root))
print('public/source.zip:',(root/'public/source.zip').stat().st_size,'bytes;',len(files),'source files')
