"""Offline compatibility checks for file-backed scoring configuration."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from test_bridge_reasoning import bridge
from tesis.config_loader import load_and_resolve_config


class OraclePathTests(unittest.TestCase):
    def test_seed_relocates_scoring_files_and_preserves_source_and_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            checkout, web = root / 'checkout', root / 'web'
            checkout.mkdir()
            web.mkdir()
            (checkout / 'config').mkdir()
            (checkout / 'config/oracles.json').write_text('[]')
            (checkout / 'config/ranking.json').write_text('{}')
            source = checkout / 'config.yaml'
            original = '# keep this comment\ntarget_url: http://localhost/dvwa\nprovider: gemini\nscoring_mode: human\nscoring_oracles: config/oracles.json\nscoring_profile: config/ranking.json\nmodels:\n  gemini:\n    api_key: ${ORACLE_PATH_TEST_KEY}\n'
            source.write_text(original)
            target = web / 'config.yaml'
            with patch.object(bridge, '_source_config_path', return_value=source), patch.dict(os.environ, {'TESIS_WEB_CONFIG_PATH': str(target), 'ORACLE_PATH_TEST_KEY': 'offline-key'}):
                reply = bridge.command_seed_profile({})
                self.assertTrue(reply['seeded'])
                resolved = load_and_resolve_config(config_path=str(target), cli_args={})
                self.assertEqual(resolved.scoring_oracles, [])
                self.assertEqual(resolved.scoring_profile, {})
                self.assertIn('# keep this comment', target.read_text())
                self.assertIn('${ORACLE_PATH_TEST_KEY}', target.read_text())
                self.assertEqual(source.read_text(), original)
                self.assertEqual(target.stat().st_mode & 0o777, 0o600)
                target.write_text('# saved operator profile\n')
                bridge.command_seed_profile({})
                self.assertEqual(target.read_text(), '# saved operator profile\n')

    def test_scoring_path_placeholders_keep_their_spelling_and_effective_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            checkout, web = root / 'checkout', root / 'web'
            checkout.mkdir()
            web.mkdir()
            (checkout / 'oracles.json').write_text('[]')
            source = checkout / 'config.yaml'
            target = web / 'config.yaml'
            for configured in ('oracles.json', str(checkout / 'oracles.json')):
                with self.subTest(configured=configured), patch.dict(os.environ, {'ORACLE_FILE_TEST': configured}):
                    payload = bridge._relocate_scoring_files({'scoring_oracles': '${ORACLE_FILE_TEST}'}, source)
                    self.assertIn('${ORACLE_FILE_TEST}', payload['scoring_oracles'])
                    effective = bridge.resolve_env_references(payload)['scoring_oracles']
                    self.assertEqual(Path(effective).resolve(), (checkout / 'oracles.json').resolve())

    def test_explicit_sync_keeps_profile_relative_oracles_bound_to_the_same_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            web, checkout = root / 'web', root / 'checkout'
            web.mkdir()
            checkout.mkdir()
            oracle = web / 'oracles.json'
            oracle.write_text('[]')
            profile = web / 'config.yaml'
            profile.write_text('target_url: http://localhost/dvwa\nprovider: gemini\nscoring_mode: human\nscoring_oracles: oracles.json\n')
            target = checkout / 'config.yaml'
            target.write_text('# checkout original\n')
            with patch.object(bridge, '_source_config_path', return_value=target), patch.dict(os.environ, {'TESIS_WEB_CONFIG_PATH': str(profile)}):
                reply = bridge.command_write_tesis_config({})
                self.assertTrue(reply['written'], reply.get('error'))
                resolved = load_and_resolve_config(config_path=str(target), cli_args={})
                self.assertEqual(resolved.scoring_oracles, [])
                self.assertEqual(target.with_suffix('.yaml.web-backup').read_text(), '# checkout original\n')
                self.assertIn('scoring_oracles: oracles.json', profile.read_text())


if __name__ == '__main__':
    unittest.main()
