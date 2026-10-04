#!/usr/bin/env python3
"""Upload small, safely retryable history chunks to an authenticated Worker.
No data or tokens are written to Git. Use --dry-run before remote execution.
"""
import argparse
import csv
import io
import json
import pathlib
import secrets
import sys
import urllib.error
import urllib.request

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def nara_cost(row):
    kind = row['Type']
    if kind == 'Growth':
        return sum(bool(row.get('[Growth] ' + f)) for f in ('Head Size', 'Height', 'Weight'))
    if kind in ('Breastfeed', 'Combo Feed'):
        sides = sum(bool(row.get(f'[{kind}] {f} Duration (Seconds)')) for f in ('Left', 'Right'))
        return max(1, sides) + (kind == 'Combo Feed')
    if kind == 'Medical':
        return max(1, len([x for x in row.get('[Medical] Medication', '').splitlines() if x]) + bool(row.get('[Medical] Temperature')))
    return 1

def prepare_chunks(provider, path, limit=4):
    if provider == 'babycare':
        root = json.loads(path.read_text())
        profiles = [d for d in root['documents'] if d.get('type') == 'baby']
        events = [d for d in root['documents'] if d.get('type') != 'baby']
        if len(profiles) != 1:
            raise ValueError('Expected one Babycare profile')
        child = profiles[0]['_id']
        # Breastfeeding can expand to two sides; two source events ensure <=4 maps.
        chunks = [json.dumps({**root, 'documents': profiles + events[i:i+2]}) for i in range(0, len(events), 2)]
        return child, events, chunks
    with path.open(newline='') as handle:
        reader = csv.DictReader(handle)
        headers, rows = reader.fieldnames, list(reader)
    profiles = [r for r in rows if r['Type'] == 'Profile']
    if len(profiles) != 1:
        raise ValueError('Expected one Nara profile')
    child = profiles[0]['_profileKey']
    events = [r for r in rows if r['Type'] != 'Profile']
    groups, group, cost = [], [], 0
    for row in events:
        count = nara_cost(row)
        if count > limit:
            raise ValueError('One source event exceeds the mapped-record limit')
        if group and cost + count > limit:
            groups.append(group)
            group, cost = [], 0
        group.append(row)
        cost += count
    if group:
        groups.append(group)
    chunks = []
    for group in groups:
        output = io.StringIO(newline='')
        writer = csv.DictWriter(output, fieldnames=headers)
        writer.writeheader()
        writer.writerows(profiles + group)
        chunks.append(output.getvalue())
    return child, events, chunks

def multipart(provider, content, configuration):
    boundary = 'history-' + secrets.token_hex(16)
    extension = 'json' if provider == 'babycare' else 'csv'
    parts = []
    for name, value in [('providerId', provider), ('configuration', json.dumps(configuration))]:
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n')
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="files"; filename="history.{extension}"\r\nContent-Type: application/{extension}\r\n\r\n{content}\r\n--{boundary}--\r\n')
    return ''.join(parts).encode(), f'multipart/form-data; boundary={boundary}'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--provider', choices=['nara', 'babycare'], required=True)
    parser.add_argument('--source', type=pathlib.Path, required=True)
    parser.add_argument('--identity', type=pathlib.Path, required=True, help='Private bootstrap-identity.json with babyId')
    parser.add_argument('--base-url')
    parser.add_argument('--token-file', type=pathlib.Path, help='Private plain bearer token or JSON with token/authToken')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    identity = json.loads(args.identity.read_text())
    baby_id = identity.get('babyId') or identity.get('baby_id')
    if not baby_id:
        raise ValueError('Bootstrap identity is missing babyId')
    child, events, chunks = prepare_chunks(args.provider, args.source)
    print(f'{args.provider}: {len(events)} source events; {len(chunks)} bounded requests', flush=True)
    if args.dry_run:
        return
    if not args.base_url or not args.token_file:
        raise ValueError('Remote import requires --base-url and --token-file')
    base_url = args.base_url.rstrip('/')
    parsed = urllib.parse.urlparse(base_url)
    if parsed.scheme != 'https' or parsed.path or parsed.query or parsed.username:
        raise ValueError('Expected a plain HTTPS Worker origin')
    token = args.token_file.read_text().strip()
    if token.startswith('{'):
        auth = json.loads(token)
        token = auth.get('token') or auth.get('authToken') or auth.get('data', {}).get('token')
    if not token or '\r' in token or '\n' in token:
        raise ValueError('Invalid bearer token file')
    config = {'execution': {'sourceTimezone': 'America/Toronto', 'childDestinations': {child: {'mode': 'existing', 'targetBabyId': baby_id}}}, 'provider': {}}
    opener = urllib.request.build_opener(NoRedirect())
    created = duplicates = 0
    for index, chunk in enumerate(chunks):
        data, content_type = multipart(args.provider, chunk, config)
        request = urllib.request.Request(base_url + '/api/import/external/execute', data=data, headers={'Authorization': 'Bearer ' + token, 'Content-Type': content_type, 'User-Agent': 'SproutTrackMigration/1.0'}, method='POST')
        try:
            with opener.open(request, timeout=60) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            raise RuntimeError(f'Chunk {index+1} rejected with HTTP {error.code}; safe to rerun completed chunks') from None
        if not result.get('success'):
            raise RuntimeError(f'Chunk {index+1} failed; inspect authenticated app and safely rerun')
        created += result['data']['created']
        duplicates += result['data']['duplicates']
        print(f'Chunk {index+1}/{len(chunks)}: cumulative created {created}, already imported {duplicates}', flush=True)
    print(f'Completed {len(events)} source events. Profile mapping repeats account for repeated duplicate counts.')

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'Import stopped: {error}', file=sys.stderr)
        sys.exit(1)
