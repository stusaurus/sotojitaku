"""Content fingerprints keep static Pages clients on the matching release."""
import hashlib,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def version(name):return hashlib.sha256((ROOT/name).read_bytes()).hexdigest()[:12]
for app_name,prefix in [('app.js','./'),('camp/app.js','../')]:
 p=ROOT/app_name;s=p.read_text()
 for name in ['engine.js','products.js']:
  s=re.sub(r"("+re.escape(prefix+name)+r")(?:(?:\?v=)[a-z0-9]+)?",r'\1?v='+version(name),s)
 p.write_text(s)
p=ROOT/'camp/index.html';s=p.read_text()
for name in ['app.js','style.css']:
 s=re.sub(r'(["\'])((?:\.\./|\./)?'+re.escape(name)+r')(?:\?v=[a-z0-9]+)?(["\'])',lambda m:m[1]+m[2]+'?v='+version('camp/app.js' if name=='app.js' else name)+m[3],s)
p.write_text(s)

p=ROOT/'index.html';s=p.read_text()
s=re.sub(r'home\.css\?v=[a-zA-Z0-9-]+','home.css?v='+version('home.css'),s)
p.write_text(s)
