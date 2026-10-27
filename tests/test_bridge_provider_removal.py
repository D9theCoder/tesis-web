"""Offline checks for TESIS model references during provider removal."""
import copy
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from test_bridge_reasoning import bridge
from tesis.provider_registry import model_profile_id
from tesis.config_loader import dump_yaml_config


class ProviderRemovalTests(unittest.TestCase):
    def test_reports_explicit_references_to_removed_profiles(self):
        first = model_profile_id("river", "model-one")
        second = model_profile_id("river", "model-two")
        original = {"api_providers": {"river": {"protocol": "openai_compatible", "base_url": "https://example.invalid/v1", "api_key": "${RIVER_KEY}", "models": ["model-one", "model-two"]}},
                    "provider": first, "providers": [first, second], "model_profile": second,
                    "llm_runtime": {"roles": {"orchestrator": {"model_profile": first}}},
                    "scoring_evaluator": {"provider": second}}
        draft = copy.deepcopy(original)
        draft["api_providers"].pop("river")
        refs = bridge._removed_profile_references(original, draft)
        self.assertEqual([(item["path"], item["profile"]) for item in refs], [
            ("provider", first), ("providers", first), ("providers", second), ("model_profile", second),
            ("llm_runtime.roles.orchestrator.model_profile", first), ("scoring_evaluator.provider", second),
        ])
        draft["provider"] = "gemini"
        draft["providers"] = []
        draft.pop("model_profile")
        draft.pop("llm_runtime")
        draft.pop("scoring_evaluator")
        self.assertEqual(bridge._removed_profile_references(original, draft), [])

    def test_reports_a_replaced_codex_model_with_the_same_profile_id(self):
        original = {"models": {"openai_codex_auth": {"model_name": "old"}}, "model_profile": "openai_codex_auth"}
        draft = {"models": {"openai_codex_auth": {"model_name": "new"}}, "model_profile": "openai_codex_auth"}
        self.assertEqual(bridge._removed_profile_references(original, draft), [{"path": "model_profile", "profile": "openai_codex_auth"}])

    def test_validation_response_contains_references_after_removal(self):
        profile = model_profile_id("river", "model-one")
        payload = {"api_providers": {"river": {"protocol": "openai_compatible", "base_url": "https://example.invalid/v1", "api_key": "${RIVER_KEY}", "models": ["model-one"]}}, "scoring_evaluator": {"provider": profile}}
        with patch.object(bridge, "_state_config_path"), patch.object(bridge, "_resolved_or_error", return_value=(None, "invalid")):
            result = bridge.command_validate({"yaml": dump_yaml_config(payload), "overrides": {"api_providers.river": None}})
        self.assertEqual(result["removedProfileReferences"], [{"path": "scoring_evaluator.provider", "profile": profile}])

    def test_saving_removal_preserves_separately_stored_key(self):
        payload = {"target_url": "http://127.0.0.1/dvwa", "provider": "gemini", "scoring_mode": "human",
                   "api_providers": {"river": {"protocol": "openai_compatible", "base_url": "https://example.invalid/v1", "api_key": "${RIVER_KEY}", "models": ["model-one"]}}}
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"TESIS_WEB_CONFIG_PATH": str(Path(directory) / "config.yaml")}):
            config = Path(directory) / "config.yaml"
            env = Path(directory) / ".env"
            config.write_text(dump_yaml_config(payload))
            env.write_text("RIVER_KEY=fixture-key\n")
            result = bridge.command_save({"yaml": dump_yaml_config(payload), "overrides": {"api_providers.river": None}, "apiProviderKeys": {}})
            self.assertTrue(result["saved"], result.get("error"))
            self.assertEqual(env.read_text(), "RIVER_KEY=fixture-key\n")
            self.assertNotIn("river", bridge._read_payload().get("api_providers") or {})


if __name__ == "__main__":
    unittest.main()
