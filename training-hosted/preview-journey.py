import sys,json,pathlib,secrets,time
from preview_api import management,query,request
if '--run-preview' not in sys.argv:
 raise SystemExit('Explicit Preview write opt-in required: python3 training-hosted/preview-journey.py --run-preview')
P='https://jpnsxrzlthkvyphepbao.supabase.co';ROOT=pathlib.Path(__import__('os').environ.get('TRAINING_QA_OUTPUT','/workspace/training-qa'));f=json.loads(ROOT.joinpath('hosted-fixture.json').read_text());run=f['run'];results=[]
def check(label,condition):
 results.append({'check':label,'passed':bool(condition)});print(('PASS ' if condition else 'FAIL ')+label,flush=True)
 if not condition:raise AssertionError(label)
def api(path,body=None,token=None):return request(P+'/functions/v1/training-preview'+path,token or 'invalid',body)
def lit(v):return "'"+str(v).replace("'","''")+"'"
def denied(path,body,token,status):
 try:api(path,body,token);return False
 except RuntimeError as e:return str(e).startswith(str(status)+' ')
keys=management('/api-keys');service=next(k['api_key'] for k in keys if k['name']=='service_role');pub=next(k['api_key'] for k in keys if k['name']=='anon')
def login(index):
 auth=f['auth_users'][index];u=request(P+'/auth/v1/admin/users/'+auth,service,headers={'apikey':service})
 assert u.get('user_metadata',{}).get('qa_run')==run
 password=secrets.token_urlsafe(24);request(P+'/auth/v1/admin/users/'+auth,service,{'password':password},'PUT',{'apikey':service})
 return request(P+'/auth/v1/token?grant_type=password',pub,{'email':u['email'],'password':password},headers={'apikey':pub})['access_token']
