"""Create a dependency-free local extension package from explicitly listed files."""
from pathlib import Path
import shutil, json, zipfile
root=Path(__file__).resolve().parents[1]
out=root/'release'/'Fillframe'
out.mkdir(parents=True,exist_ok=True)
files=['manifest.json','LICENSE','THIRD-PARTY-LICENSE.txt','README.md','SETUP-PROMPT.md']+[f'src/{name}' for name in ['content_script.js','popup.html','popup.css','popup.js','options.html','options.css','options.js']]+[f'assets/icons/icon{n}.png' for n in [16,32,48,128]]
for name in files:
 dest=out/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/name,dest)
with zipfile.ZipFile(root/'release'/('Fillframe-'+json.loads((root/'manifest.json').read_text())['version']+'.zip'),'w',zipfile.ZIP_DEFLATED) as z:
 for name in files:z.write(out/name,'Fillframe/'+name)
print('Packaged release/Fillframe and versioned ZIP')
