#!/usr/bin/env python3
"""Launch validation only after exclusively creating its complete log."""
import argparse, datetime, json, os, subprocess, sys
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--run-dir',required=True);p.add_argument('--cwd',required=True);p.add_argument('--browser',action='store_true');p.add_argument('command',nargs=argparse.REMAINDER);a=p.parse_args()
cmd=a.command[1:] if a.command[:1]==['--'] else a.command
if not cmd: p.error('command required')
r=Path(a.run_dir).resolve();r.mkdir(parents=True,exist_ok=False)
env=os.environ.copy()
if a.browser:
 if any(x.startswith(('--output','--reporter','--workers')) for x in cmd): p.error('browser runner owns output/reporter/workers flags')
 cmd += ['--output='+str(r/'browser-results'),'--reporter=line,json','--workers=1']
 env['PLAYWRIGHT_JSON_OUTPUT_FILE']=str(r/'report.json')
def write(name,value):
 with (r/name).open('x') as f: json.dump(value,f,indent=2);f.write('\n')
write('command.json',{'argv':cmd,'cwd':str(Path(a.cwd).resolve()),'startedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'browser':a.browser})
with (r/'stdout-stderr.log').open('xb',buffering=0) as log:
 os.fsync(log.fileno())
 try:
  child=subprocess.Popen(cmd,cwd=a.cwd,env=env,stdout=log,stderr=subprocess.STDOUT)
  write('process.json',{'pid':child.pid});print(json.dumps({'runDir':str(r),'pid':child.pid}),flush=True)
  code=child.wait()
 except BaseException as error:
  log.write((type(error).__name__+': '+str(error)+'\n').encode());raise
write('result.json',{'exitCode':code,'finishedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()})
print(json.dumps({'runDir':str(r),'exitCode':code}),flush=True)
sys.exit(code)
