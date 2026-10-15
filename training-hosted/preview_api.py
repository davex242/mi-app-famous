# Management operations are fixed to the explicitly authorized training project.
import os,json,urllib.request,urllib.error,pathlib
REF='jpnsxrzlthkvyphepbao';BASE='https://api.supabase.com/v1/projects/'+REF

def request(url,token,body=None,method=None,headers=None):
 h={'Authorization':'Bearer '+token};h.update(headers or {})
 if body is not None and not isinstance(body,bytes):body=json.dumps(body).encode();h['Content-Type']='application/json'
 r=urllib.request.Request(url,data=body,headers=h,method=method)
 try:
  with urllib.request.urlopen(r,timeout=90) as f:
   b=f.read();return json.loads(b) if 'json' in f.headers.get('Content-Type','') else b
 except urllib.error.HTTPError as e:
  raise RuntimeError(str(e.code)+' '+e.read(1200).decode()) from None

def management(path,body=None,method=None):return request(BASE+path,os.environ['SUPABASE_ACCESS_TOKEN'],body,method)
def query(q,readonly=True):return management('/database/query',{'query':q,'read_only':readonly})
