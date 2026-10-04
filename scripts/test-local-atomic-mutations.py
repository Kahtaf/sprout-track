#!/usr/bin/env python3
"""Actual localhost D1 checks for family/settings, calendar links and food merge. Synthetic records only."""
import argparse,json,pathlib,secrets,urllib.request,urllib.error,urllib.parse
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--base-url',default='http://127.0.0.1:8792');p.add_argument('--identity',required=True,type=pathlib.Path);a=p.parse_args()
origin=urllib.parse.urlsplit(a.base_url)
if origin.scheme!='http' or origin.hostname not in ('localhost','127.0.0.1'):raise SystemExit('Localhost only')
base=a.base_url.rstrip('/');identity=json.loads(a.identity.read_text());checks=[];cleanup=[]
def call(path,method='GET',body=None,token=None):
 req=urllib.request.Request(base+path,method=method,headers={'Content-Type':'application/json',**({'Authorization':'Bearer '+token} if token else {})},data=json.dumps(body).encode() if body is not None else None)
 try:
  with urllib.request.urlopen(req,timeout=60) as r:result=json.load(r)
 except urllib.error.HTTPError as e:raise AssertionError(f'{method} {path.split("?")[0]} HTTP{e.code}') from None
 assert result.get('success'),path+' failed';return result.get('data')
token=call('/api/auth','POST',{'loginId':'00','securityPin':identity['securityPin'],'familySlug':identity['familySlug']})['token']
nonce=secrets.token_hex(6)
try:
 family=call('/api/family',token=token)
 call('/api/family','PUT',{'name':family['name'],'slug':family['slug']},token)
 settings=call('/api/settings',token=token)
 assert settings['familyName']==family['name'];checks.append('Family/settings atomic same-value update')
 event=call('/api/calendar-event','POST',{'title':'Synthetic QA calendar '+nonce,'startTime':'2026-07-01T16:00:00.000Z','allDay':False,'type':'CUSTOM','recurring':False,'babyIds':[identity['babyId']],'caretakerIds':[],'contactIds':[]},token)
 cleanup.append(('/api/calendar-event',event['id']))
 call('/api/calendar-event?id='+event['id'],'PUT',{'title':'Synthetic QA edited calendar','babyIds':[]},token)
 event=call('/api/calendar-event?id='+event['id'],token=token)
 if isinstance(event,list):event=event[0]
 assert event['title']=='Synthetic QA edited calendar' and event['babies']==[];checks.append('Calendar scalar and baby relationship atomic update')
 source=call('/api/food','POST',{'name':'Synthetic QA source '+nonce,'commonAllergen':True},token)
 target=call('/api/food','POST',{'name':'Synthetic QA target '+nonce},token)
 cleanup.extend([('/api/food',source['id']),('/api/food',target['id'])])
 log=call('/api/food-log','POST',{'babyId':identity['babyId'],'time':'2026-07-01T16:00:00.000Z','foodId':source['id']},token)
 cleanup.insert(0,('/api/food-log',log['id']))
 call('/api/food/merge','POST',{'sourceFoodId':source['id'],'targetFoodId':target['id']},token)
 saved=call('/api/food-log?id='+log['id'],token=token)
 if isinstance(saved,list):saved=saved[0]
 assert saved['foodId']==target['id'];checks.append('Food merge rewrites historical food reference')
 foods=call('/api/food',token=token)
 assert next(f for f in foods if f['id']==target['id'])['commonAllergen'];checks.append('Food merge transfers common allergen flag')
 cleanup.remove(('/api/food',source['id']))
finally:
 for path,identifier in cleanup:
  call(path+'?id='+identifier,'DELETE',token=token)
 checks.append('Clean synthetic calendar/food/log records')
print(json.dumps({'passed':len(checks),'checks':checks},indent=2))
