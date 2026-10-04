import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

module_path = Path(__file__).with_name('cloudflare-bootstrap.py')
spec = importlib.util.spec_from_file_location('bootstrap',module_path)
bootstrap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bootstrap)

class BootstrapTest(unittest.TestCase):
    def test_seed_matches_schema_and_is_private_and_one_shot(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)/'private'
            identity = bootstrap.create_bootstrap({'firstName':"Synthetic ' test",'birthDate':'2026-02-18T05:00:00.000Z'},'synthetic.workers.dev',output)
            db = sqlite3.connect(':memory:')
            db.execute('PRAGMA foreign_keys=ON')
            for path in sorted((module_path.parent.parent/'prisma/d1-migrations').glob('*.sql')):
                db.executescript(path.read_text())
            db.executescript((output/'bootstrap.sql').read_text())
            self.assertEqual(db.execute('SELECT setupStage FROM Family').fetchone()[0],3)
            self.assertEqual(db.execute('SELECT firstName FROM Baby').fetchone()[0],"Synthetic ' test")
            self.assertEqual(db.execute('SELECT securityPin FROM Settings').fetchone()[0],identity['securityPin'])
            self.assertEqual(len(identity['securityPin']),10)
            self.assertNotEqual(identity['adminPassword'],'admin')
            for path in output.iterdir():
                self.assertEqual(path.stat().st_mode & 0o777,0o600)
            self.assertEqual(output.stat().st_mode & 0o777,0o700)
            with self.assertRaises(sqlite3.IntegrityError):
                db.executescript((output/'bootstrap.sql').read_text())
            with self.assertRaises(ValueError):
                bootstrap.create_bootstrap({'firstName':'S','birthDate':'date'},'synthetic.workers.dev',output)

if __name__ == '__main__': unittest.main()
