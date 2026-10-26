#!/usr/bin/env python3
"""Read-only heuristic secret/IOC scanner. Emits paths/lines/rule names only.
Run with trusted system Python -I -S. Exit 1 means findings; 2 means incomplete.
"""
import argparse
import base64
import binascii
import json
import os
from pathlib import Path
import re
import subprocess

MAX_BYTES = 2_000_000
SKIP = {'.git', 'node_modules', '.venv', 'venv', '__pycache__', '.next', 'dist', 'build', '.cache'}
RULES = [
 ('openai_style_key', re.compile(rb'\bsk-(?!ant-)(?:(?:proj-|svcacct-)[A-Za-z0-9_-]{40,}|[A-Za-z0-9]{40,})(?![A-Za-z0-9_-])')),
 ('anthropic_style_key', re.compile(rb'\bsk-ant-[A-Za-z0-9_-]{40,}')),
 ('github_token', re.compile(rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})')),
 ('stripe_live_secret', re.compile(rb'\b(?:sk|rk)_live_[A-Za-z0-9]{16,}')),
 ('stripe_test_secret', re.compile(rb'\b(?:sk|rk)_test_[A-Za-z0-9]{16,}')),
 ('huggingface_token', re.compile(rb'\bhf_[A-Za-z0-9]{30,}')),
 ('aws_access_id', re.compile(rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b')),
 ('private_key', re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----')),
 ('credential_url', re.compile(rb'\b(?:postgres(?:ql)?|mysql|redis(?:s)?|mongodb(?:\+srv)?):\/\/[^\s:@/]+:[^\s@/]{8,}@')),
]
IOCS = {'cook.pth', 'cook.py', 'remote_code_loader.lock', 'com.user.gh-token-monitor.plist', 'gh-token-monitor'}

def scan_bytes(data):
 if b'\x00' in data: return []
 found=[]
 for name, pattern in RULES:
  for m in pattern.finditer(data):
   found.append({'rule':name, 'line':data.count(b'\n',0,m.start())+1})
 # Decode payload only; do not validate or transmit the token. Unknown roles
 # and anon JWTs are not secrets under this detector.
 for m in re.finditer(rb'\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+', data):
  try:
   payload=m.group(1); decoded=json.loads(base64.urlsafe_b64decode(payload+b'='*((-len(payload))%4)))
   if isinstance(decoded,dict) and decoded.get('role')=='service_role':
    found.append({'rule':'supabase_service_role_jwt','line':data.count(b'\n',0,m.start())+1})
  except (ValueError,UnicodeError,binascii.Error): pass
 for name, version in [('tensorlake','0.5.'+'144'),('@subql/common','5.8.'+'3'),('litellm','1.107.'+'0')]:
  if name.encode() in data and version.encode() in data:
   found.append({'rule':'review_package_version_'+name.replace('/','_'), 'line':1})
 return found

def git(repo,*args):
 # Read-only plumbing; do not invoke configured pager, external diff or hooks.
 return subprocess.run(['git','--no-pager','-C',str(repo),*args],capture_output=True,check=True).stdout

def eligible(path):
 return not any(part in SKIP for part in Path(path).parts)

def scan_repo(repo, mode):
 repo=Path(repo).resolve(); findings=[]; skipped=[]; count=0
 if mode=='tracked':
  paths=git(repo,'ls-files','-z').split(b'\0')
  for raw in paths:
   if not raw: continue
   rel=os.fsdecode(raw)
   if not eligible(rel): continue
   path=repo/rel
   if any(p.is_symlink() for p in [path,*path.parents] if p!=repo.parent):
    skipped.append({'path':rel,'reason':'symlink'}); continue
   if not path.is_file(): continue
   if path.stat().st_size>MAX_BYTES:
    skipped.append({'path':rel,'reason':'size_limit'}); continue
   try: data=path.read_bytes()
   except OSError:
    skipped.append({'path':rel,'reason':'unreadable'}); continue
   count+=1
   if path.name in IOCS: findings.append({'path':rel,'line':1,'rule':'ioc_filename_review'})
   findings.extend({'path':rel,**f} for f in scan_bytes(data))
 elif mode=='history':
  # Enumerate every blob reachable from local refs, including old/deleted files.
  # Objects themselves never appear in output. Git stores one display path per
  # object; this is not a complete path/commit occurrence index.
  rows=git(repo,'rev-list','--objects','--all').splitlines()
  ids=[]; names={}
  for row in rows:
   parts=row.split(b' ',1); oid=parts[0]
   if len(parts)<2: continue
   name=os.fsdecode(parts[1]); ids.append(oid); names[oid]=name
  if ids:
   r=subprocess.run(['git','--no-pager','-C',str(repo),'cat-file','--batch-check=%(objectname) %(objecttype) %(objectsize)'],input=b'\n'.join(ids)+b'\n',capture_output=True,check=True)
   candidates=[]
   for row in r.stdout.splitlines():
    oid,kind,size=row.split(); rel=names[oid]
    if kind!=b'blob' or not eligible(rel):continue
    if int(size)>MAX_BYTES:
     skipped.append({'path':rel,'reason':'size_limit'});continue
    candidates.append((oid,rel,int(size)))
   # One persistent process. Request/read one bounded object at a time avoids
   # pipe deadlocks and holding all repository contents in memory.
   with subprocess.Popen(['git','--no-pager','-C',str(repo),'cat-file','--batch'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL) as proc:
    for oid,rel,size in candidates:
     proc.stdin.write(oid+b'\n');proc.stdin.flush()
     header=proc.stdout.readline().split()
     if len(header)!=3 or header[0]!=oid or header[1]!=b'blob' or int(header[2])!=size:
      raise OSError('invalid Git batch response')
     data=proc.stdout.read(size)
     if len(data)!=size or proc.stdout.read(1)!=b'\n':raise OSError('truncated Git batch response')
     count+=1
     if Path(rel).name in IOCS: findings.append({'path':rel,'line':1,'rule':'ioc_filename_review'})
     findings.extend({'path':rel,**f} for f in scan_bytes(data))
    proc.stdin.close()
    if proc.wait()!=0:raise OSError('Git batch failed')
 return {'repository':str(repo),'mode':mode,'scanned_objects':count,'findings':findings,'skipped':skipped,'limits':['heuristic detectors; not exhaustive','binary files skipped','dependencies/build folders skipped','2 MB object limit','local refs only for history; no reflogs/unreachable/remote-only objects','history display path may not list every occurrence','package/version co-occurrence requires manual confirmation']}

def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('repository');ap.add_argument('--mode',choices=['tracked','history'],default='tracked');args=ap.parse_args()
 try:r=scan_repo(args.repository,args.mode)
 except (OSError,subprocess.CalledProcessError):
  print(json.dumps({'repository':args.repository,'error':'scan_failed_without_sensitive_diagnostics'}));return 2
 print(json.dumps(r,indent=2,ensure_ascii=True))
 return 2 if r['skipped'] else (1 if r['findings'] else 0)
if __name__=='__main__':raise SystemExit(main())
