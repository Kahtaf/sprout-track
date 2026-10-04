#!/usr/bin/env python3
"""Synthetic offline replay/CAS checks against a locally seeded Worker only."""
import argparse, json, urllib.request, urllib.error, uuid
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='http://127.0.0.1:8794')
parser.add_argument('--identity', required=True, help='Synthetic private bootstrap identity JSON')
args = parser.parse_args()
base = args.url.rstrip('/')
if not (base.startswith('http://127.0.0.1:') or base.startswith('http://localhost:')):
    raise SystemExit('Offline smoke permits localhost only.')
identity = json.loads(Path(args.identity).read_text())
checks = []
token = None

def request(path, method='GET', body=None, headers=None):
    merged = {'Content-Type': 'application/json', **(headers or {})}
    if token: merged['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None, headers=merged, method=method)
    try: response = urllib.request.urlopen(req, timeout=30)
    except urllib.error.HTTPError as error: response = error
    raw = response.read()
    data = json.loads(raw) if response.headers.get('Content-Type', '').startswith('application/json') else None
    return response.status, data, response.headers

def check(condition, name):
    if not condition: raise AssertionError(name)
    checks.append(name)

status, auth, _ = request('/api/auth', 'POST', {'loginId': '00', 'securityPin': identity['securityPin'], 'familySlug': identity['familySlug']})
check(status == 200 and auth.get('success'), 'Authenticate synthetic family')
token = auth['data']['token']
common = {'babyId': identity['babyId']}
cases = [
    ('note', {'time': '2026-01-01T12:00:00Z', 'content': 'Synthetic offline note'}, 'content', 'Edited note'),
    ('feed-log', {'time': '2026-01-01T12:00:00Z', 'type': 'BOTTLE', 'amount': 20, 'unitAbbr': 'ML'}, 'amount', 25),
    ('diaper-log', {'time': '2026-01-01T12:00:00Z', 'type': 'WET'}, 'type', 'BOTH'),
    ('sleep-log', {'startTime': '2026-01-01T12:00:00Z', 'type': 'NAP'}, 'location', 'Cot'),
    ('pump-log', {'startTime': '2026-01-01T12:00:00Z', 'totalAmount': 20, 'unitAbbr': 'ML', 'pumpAction': 'FED'}, 'totalAmount', 25),
]
for kind, fields, edited_field, edited_value in cases:
    path = '/api/' + kind
    record_id = str(uuid.uuid4())
    create_headers = {'X-Offline-Request-Id': record_id}
    body = {**common, **fields}
    status, first, _ = request(path, 'POST', body, create_headers)
    check(status == 200 and first.get('success') and first['data']['id'] == record_id, kind + ': client UUID persisted')
    check(first['data']['createdAt'] == first['data']['updatedAt'], kind + ': offline creation baseline timestamps equal')
    original_version = first['data']['updatedAt']
    try:
        status, replay, headers = request(path, 'POST', {**body, edited_field: edited_value}, create_headers)
        check(status == 200 and replay['data'].get(edited_field) == first['data'].get(edited_field) and headers.get('X-Offline-Replay') == 'true', kind + ': lost POST ack/different body returns original unchanged')
        status, online_edit, _ = request(path + '?id=' + record_id, 'PUT', {edited_field: edited_value})
        check(status == 200 and online_edit.get('success'), kind + ': ordinary later caregiver edit')
        status, preserved, _ = request(path, 'POST', body, create_headers)
        check(status == 200 and preserved['data'][edited_field] == edited_value, kind + ': POST replay preserves later edit')
        edit_headers = {'X-Offline-Request-Id': str(uuid.uuid4()), 'X-Offline-Base-Version': original_version}
        status, _, _ = request(path + '?id=' + record_id, 'PUT', {edited_field: fields.get(edited_field)}, edit_headers)
        check(status == 409, kind + ': stale cached edit rejected')
        edit_headers['X-Offline-Base-Version'] = online_edit['data']['updatedAt']
        status, edited, _ = request(path + '?id=' + record_id, 'PUT', {edited_field: edited_value}, edit_headers)
        check(status == 200 and edited.get('success'), kind + ': current cached version CAS update')
        status, _, _ = request(path + '?id=' + record_id, 'PUT', {edited_field: edited_value}, edit_headers)
        check(status == 409, kind + ': uncertain PUT ack retry safely blocked')
        delete_headers = {'X-Offline-Request-Id': str(uuid.uuid4()), 'X-Offline-Base-Version': edited['data']['updatedAt']}
        status, _, _ = request(path + '?id=' + record_id, 'DELETE', headers=delete_headers)
        check(status == 200, kind + ': cached version delete')
        status, _, _ = request(path + '?id=' + record_id, 'DELETE', headers={'X-Offline-Request-Id': str(uuid.uuid4())})
        check(status == 200, kind + ': lost DELETE ack replay success')
        status, _, _ = request(path, 'POST', body, create_headers)
        check(status == 410, kind + ': deleted POST never resurrects')
        status, _, _ = request(path + '?id=' + record_id)
        check(status == 404, kind + ': tombstone hidden from single read')
        status, listed, _ = request(path + '?babyId=' + identity['babyId'])
        check(status == 200 and all(row['id'] != record_id for row in listed['data']), kind + ': tombstone hidden from list')
        if kind == 'pump-log':
            status, feeds, _ = request('/api/feed-log?babyId=' + identity['babyId'])
            check(status == 200 and all(row.get('sourcePumpId') != record_id for row in feeds['data']), 'pump-log: linked feed tombstoned atomically')
    finally:
        request(path + '?id=' + record_id, 'DELETE')
status, _, _ = request('/api/note', 'POST', {**common, 'time': '2026-01-01T12:00:00Z', 'content': 'Invalid'}, {'X-Offline-Request-Id': 'invalid'})
check(status == 400, 'Malformed offline UUID rejected')
print(json.dumps({'passed': len(checks), 'checks': checks}, indent=2))
