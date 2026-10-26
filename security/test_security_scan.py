import importlib.util
import base64
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
spec=importlib.util.spec_from_file_location('scan',Path(__file__).with_name('security_scan.py'))
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
class ScanTests(unittest.TestCase):
 def test_secret_redaction_and_line(self):
  value=b'sk-proj-'+b'X'*60
  findings=s.scan_bytes(b'hello\nKEY='+value)
  self.assertEqual(findings,[{'rule':'openai_style_key','line':2}])
  self.assertNotIn(value.decode(),str(findings))
 def test_placeholder_and_binary(self):
  self.assertEqual(s.scan_bytes(b'OPENAI_API_KEY=your-key-here'),[])
  self.assertEqual(s.scan_bytes(b'\x00sk-proj-'+b'X'*60),[])
 def test_new_token_formats_and_no_anthropic_double_count(self):
  examples=[('hf_'+'H'*36,'huggingface_token'),('sk_test_'+'S'*24,'stripe_test_secret'),('sk-ant-api03-'+'A'*60,'anthropic_style_key')]
  for token,rule in examples:
   findings=s.scan_bytes(token.encode())
   self.assertEqual(findings,[{'rule':rule,'line':1}])
   self.assertNotIn(token,json.dumps(findings))
 def test_jwt_roles_and_redaction(self):
  def jwt(payload):
   enc=lambda b:base64.urlsafe_b64encode(b).rstrip(b'=')
   return enc(b'{"alg":"HS256"}')+b'.'+enc(json.dumps(payload).encode())+b'.syntheticSignature'
  privileged=jwt({'role':'service_role','iss':'supabase'})
  self.assertEqual(s.scan_bytes(b'line1\n'+privileged),[{'rule':'supabase_service_role_jwt','line':2}])
  self.assertNotIn(privileged.decode(),json.dumps(s.scan_bytes(privileged)))
  for payload in [{'role':'anon'},{'role':'unknown'},[],{'sub':'person'}]:self.assertEqual(s.scan_bytes(jwt(payload)),[])
  self.assertEqual(s.scan_bytes(b'eyJhbGciOiJIUzI1NiJ9.badpayload.signature'),[])
 def test_package_version_review(self):
  for name,version in [("tensorlake","0.5."+"144"),("@subql/common","5.8."+"3"),("litellm","1.107."+"0")]:
   self.assertEqual(s.scan_bytes((name+" "+version).encode()),[{"rule":"review_package_version_"+name.replace("/","_"),"line":1}])
 def test_deleted_history(self):
  with tempfile.TemporaryDirectory() as d:
   def git(*args):return subprocess.run(['git','-C',d,*args],check=True,capture_output=True)
   git('init');git('config','user.name','Synthetic Test');git('config','user.email','test@example.invalid')
   p=Path(d)/'old.txt';p.write_text('sk-proj-'+'Y'*60)
   git('add','old.txt');git('commit','-m','fixture');p.unlink();(Path(d)/'safe.txt').write_text('safe\nsecond line\n');git('add','-A');git('commit','-m','remove')
   self.assertEqual(s.scan_repo(d,'tracked')['findings'],[])
   result=s.scan_repo(d,'history');self.assertEqual(result['scanned_objects'],2);f=result['findings'];self.assertEqual(f[0]['rule'],'openai_style_key')
 def test_symlink_not_read(self):
  with tempfile.TemporaryDirectory() as d:
   subprocess.run(['git','-C',d,'init'],check=True,capture_output=True)
   (Path(d)/'link').symlink_to('/etc/passwd')
   subprocess.run(['git','-C',d,'add','link'],check=True,capture_output=True)
   r=s.scan_repo(d,'tracked');self.assertEqual(r['scanned_objects'],0);self.assertEqual(r['skipped'][0]['reason'],'symlink')
if __name__=='__main__':unittest.main()
