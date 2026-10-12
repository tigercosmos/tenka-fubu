import pathlib,json,gzip,hashlib,sys
p=pathlib.Path(sys.argv[1]);s=json.loads((p/'summary.json').read_text());h=lambda b:hashlib.sha256(b).hexdigest()
def raw(n):return gzip.decompress((p/(n+'.gz')).read_bytes())
def read(n):return json.loads(raw(n))
for a in s['artifacts']:
 z=(p/a['path']).read_bytes();b=gzip.decompress(z);assert len(z)==a['gzipBytes'] and len(b)==a['rawBytes'];assert h(z)==a['gzipSHA256'] and h(b)==a['rawSHA256']
for stage in ['before','after','final']:
 q=read('source-'+stage+'-proof.json');assert q['commit']=='5bc1f58628b6c18381b4dce8b6a9b10ee88d4ad8' and q['allMatch'] and len(q['files'])==1528 and not q['extras'] and not q['publicSymlinks'];assert all(x['match'] and x['sha256']==x['actualSHA256'] for x in q['files'])
 q=read('dependency-'+stage+'-proof.json');assert len(q['files'])==14765 and len(q['patches'])==23 and all(x['match'] for x in q['files']+q['patches'])
assert h(raw('published.raw.json'))=='af4ddbc9c9232041f23b3cd37fdb802681d1ffce7a4709eaa7dc5031f6cebe29';assert read('parity-proof.json')['excludedNonvisualCounters']==['armyPlateLayout.runs','geographicLabelLayout.runs','geographicLabelLayout.placementCache','castleRibbonLayout.runs']
assert h(raw('tenka_engine.wasm'))=='e22f559b4b9d6f6348709e028cecdbc2c6f567db2483fa845b48df0554d7bc7d';assert h(raw('simd.wasm'))=='48bed258011b162196ebd4fdf8b9e9dc94081df139d1f1af4294ffcdcc5882a0'
for c in ['overview','operational','close']:
 q=read(c+'.raw.json');assert 'RTX 5070 Ti' in q['environment']['renderer'] and 'Vulkan' in q['environment']['renderer'];assert q['measurement']['resourcesBefore']==q['measurement']['resourcesAfter'];assert '1 failed' in raw(c+'.log').decode()
for q in read('state-resource-proof.json'):assert q['canonicalByteEqual'] and q['resourceObjectsEqual'] and q['canonicalBeforeSha256']==q['canonicalAfterSha256']
for n in ['gpu-before','gpu-after-functional']:
 q=next(x for x in read(n+'.json') if x['context']);assert 'RTX 5070 Ti' in q['renderer'] and 'Vulkan' in q['renderer'] and not q['contextLost']
assert all(x['terminalExit']==0 for x in read('campaign-status.json'));assert '6 passed (42.3s)' in raw('native-six.log').decode()
for a in read('native-six-raw-manifest.json'):assert len(raw(a['artifact']))==a['bytes'] and h(raw(a['artifact']))==a['sha256']
q=read('selected-wasm-url-bytes.json');assert q['observed'] and all(x['url'].endswith('/tenka_engine.wasm') for x in q['observed']);assert any('bodyError' in x for x in q['observed']);assert any(x.get('sha256')==s['scalar']['sha256'] for x in q['observed']);assert all(x['sha256']==s['scalar']['sha256'] and x['bytes']==s['scalar']['bytes'] and 'separately served' in x['proof'] for x in q['separatelyServed']);assert s['cpuProfileExecuted']==False
print('PASS: dualSHA; frozen1528/source/deps14765/23; full9af4; original3strictRED; original6PASS; selectedscalaractualbody/served; state/resources; no profile')
