"""Build public reference-data migration; never seeds accounts or known PINs."""
import csv
from pathlib import Path
import re

root = Path(__file__).resolve().parent.parent
statements = ['-- Public upstream units and growth references only; no family, credentials, or baby history.']

def quoted(value):
    return "'" + str(value).replace("'", "''") + "'"

seed = (root / 'prisma/seed.ts').read_text()
for abbr, name, activities in re.findall(r"\{ unitAbbr: '([^']+)', unitName: '([^']+)', activityTypes: '([^']+)' \}", seed):
    values = ', '.join(map(quoted, ['unit-' + abbr, abbr, name, activities]))
    statements.append('INSERT INTO "Unit" ("id", "unitAbbr", "unitName", "activityTypes", "updatedAt") VALUES (' + values + ', CURRENT_TIMESTAMP) ON CONFLICT("unitAbbr") DO NOTHING;')

columns = ['sex', 'ageMonths', 'l', 'm', 's', 'p3', 'p5', 'p10', 'p25', 'p50', 'p75', 'p90', 'p95', 'p97']
for table, filename in [
    ('CdcWeightForAge', 'wtageinf.csv'), ('CdcLengthForAge', 'lenageinf.csv'),
    ('CdcHeadCircumferenceForAge', 'hcageinf.csv'), ('WhoWeightForAge', 'who-wtageinf.csv'),
    ('WhoLengthForAge', 'who-lenageinf.csv'), ('WhoHeadCircumferenceForAge', 'who-hcageinf.csv'),
]:
    with (root / 'documentation' / filename).open(encoding='utf-8-sig', newline='') as stream:
        rows = csv.reader(stream)
        next(rows)
        for row in rows:
            numbers = [str(float(value)) for value in row[:14]]
            identity = table + '-' + numbers[0] + '-' + numbers[1]
            names = ', '.join('"' + column + '"' for column in ['id'] + columns)
            values = ', '.join([quoted(identity)] + numbers)
            statements.append(f'INSERT INTO "{table}" ({names}) VALUES ({values}) ON CONFLICT("sex", "ageMonths") DO NOTHING;')

(root / 'prisma/d1-migrations/0004_reference_data.sql').write_text('\n'.join(statements) + '\n')
