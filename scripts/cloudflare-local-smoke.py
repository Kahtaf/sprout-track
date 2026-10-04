#!/usr/bin/env python3
"""Exercise a seeded Worker using synthetic data. Remote mutations require --allow-remote; never prints credentials."""
import argparse, atexit, io, json, urllib.error, urllib.parse, urllib.request, zipfile
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', '--base-url', default='http://127.0.0.1:8791')
parser.add_argument('--allow-remote', action='store_true', help='Explicitly authorize synthetic note creation, editing, and cleanup on a deployed Worker')
parser.add_argument('--identity', required=True, help='Private bootstrap identity JSON')
args = parser.parse_args()
base = args.url.rstrip('/')
parsed = urllib.parse.urlsplit(base)
local = parsed.hostname in {'127.0.0.1', 'localhost', '::1'} and parsed.scheme == 'http'
if not local and not (args.allow_remote and parsed.scheme == 'https' and (parsed.hostname or '').endswith('.workers.dev')):
    raise SystemExit('Supply a local Worker or --allow-remote with an HTTPS workers.dev host.')
identity = json.loads(Path(args.identity).read_text())
checks = []

def request(path, method='GET', body=None, token=None, cookie=None):
    headers = {'Content-Type':'application/json', 'User-Agent':'SproutTrackMigration/1.0'}
    if token: headers['Authorization'] = 'Bearer ' + token
    if cookie: headers['Cookie'] = cookie
    req = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None, headers=headers, method=method)
    try:
        response = urllib.request.urlopen(req, timeout=30)
    except urllib.error.HTTPError as exc:
        response = exc
    content = response.read()
    return response.status, json.loads(content) if response.headers.get('Content-Type','').startswith('application/json') else content

def check(condition, label):
    if not condition: raise AssertionError(label)
    checks.append(label)

for path in ['/api/baby','/api/feed-log','/api/note','/api/database']:
    status, _ = request(path)
    check(status in (401,403), 'Unauthenticated rejection: '+path)
status, _ = request('/api/setup/start', 'POST', {})
check(status == 403, 'Public family setup closed')
status, _ = request('/api/baby', cookie='authToken=unsigned; caretakerId=caretaker; familyId=family; isAuthenticated=true')
check(status in (401,403), 'Unsigned identity cookies rejected')
status, auth = request('/api/auth', 'POST', {'loginId':'00','securityPin':identity['securityPin'],'familySlug':identity['familySlug']})
check(status==200 and auth.get('success') is True, 'Family authentication')
token=auth['data']['token']
status, babies = request('/api/baby',token=token)
check(status==200 and babies.get('success') is True, 'Family baby list')
check(any(b['id']==identity['babyId'] for b in babies['data']), 'Seeded baby retained')
status, created=request('/api/note','POST',{'babyId':identity['babyId'],'time':'2026-03-07T17:00:00.000Z','content':'Synthetic Cloudflare QA note'},token)
check(status==200 and created.get('success') is True, 'Create historical note')
record_id=created['data']['id']
def cleanup_note():
    try:
        request('/api/note?id='+urllib.parse.quote(record_id),'DELETE',token=token)
    except Exception:
        print('Synthetic QA note cleanup could not be confirmed; retry its cleanup through the app.')
atexit.register(cleanup_note)
status, edited=request('/api/note?id='+urllib.parse.quote(record_id),'PUT',{'content':'Synthetic Cloudflare QA note edited'},token)
check(status==200 and edited.get('success') is True, 'Edit historical note')
status, fetched=request('/api/note?id='+urllib.parse.quote(record_id),token=token)
check(status==200 and fetched['data']['content']=='Synthetic Cloudflare QA note edited', 'Edited history persists across requests')
status, admin=request('/api/auth','POST',{'adminPassword':identity['adminPassword']})
check(status==200 and admin.get('success') is True,'Administrator authentication')
status, archive=request('/api/database',token=admin['data']['token'])
check(status==200 and isinstance(archive,bytes),'Complete backup download')
with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
    backup=json.loads(zipped.read('data.json'))
check(any(r['id']==record_id and r['content']=='Synthetic Cloudflare QA note edited' for r in backup['Note']),'Backup contains edited history')
check('ExternalImportRecord' in backup,'Backup contains import provenance model')
status, deleted=request('/api/note?id='+urllib.parse.quote(record_id),'DELETE',token=token)
check(status==200 and deleted.get('success') is True,'Delete synthetic QA note')
atexit.unregister(cleanup_note)
print(json.dumps({'passed':len(checks),'checks':checks},indent=2))
