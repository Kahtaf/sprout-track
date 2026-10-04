#!/usr/bin/env python3
"""Actual local D1 Worker API test: bounded imports, edits, retry, soft deletion.
Synthetic source only. Refuses remote origins and never prints credentials.
"""
import argparse
import csv
import io
import re
import subprocess
import json
import pathlib
import sys
import urllib.parse
import urllib.request
import uuid
from importlib.util import spec_from_file_location, module_from_spec

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--base-url',default='http://127.0.0.1:8791')
p.add_argument('--identity',type=pathlib.Path,required=True)
a=p.parse_args()
parsed=urllib.parse.urlparse(a.base_url)
if parsed.scheme!='http' or parsed.hostname not in ['127.0.0.1','localhost']:
    raise SystemExit('Only localhost HTTP is allowed')
spec=spec_from_file_location('history_import',pathlib.Path(__file__).with_name('import-family-history.py'))
helper=module_from_spec(spec);spec.loader.exec_module(helper)
identity=json.loads(a.identity.read_text())
base=a.base_url.rstrip('/')
def call(path,method='GET',body=None,token=None):
    headers={'Content-Type':'application/json'}
    if token:headers['Authorization']='Bearer '+token
    req=urllib.request.Request(base+path,method=method,headers=headers,data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(req,timeout=60) as response:return json.load(response)
auth=call('/api/auth','POST',{'loginId':'00','securityPin':identity['securityPin'],'familySlug':identity['familySlug']})
assert auth['success'], 'Family authentication failed'
token=auth['data']['token']
child='qa-child-'+str(uuid.uuid4())
profile={'type':'baby','_id':child,'birthdate':'2026-02-18T12:00:00.000Z','name':'Synthetic'}
events=[{'type':'event','event_type':'activity','activity':'care','_id':'qa-'+str(uuid.uuid4()),'baby_id':child,'createdAt':'2026-07-01T12:00:00.123Z','comment':'Synthetic import test'} for i in range(2)]
config={'execution':{'sourceTimezone':'America/Toronto','childDestinations':{child:{'mode':'existing','targetBabyId':identity['babyId']}}},'provider':{}}
def execute(provider='babycare', content=None, configuration=None, action='execute'):
    data,ctype=helper.multipart(provider,content or json.dumps({'documents':[profile,*events]}),configuration or config)
    req=urllib.request.Request(base+'/api/import/external/'+action,method='POST',data=data,headers={'Authorization':'Bearer '+token,'Content-Type':ctype})
    try:
        with urllib.request.urlopen(req,timeout=60) as response:result=json.load(response)
    except urllib.error.HTTPError as error:
        data=json.load(error)
        raise AssertionError(f"Actual local import HTTP {error.code}: {data.get('error','unknown')}") from None
    assert result['success'], 'Import failed'
    return result['data']
preview=execute(action='preview');assert preview['preview']['ready']
first=execute();assert first['created']==3
ids=[r['targetRecordId'] for r in first['records'] if r['targetEntityType']=='Note']
assert len(ids)==2
try:
    second=execute();assert second['created']==0 and second['duplicates']==3
    edited=call('/api/note?id='+ids[0],'PUT',{'content':'Synthetic edited after import'},token)
    assert edited['success']
    execute()
    saved=call('/api/note?id='+ids[0],token=token)
    assert saved['data']['content']=='Synthetic edited after import'
    assert saved['data']['time']=='2026-07-01T16:00:00.123Z'
    # Delete only synthetic provenance in local D1 to emulate interrupted write.
    assert re.fullmatch(r'imp_[a-f0-9]{64}', ids[0])
    result=subprocess.run(['npx','wrangler','d1','execute','sprout-track-family','--local','--persist-to','.wrangler/state','--command',f"DELETE FROM ExternalImportRecord WHERE targetRecordId = '{ids[0]}';"],capture_output=True,text=True)
    assert result.returncode==0, 'Local interrupted-provenance simulation failed'
    replay=execute();assert replay['created']==1 and replay['duplicates']==2
    saved=call('/api/note?id='+ids[0],token=token)
    assert saved['data']['content']=='Synthetic edited after import'
    call('/api/note?id='+ids[1],'DELETE',token=token)
    result=execute();assert result['created']==0
finally:
    for record_id in ids:
        try:
            call('/api/note?id='+record_id,'DELETE',token=token)
        except urllib.error.HTTPError as error:
            if error.code != 404: raise
nara_child='qa-nara-'+str(uuid.uuid4())
rows=[{'Type':'Profile','Profile Name':'Synthetic','[Profile] Birth Date':'2026-02-18','_profileKey':nara_child,'_activityKey':''},{'Type':'Pump','Start Date/time (Epoch)':'1782907200123','[Pump] Duration (Seconds)':'125','[Pump] Total Volume':'40','[Pump] Total Volume Unit':'ML','_profileKey':'','_activityKey':'qa-'+str(uuid.uuid4())}]
headers=list(dict.fromkeys(k for row in rows for k in row))
output=io.StringIO(newline='');writer=csv.DictWriter(output,fieldnames=headers);writer.writeheader();writer.writerows(rows)
nara_config={'execution':{'sourceTimezone':'America/Toronto','childDestinations':{nara_child:{'mode':'existing','targetBabyId':identity['babyId']}}},'provider':{}}
preview=execute('nara',output.getvalue(),nara_config,'preview');assert preview['preview']['ready']
created=execute('nara',output.getvalue(),nara_config);assert created['created']==2
pump_id=next(r['targetRecordId'] for r in created['records'] if r['targetEntityType']=='PumpLog')
try:
    pump=call('/api/pump-log?id='+pump_id,token=token)['data']
    assert pump['durationSeconds']==125 and pump['duration']==2 and pump['pumpAction']=='HISTORICAL'
    assert pump['startTime']=='2026-07-01T12:00:00.123Z'
    replay=execute('nara',output.getvalue(),nara_config);assert replay['created']==0 and replay['duplicates']==2
finally:
    try:
        call('/api/pump-log?id='+pump_id,'DELETE',token=token)
    except urllib.error.HTTPError:
        assert re.fullmatch(r'imp_[a-f0-9]{64}',pump_id)
        cleanup=subprocess.run(['npx','wrangler','d1','execute','sprout-track-family','--local','--persist-to','.wrangler/state','--command',f"DELETE FROM PumpLog WHERE id = '{pump_id}';"],capture_output=True,text=True)
        assert cleanup.returncode==0, 'Local synthetic pump cleanup failed'
print('PASS: actual local Babycare/Nara preview+bounded import, interrupted-provenance replay preserves edit, duplicate replay, exact seconds, Toronto/epoch milliseconds, soft-deleted record not recreated')