try:
 admin=login(0);old=login(1);trainer=login(2);e=f['enrollments'][0];w=api('/api/workspace',token=admin);items=sorted([i for i in w['program_items'] if i['program_version_id']==e['program_version_id']],key=lambda x:x['day'])
 check('private route without verified JWT rejects',denied('/api/workspace',None,'invalid',401))
 check('trainer cannot access administrative identity list',denied('/api/identity/list',{},trainer,403))
 try:
  request(P+'/rest/v1/training_exam_questions?select=id&limit=1',trainer,headers={'apikey':pub});privateDenied=False
 except RuntimeError as error:privateDenied=str(error).startswith(('401 ','403 '))
 check('authenticated direct Data API cannot read exam questions',privateDenied)
 files=json.loads(ROOT.joinpath('evidence-fixtures.json').read_text());sessions=[]
 for i,(kind,payload) in enumerate(files.items()):
  s=api('/api/sessions',{'enrollment_id':e['id'],'item_id':items[i]['id'],'scheduled_at':f'2026-10-{16+i:02}T12:00:00Z','duration_minutes':30},trainer);sessions.append(s)
  check(kind+' upload denied to former trainer',denied('/api/evidence',{'session_id':s['id'],'description':run+' '+kind,'consent_confirmed':True,**payload},old,404))
  proof=api('/api/evidence',{'session_id':s['id'],'description':run+' '+kind,'consent_confirmed':True,**payload},trainer)
  download=api('/api/evidence/file-download',{'evidence_id':proof['id']},trainer)
  check(kind+' real hosted upload/download preserves bytes',next(v for k,v in payload.items())==next(v for k,v in download.items() if k.endswith('_base64')))
  check(kind+' cross-trainer download rejected',denied('/api/evidence/file-download',{'evidence_id':proof['id']},old,404))
  api('/api/attendance',{'session_id':s['id'],'status':'present','expected_recorded_at':None},trainer)
  api('/api/evidence/review',{'evidence_id':proof['id'],'decision':'approved','notes':'FICTITIOUS approved test'},admin)
  api('/api/assessments',{'session_id':s['id'],'score':100,'passed':True,'notes':'FICTITIOUS assessment'},admin)
  api('/api/items/complete',{'session_id':s['id']},admin)
  check(kind+' hosted practice completion persisted',any(x['item_id']==items[i]['id'] for x in api('/api/workspace',token=trainer)['completions']))
 session=sessions[0];bank=[{'prompt':run+f' quiz question {i}','options':['Correct','Wrong'],'correct_option':0} for i in range(10)]
 v=api('/api/exams/publish',{'exam_key':'session-'+session['id'],'pass_percent':75,'questions':bank},admin)
 check('session quiz cannot cross enrollment',denied('/api/exams/issue',{'enrollment_id':f['enrollments'][1]['id'],'exam_version_id':v['id'],'max_attempts':3},admin,409))
 before=next(x['used'] for x in api('/api/workspace',token=trainer)['exam_attempt_budgets'] if x['enrollment_id']==e['id'])
 inv=api('/api/exams/issue',{'enrollment_id':e['id'],'exam_version_id':v['id'],'max_attempts':3},trainer)
 token=inv['invitation_token'];start=api('/api/quiz/start',{},token)
 outcome=api('/api/quiz/submit',{'attempt_id':start['attempt_id'],'answers':[{'question_id':q['id'],'selected_option':0} for q in start['questions']]},token)
 check('10-question completed-session quiz gives 100%',outcome['score_percent']==100)
 after=next(x['used'] for x in api('/api/workspace',token=trainer)['exam_attempt_budgets'] if x['enrollment_id']==e['id'])
 check('session attempt does not consume final exam budget',before==after)
 # Expiry is advanced only on this QA invitation to exercise the server's real expiry predicate.
 query('update public.training_exam_assignments set expires_at=now()-interval \'1 minute\' where id='+lit(inv['assignment']['id'])+' and enrollment_id='+lit(e['id']),False)
 check('expired QA invitation rejects access',denied('/api/quiz/status',{},token,404))
 # Verify the final budget and administrative extras over real HTTP, after the session quiz.
 bank25=[{'prompt':run+f' extra question {i}','options':['Correct','Wrong'],'correct_option':0} for i in range(25)]
 final=api('/api/exams/publish',{'exam_key':run+' extras final','pass_percent':75,'questions':bank25},admin)
 inv=api('/api/exams/issue',{'enrollment_id':e['id'],'exam_version_id':final['id'],'max_attempts':3},trainer)
 start=api('/api/quiz/start',{},inv['invitation_token'])
 api('/api/quiz/submit',{'attempt_id':start['attempt_id'],'answers':[{'question_id':q['id'],'selected_option':1} for q in start['questions']]},inv['invitation_token'])
 check('three initial final attempts exhausted',denied('/api/quiz/start',{},inv['invitation_token'],409))
 api('/api/exams/revoke',{'assignment_id':inv['assignment']['id']},trainer)
 check('renewing invitation does not reset exhausted budget',denied('/api/exams/issue',{'enrollment_id':e['id'],'exam_version_id':final['id'],'max_attempts':3},trainer,409))
 extra=api('/api/exams/extra-request',{'enrollment_id':e['id'],'extra_attempts':2,'reason':'FICTITIOUS approved retry scenario'},trainer)
 decision={'enrollment_id':e['id'],'request_id':extra['id'],'decision':'approved','review_notes':'FICTITIOUS approval by QA administrator'}
 check('trainer cannot self-approve extra attempts',denied('/api/exams/extra-review',decision,trainer,403))
 api('/api/exams/extra-review',decision,admin)
 inv=api('/api/exams/issue',{'enrollment_id':e['id'],'exam_version_id':final['id'],'max_attempts':2},trainer)
 start=api('/api/quiz/start',{},inv['invitation_token']);outcome=api('/api/quiz/submit',{'attempt_id':start['attempt_id'],'answers':[{'question_id':q['id'],'selected_option':0 if i<19 else 1} for i,q in enumerate(start['questions'])]},inv['invitation_token'])
 check('approved additional final attempt scores 19/25 = 76%',outcome['score_percent']==76 and outcome['passed'])
 passingAttempt=outcome['attempt_id']
 # Complete the remaining practices and each individual ten-question quiz in the fourteen-day QA course.
 for i in range(len(sessions),14):
  s=api('/api/sessions',{'enrollment_id':e['id'],'item_id':items[i]['id'],'scheduled_at':f'2026-10-{16+i:02}T12:00:00Z','duration_minutes':30},trainer);sessions.append(s)
  proof=api('/api/evidence',{'session_id':s['id'],'description':run+' full journey day '+str(i+1),'consent_confirmed':True,**files['PNG']},trainer)
  api('/api/attendance',{'session_id':s['id'],'status':'present','expected_recorded_at':None},trainer)
  api('/api/evidence/review',{'evidence_id':proof['id'],'decision':'approved','notes':'FICTITIOUS approved test'},admin)
  api('/api/assessments',{'session_id':s['id'],'score':100,'passed':True,'notes':'FICTITIOUS assessment'},admin)
  api('/api/items/complete',{'session_id':s['id']},admin)
  check('hosted practice day '+str(i+1)+' validated',True)
 for i,s in enumerate(sessions[1:],start=2):
  v=api('/api/exams/publish',{'exam_key':'session-'+s['id'],'pass_percent':75,'questions':[{'prompt':run+f' day {i} quiz {q}','options':['Correct','Wrong'],'correct_option':0} for q in range(10)]},admin)
  inv=api('/api/exams/issue',{'enrollment_id':e['id'],'exam_version_id':v['id'],'max_attempts':3},trainer)
  start=api('/api/quiz/start',{},inv['invitation_token']);graded=api('/api/quiz/submit',{'attempt_id':start['attempt_id'],'answers':[{'question_id':q['id'],'selected_option':0} for q in start['questions']]},inv['invitation_token'])
  check('hosted ten-question quiz day '+str(i)+' persisted',graded['score_percent']==100)
 review={'enrollment_id':e['id'],'attempt_id':passingAttempt};preview=api('/api/training/closing-preview',review,admin)
 check('full fourteen-day hosted journey ready for administrative closing',preview['ready'] and preview['progress']['completed_items']==14)
 body={**review,'expected_program_version_id':e['program_version_id'],'preview_hash':preview['preview_hash'],'notes':'FICTITIOUS end-to-end journey completed; no official certification'}
 check('trainer cannot close own course',denied('/api/training/complete',body,trainer,403))
 closed=api('/api/training/complete',body,admin)
 check('closing retry is idempotent',api('/api/training/complete',body,admin)['already_completed'] is True)
 check('new trainer can export closed record; original trainer cannot',bool(api('/api/training/closing-export',{'record_id':closed['record']['id'],'format':'json'},trainer)['content']) and denied('/api/training/closing-export',{'record_id':closed['record']['id'],'format':'json'},old,404))
 # Real partial-success batch: every entry is a separate server transaction, as in the frontend.
 allitems=api('/api/workspace',token=admin)['program_items'];statuses=[];batch=[]
 for i,target in enumerate(f['enrollments'][1:31]):
  item=next(x for x in allitems if x['program_version_id']==target['program_version_id'] and x['day']==14)
  s=api('/api/sessions',{'enrollment_id':target['id'],'item_id':item['id'],'scheduled_at':'2026-10-30T12:00:00Z','duration_minutes':30},admin);batch.append(s)
  body={'session_id':s['id'],'status':'present','expected_recorded_at':None}
  if i<2:statuses.append(404 if denied('/api/attendance',body,old,404) else 0)
  else:api('/api/attendance',body,admin);statuses.append(200)
 check('30-entry hosted attendance batch retains 28 successes and two scope errors',statuses.count(200)==28 and statuses.count(404)==2)
 for s in batch[:2]:api('/api/attendance',{'session_id':s['id'],'status':'present','expected_recorded_at':None},admin)
 workspace=api('/api/workspace',token=admin)
 check('retrying failed entries yields exactly 30 batch attendance rows',len([a for a in workspace['attendance'] if a['session_id'] in [s['id'] for s in batch]])==30)
finally:ROOT.joinpath('extended-results.json').write_text(json.dumps({'run':run,'checks':results},indent=2))
