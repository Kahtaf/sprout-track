#!/usr/bin/env python3
"""Create a private, one-shot initial D1 seed and Worker secrets; never print credentials."""
import argparse
import json
import os
from pathlib import Path
import secrets
import uuid
from datetime import datetime, timezone


def literal(value):
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def create_bootstrap(profile, hostname, output):
    output = Path(output).resolve()
    repo = Path(__file__).resolve().parent.parent
    if output == repo or repo in output.parents:
        raise ValueError('Private bootstrap output must be outside the Git checkout')
    if not profile.get('firstName') or not profile.get('birthDate'):
        raise ValueError('Profile requires firstName and birthDate')
    if profile.get('gender') not in (None, 'MALE', 'FEMALE'):
        raise ValueError('Profile gender must be MALE or FEMALE when supplied')
    if '/' in hostname or not hostname.endswith('.workers.dev'):
        raise ValueError('Supply a workers.dev hostname without scheme or path')
    if output.exists():
        raise ValueError('Refusing to overwrite an existing bootstrap directory')
    output.mkdir(mode=0o700, parents=True)
    now = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
    family, baby, caretaker = [str(uuid.uuid4()) for _ in range(3)]
    pin = ''.join(secrets.choice('0123456789') for _ in range(10))
    admin = secrets.token_urlsafe(32)
    private = {'JWT_SECRET':secrets.token_hex(32),'ENC_HASH':secrets.token_hex(32)}
    identity = {'familyId':family,'babyId':baby,'caretakerId':caretaker,'familySlug':'my-family','securityPin':pin,'adminPassword':admin,'timezone':'America/Toronto'}
    records = [
        ('AppConfig',{'id':str(uuid.uuid4()),'adminPass':admin,'rootDomain':hostname,'enableHttps':1,'enablePhotos':0,'updatedAt':now}),
        ('Family',{'id':family,'slug':identity['familySlug'],'name':profile.get('familyName','My Family'),'setupStage':3,'isActive':1,'updatedAt':now}),
        ('Settings',{'id':str(uuid.uuid4()),'familyId':family,'familyName':profile.get('familyName','My Family'),'securityPin':pin,'authType':'SYSTEM','defaultBottleUnit':'ML','defaultHeightUnit':'CM','defaultWeightUnit':'KG','updatedAt':now}),
        ('Caretaker',{'id':caretaker,'familyId':family,'loginId':'00','name':'Family','role':'ADMIN','securityPin':pin,'inactive':0,'updatedAt':now}),
        ('Baby',{'id':baby,'familyId':family,'firstName':profile['firstName'],'lastName':profile.get('lastName',''),'birthDate':profile['birthDate'],'updatedAt':now}),
    ]
    if profile.get('gender'):
        records[-1][1]['gender'] = profile['gender']
    # D1 executes one SQL file as a transaction. Guard against accidentally reseeding an occupied database.
    sql = 'CREATE TABLE bootstrap_guard (valid INTEGER CHECK(valid = 1));\nINSERT INTO bootstrap_guard SELECT CASE WHEN (SELECT COUNT(*) FROM Family) = 0 AND (SELECT COUNT(*) FROM AppConfig) = 0 THEN 1 ELSE 0 END;\n'
    for table, fields in records:
        sql += 'INSERT INTO "'+table+'" ('+', '.join('"'+k+'"' for k in fields)+') VALUES ('+', '.join(literal(v) for v in fields.values())+');\n'
    sql += 'DROP TABLE bootstrap_guard;\n'
    for filename, value in [('worker-secrets.json',json.dumps(private,indent=2)+'\n'),('bootstrap-identity.json',json.dumps(identity,indent=2)+'\n'),('bootstrap.sql',sql)]:
        path = output / filename
        fd = os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as stream:
            stream.write(value)
    return identity


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--profile',required=True,help='Private JSON with firstName, lastName, birthDate, optional familyName')
    parser.add_argument('--hostname',required=True)
    parser.add_argument('--output',required=True,help='New private directory outside checkout')
    args = parser.parse_args()
    create_bootstrap(json.loads(Path(args.profile).read_text()),args.hostname,args.output)
    print('Private bootstrap files created; no credentials printed. Apply once before deploying the Worker.')
