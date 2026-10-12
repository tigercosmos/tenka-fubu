#!/usr/bin/env python3
"""Preserve lexical UID source references for pinned Pixi 8.19 runtime review."""
import json
import re
from pathlib import Path
root=Path.cwd()
lib=root/'node_modules/pixi.js/lib'
all_rows=[]
for path in sorted(lib.rglob('*')):
 if path.suffix not in ('.js','.mjs'):continue
 for number,line in enumerate(path.read_text().splitlines(),1):
  if '.uid' in line:
   all_rows.append({'path':str(path.relative_to(root)),'line':number,'source':line.strip()})
relevant=[]
patterns=(r'\bsource\.uid\b',r'\btexture\._source\.uid\b',r'\bt\.uid\b',
          r'\btextures\[i\]\.uid\b',r'\bcurrent\.uid\b')
for row in all_rows:
 if any(re.search(p,row['source']) for p in patterns):relevant.append(row)
sentinel=[row for row in all_rows if re.search(r'(?:\.uid\s*(?:===?|!==?)\s*-?1\b|-?1\s*(?:===?|!==?)\s*[^;]*\.uid)',row['source'])]
comparison=[row for row in all_rows if re.search(r'\.uid\s*(?:===?|!==?|<=?|>=?)\s*-?[01]\b',row['source'])]
bitwise=[row for row in relevant if re.search(r'\^=|>>>|<<|>>|\s[&|^]\s',row['source'])]
report={'pinnedPixiVersion':'8.19.0','allUidLineCount':len(all_rows),
        'relevantLexicalRows':relevant,'sentinelMinusOneRows':sentinel,
        'zeroOrOneComparisonRows':comparison,'relevantBitwiseRows':bitwise,
        'allUidRows':all_rows,
        'textureSourceDeclaration':'readonly uid: number',
        'batchTextureArrayDeclaration':'ids: Record<number, number>'}
print(json.dumps(report,indent=2))
