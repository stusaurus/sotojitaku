"""Content fingerprints keep static Pages clients on the matching release."""
import hashlib,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def version(name):return hashlib.sha256((ROOT/name).read_bytes()).hexdigest()[:12]
p=ROOT/'app.js';s=p.read_text()
for name in ['engine.js','products.js']:
 s=re.sub(r"(\./"+re.escape(name)+r")(?:(?:\?v=)[a-z0-9]+)?",r'\1?v='+version(name),s)
p.write_text(s)
p=ROOT/'index.html';s=p.read_text()
for name in ['app.js','style.css']:
 s=re.sub(r'(["\'])('+re.escape(name)+r')(?:\?v=[a-z0-9]+)?(["\'])',lambda m:m[1]+m[2]+'?v='+version(name)+m[3],s)
p.write_text(s)
