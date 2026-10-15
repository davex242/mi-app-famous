import sys,os,json,secrets,uuid,pathlib,time
from preview_api import management,query,request
if '--run-preview' not in sys.argv:
 raise SystemExit('Explicit Preview write opt-in required: python3 training-hosted/preview-acceptance.py --run-preview')
PROJECT='https://jpnsxrzlthkvyphepbao.supabase.co';ROOT=pathlib.Path(os.environ.get('TRAINING_QA_OUTPUT','/workspace/training-qa'));ROOT.mkdir(parents=True,exist_ok=True);run='FICTITIOUS-QA-'+time.strftime('%Y%m%d-%H%M%S',time.gmtime());results=[]

def check(label,condition):
 results.append({'check':label,'passed':bool(condition)});print(('PASS ' if condition else 'FAIL ')+label,flush=True)
 if not condition:raise AssertionError(label)
def api(path,body=None,token=None):
 return request(PROJECT+'/functions/v1/training-preview'+path,token or 'invalid',body)
def lit(v):return "'"+str(v).replace("'","''")+"'"
def account(label,role,service,pub):
 email=run.lower()+'-'+label+'@example.invalid';password=secrets.token_urlsafe(24)
 # Supported administrative creation of isolated, explicitly confirmed QA accounts. No email is sent.
 u=request(PROJECT+'/auth/v1/admin/users',service,{'email':email,'password':password,'email_confirm':True,'user_metadata':{'qa_run':run}},headers={'apikey':service})
 auth=u['id'];app=str(uuid.uuid4())
 query(f"begin;insert into training_private.training_users(id,display_name) values({lit(app)},{lit(run+' '+label)});insert into training_private.training_principals(auth_user_id,app_user_id,role,is_active) values({lit(auth)},{lit(app)},{lit(role)},true);commit;",False)
 session=request(PROJECT+'/auth/v1/token?grant_type=password',pub,{'email':email,'password':password},headers={'apikey':pub})
 return {'auth':auth,'app':app,'token':session['access_token'],'label':label}
try:
 keys=management('/api-keys');service=next(k['api_key'] for k in keys if k['name']=='service_role');pub=next(k['api_key'] for k in keys if k['name']=='anon')
 health=api('/health');check('deployed health initialized',health.get('initialized') is True)
 admin=account('admin','superadmin',service,pub);trainers=[account('trainer-'+str(i),'edit',service,pub) for i in range(5)]
 token=admin['token'];check('real password authentication and server identity',api('/api/me',token=token)['app_user_id']==admin['app'])
 # Seed all content via authorized API routes. Existing real course/catalogue rows are untouched.
 topics=[]
 for d in range(1,15):
  topic=api('/api/topics',{'title':run+' day '+str(d),'category':'FICTITIOUS QA','description':'Isolated fictitious training material','estimated_minutes':30},token)
  api('/api/topics/publish',{'id':topic['id']},token);topics.append(topic['id'])
 programs=[]
 for c in range(3):
  p=api('/api/programs',{'title':run+' course '+str(c),'duration_days':14,'changelog':'Isolated fictitious acceptance data','items':[{'day':d,'topic_id':topics[d-1],'notes':'FICTITIOUS ONLY','material_ids':[]} for d in range(1,15)]},token)
  api('/api/programs/publish',{'id':p['id']},token);programs.append(p)
 hosts=[];enrollments=[]
 for i in range(50):
  hid=str(uuid.uuid4());trainer=trainers[i%5]
  api('/api/identity/host',{'id':None,'display_name':run+' host '+str(i),'mico_id':None,'legacy_host_key':None,'recruiter_id':trainer['app'],'confirmed':True,'expected_hash':None},token)
  # Find only the uniquely labelled QA identity through the authorized admin API.
  identity=api('/api/identity/list',{},token);h=next(h for h in identity['hosts'] if h['display_name']==run+' host '+str(i));hosts.append(h['id'])
  e=api('/api/enrollments',{'host_id':h['id'],'program_version_id':programs[i%3]['id'],'timezone':'America/Costa_Rica'},trainer['token']);enrollments.append(e)
 check('50 fictitious hosts / five trainers / three 14-day programs created',len(hosts)==50 and len(programs)==3)
 e=enrollments[0];old=trainers[0];new=trainers[1]
 second=api('/api/enrollments',{'host_id':hosts[0],'program_version_id':programs[1]['id'],'timezone':'America/Costa_Rica'},old['token'])
 api('/api/enrollments/reassign',{'enrollment_id':e['id'],'trainer_id':new['app']},token)
 wold=api('/api/workspace',token=old['token']);wnew=api('/api/workspace',token=new['token'])
 check('transfer removes old trainer and grants new trainer only the selected course',not any(x['id']==e['id'] for x in wold['enrollments']) and any(x['id']==second['id'] for x in wold['enrollments']) and any(x['id']==e['id'] for x in wnew['enrollments']) and not any(x['id']==second['id'] for x in wnew['enrollments']))
 check('original host recruiter preserved',next(x for x in api('/api/identity/list',{},token)['hosts'] if x['id']==hosts[0])['recruiter_id']==old['app'])
 for index,n in enumerate([10,25,50]):
  target=enrollments[index];actor=new if index==0 else trainers[index]
  bank=[{'prompt':run+f' size {n} question {i}','options':['FICTITIOUS correct','FICTITIOUS wrong'],'correct_option':0} for i in range(n)]
  v=api('/api/exams/publish',{'exam_key':run+f'-{n}','pass_percent':75,'questions':bank},token)
  issued=api('/api/exams/issue',{'enrollment_id':target['id'],'exam_version_id':v['id'],'max_attempts':3},actor['token']);inv=issued['invitation_token']
  check(f'{n}: status reports real bank size',api('/api/quiz/status',{},inv)['question_count']==n)
  for count in [int((n*.75)//1),n]:
   if count*100/n>=75 and count!=n:count-=1
   start=api('/api/quiz/start',{},inv);answers=[{'question_id':q['id'],'selected_option':0 if i<count else 1} for i,q in enumerate(start['questions'])]
   outcome=api('/api/quiz/submit',{'attempt_id':start['attempt_id'],'answers':answers},inv)
   check(f'{n}: persisted grade {count}/{n}',float(outcome['score_percent'])==count*100/n and outcome['passed']==(count*100/n>=75))
   check(f'{n}: retry after response loss is idempotent',api('/api/quiz/submit',{'attempt_id':start['attempt_id'],'answers':answers},inv)['already_submitted'] is True)
  api('/api/exams/revoke',{'assignment_id':issued['assignment']['id']},actor['token'])
 ROOT.joinpath('hosted-fixture.json').write_text(json.dumps({'run':run,'hosts':hosts,'enrollments':enrollments,'programs':programs,'auth_users':[admin['auth']]+[t['auth'] for t in trainers]}))
finally:
 ROOT.joinpath('hosted-results.json').write_text(json.dumps({'run':run,'checks':results},indent=2))
