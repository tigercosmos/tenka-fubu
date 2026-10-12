import pathlib,json,gzip,hashlib,sys
p=pathlib.Path(sys.argv[1]);s=json.loads((p/'summary.json').read_text());h=lambda b:hashlib.sha256(b).hexdigest()
def raw(n):return gzip.decompress((p/(n+'.gz')).read_bytes())
def read(n):return json.loads(raw(n))
for a in s['artifacts']:
 z=(p/a['path']).read_bytes();b=gzip.decompress(z);assert len(z)==a['gzipBytes'] and len(b)==a['rawBytes'];assert h(z)==a['gzipSHA256'] and h(b)==a['rawSHA256']
for stage in ['before','after','final']:
 q=read('source-'+stage+'-proof.json');assert q['commit']=='3633c61ba6608d32fc6c110e972b7fb0d9b12f7c' and q['allMatch'] and len(q['files'])==1528 and not q['extras'] and not q['publicSymlinks'];assert all(x['match'] and x['sha256']==x['actualSHA256'] for x in q['files'])
 q=read('dependency-'+stage+'-proof.json');assert len(q['files'])==14765 and len(q['patches'])==23 and all(x['match'] for x in q['files']+q['patches'])
assert h(raw('published.raw.json'))=='af4ddbc9c9232041f23b3cd37fdb802681d1ffce7a4709eaa7dc5031f6cebe29';assert read('parity-proof.json')['excludedNonvisualCounters']==['armyPlateLayout.runs','geographicLabelLayout.runs','geographicLabelLayout.placementCache','castleRibbonLayout.runs']
assert h(raw('tenka_engine.wasm'))=='4935459682fdb5a509d72793518ce1343b49d8c07e041300b9262e6ca8acd759';assert h(raw('simd.wasm'))=='f33324b483918c6671bbe368cd9065368403ae83ebfa27c36cb49053fd9fce77'
for c in ['overview','operational','close']:
 q=read(c+'.raw.json');assert 'RTX 5070 Ti' in q['environment']['renderer'] and 'Vulkan' in q['environment']['renderer'];assert q['measurement']['resourcesBefore']==q['measurement']['resourcesAfter'];assert '1 failed' in raw(c+'.log').decode()
for q in read('state-resource-proof.json'):assert q['canonicalByteEqual'] and q['resourceObjectsEqual'] and q['canonicalBeforeSha256']==q['canonicalAfterSha256']
for n in ['gpu-before','gpu-after-functional']:
 q=next(x for x in read(n+'.json') if x['context']);assert 'RTX 5070 Ti' in q['renderer'] and 'Vulkan' in q['renderer'] and not q['contextLost']
assert all(x['terminalExit']==0 for x in read('campaign-status.json'));assert '6 passed (42.6s)' in raw('native-six.log').decode()
for a in read('native-six-raw-manifest.json'):assert len(raw(a['artifact']))==a['bytes'] and h(raw(a['artifact']))==a['sha256']
q=read('selected-wasm-url-bytes.json');assert q['observed'] and all(x['url'].endswith('/tenka_engine.wasm') for x in q['observed']);assert any('bodyError' in x for x in q['observed']);assert any(x.get('sha256')==s['scalar']['sha256'] for x in q['observed']);assert all(x['sha256']==s['scalar']['sha256'] and x['bytes']==s['scalar']['bytes'] and 'separately served' in x['proof'] for x in q['separatelyServed']);assert s['cpuProfileExecuted']==False
print('PASS: dualSHA; frozen1528/source/deps14765/23; full9af4; original3strictRED; original6PASS; selectedscalaractualbody/served; state/resources; no profile')
