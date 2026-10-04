#!/usr/bin/env python3
"""Actual Worker core logging smoke. Synthetic records, never prints credentials.
Remote mutations require --allow-remote; synthetic logs are deleted on exit.
"""
import argparse
import atexit
import json
import pathlib
import secrets
import urllib.error
import urllib.parse
import urllib.request

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url',default='http://127.0.0.1:8791')
parser.add_argument('--identity',type=pathlib.Path,required=True)
parser.add_argument('--allow-remote',action='store_true')
args=parser.parse_args()
base=args.base_url.rstrip('/')
origin=urllib.parse.urlsplit(base)
local=origin.scheme=='http' and origin.hostname in ('localhost','127.0.0.1')
if not local and not (args.allow_remote and origin.scheme=='https' and (origin.hostname or '').endswith('.workers.dev')):
    raise SystemExit('Local Worker required unless --allow-remote supplied for HTTPS workers.dev')
identity=json.loads(args.identity.read_text())
checks=[]

def call(path,method='GET',body=None,token=None):
    headers={'Content-Type':'application/json','User-Agent':'SproutTrackMigration/1.0'}
    if token:headers['Authorization']='Bearer '+token
    request=urllib.request.Request(base+path,headers=headers,method=method,data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(request,timeout=60) as response:result=json.load(response)
    except urllib.error.HTTPError as error:
        # API messages can contain user data; expose route/status only.
        raise AssertionError(f'{method} {path.split("?")[0]} failed HTTP {error.code}') from None
    if not result.get('success'):raise AssertionError(f'{method} {path.split("?")[0]} unsuccessful')
    return result.get('data')

auth=call('/api/auth','POST',{'loginId':'00','familySlug':identity['familySlug'],'securityPin':identity['securityPin']})
token=auth['token']
created=[]
location='Synthetic QA '+secrets.token_hex(5)
location_names=[]
def cleanup(strict=False):
    failures=[]
    for path,identifier in created:
        try:call(path+'?id='+urllib.parse.quote(identifier),'DELETE',token=token)
        except AssertionError:failures.append(path)
    for name in location_names:
        try:call('/api/sleep-locations','DELETE',{'name':name},token)
        except AssertionError:failures.append('/api/sleep-locations')
    if failures:
        if strict:raise AssertionError('Synthetic core log cleanup failed: '+', '.join(failures))
        print('Synthetic core log cleanup could not be confirmed for '+', '.join(failures))
atexit.register(cleanup)
call('/api/sleep-locations','POST',{'name':location},token)
location_names.append(location);checks.append('Add synthetic sleep location')

core=[
 ('sleep-log',{'startTime':'2026-03-07T17:00:00.000Z','endTime':'2026-03-07T18:00:00.000Z','type':'NAP','location':location}),
 ('feed-log',{'time':'2026-03-07T17:00:00.000Z','type':'BOTTLE','amount':20,'unitAbbr':'ML','bottleType':'Formula'}),
 ('diaper-log',{'time':'2026-03-07T17:00:00.000Z','type':'WET'}),
 ('pump-log',{'startTime':'2026-03-07T17:00:00.000Z','endTime':'2026-03-07T17:01:01.000Z','totalAmount':20,'unitAbbr':'ML','pumpAction':'FED'}),
]
for route,fields in core:
    path='/api/'+route
    result=call(path,'POST',{'babyId':identity['babyId'],**fields},token)
    identifier=result['id'];created.append((path,identifier));checks.append('Create '+route)
    if route=='pump-log':
        assert result['durationSeconds']==61,'Pump exact initial seconds missing'
        call(path+'?id='+identifier,'PUT',{'endTime':'2026-03-07T17:01:02.000Z'},token)
        exact=call(path+'?id='+identifier,token=token)
        assert exact['durationSeconds']==62,'Pump end-time edit failed exact seconds'
        call(path+'?id='+identifier,'PUT',{'duration':2},token)
        exact=call(path+'?id='+identifier,token=token)
        assert exact['durationSeconds']==120,'Pump explicit duration override failed seconds'
        checks.append('Pump exact seconds61 then time edit62 and explicit override120')
        feeds=call('/api/feed-log?babyId='+urllib.parse.quote(identity['babyId']),token=token)
        linked=[feed for feed in feeds if feed.get('sourcePumpId')==identifier and not feed.get('deletedAt')]
        assert len(linked)==1 and linked[0]['amount']==20,'FED pump linked bottle feed missing'
        checks.append('FED pump creates linked bottle feed')
    content='Synthetic core QA '+route+' edited'
    edits={'notes':content,**({'totalAmount':25} if route=='pump-log' else {})}
    call(path+'?id='+identifier,'PUT',edits,token);checks.append('Edit '+route)
    value=call(path+'?id='+identifier,token=token)
    if isinstance(value,list):value=next((r for r in value if r['id']==identifier),{})
    assert value.get('notes')==content, route+' edit not persisted'
    checks.append('Read persisted '+route)
    if route=='sleep-log':
        renamed=location+' renamed'
        result=call('/api/sleep-locations','PUT',{'from':location,'to':renamed},token)
        assert result['updatedCount']==1,'Sleep location rename changed unexpected records'
        location_names[:]=[renamed];checks.append('Rename sleep location and matching historical log atomically')
        value=call(path+'?id='+identifier,token=token)
        assert value['location']==renamed,'Renamed location missing on existing sleep'
        locations=call('/api/sleep-locations',token=token)
        assert any(r['name']==renamed for r in locations),'Renamed location missing in settings'
        checks.append('Renamed sleep location persists in log and settings')
    if route=='pump-log':
        assert value['durationSeconds']==120,'Unrelated pump amount edit changed exact duration'
        checks.append('Pump amount edit preserves exact seconds')
        feeds=call('/api/feed-log?babyId='+urllib.parse.quote(identity['babyId']),token=token)
        linked=[feed for feed in feeds if feed.get('sourcePumpId')==identifier and not feed.get('deletedAt')]
        assert len(linked)==1 and linked[0]['amount']==25,'FED pump edited linked feed incorrect'
        checks.append('FED pump edit synchronizes linked bottle feed')
# A FED pump creates and edits a linked bottle feed; delete must synchronize it.
cleanup(strict=True);atexit.unregister(cleanup);checks.append('Cleanup all synthetic core logs')
feeds=call('/api/feed-log?babyId='+urllib.parse.quote(identity['babyId']),token=token)
pumps={identifier for path,identifier in created if path=='/api/pump-log'}
assert not any(feed.get('sourcePumpId') in pumps and not feed.get('deletedAt') for feed in feeds),'Deleting pump leaves linked feed active'
checks.append('FED pump delete removes linked bottle feed')
print(json.dumps({'passed':len(checks),'checks':checks},indent=2))
