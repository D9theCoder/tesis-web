"""Offline bridge regression checks using the checkout's real TESIS semantics."""

import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("bridge", Path(__file__).parents[1] / "scripts/tesis_bridge.py")
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)

from tesis.config_loader import dump_yaml_config, _parse_model_configs, _resolve_scoring_evaluator
from tesis.provider_registry import expanded_model_sections, model_profile_id


class ReasoningBridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.config = Path(self.temp.name) / "config.yaml"
        self.env = patch.dict(os.environ, {"TESIS_WEB_CONFIG_PATH": str(self.config)})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.payload = {
            "api_providers": {"gateway": {"protocol": "openai_compatible", "base_url": "https://provider.invalid/v1",
                "api_key": "literal-secret", "models": ["org/model.v1", "unknown-model"],
                "model_options": {"org/model.v1": {"reasoning_effort": "high"}}}},
            "models": {"gpt": {"provider": "openai_codex_auth", "model_name": "gpt-model", "extra": {"account": "default"},
                "reasoning_efforts": ["low", "high"]}},
            "reasoning_catalog": {"org/model.v1": ["off", "low", "high", "xhigh"]},
        }
        self.config.write_text(dump_yaml_config(self.payload))
        self.model = model_profile_id("gateway", "org/model.v1")

    def request(self, **kwargs):
        return bridge.command_reasoning({"yaml": bridge._masked_yaml(self.payload)[0], **kwargs})

    def test_exact_catalog_unknown_model_and_gpt_metadata(self):
        result = self.request(action="describe")
        targets = {item["id"]: item for item in result["targets"]}
        self.assertEqual(targets[self.model]["efforts"], ["off", "low", "high", "xhigh"])
        self.assertIsNone(targets[model_profile_id("gateway", "unknown-model")]["efforts"])
        self.assertEqual(targets["gpt"]["efforts"], ["low", "high"])
        self.assertEqual(targets["gpt"]["label"], "codex / gpt-model")
        self.assertNotIn("literal-secret", json.dumps(result))
        self.assertNotIn("api_key", json.dumps(result))

    def test_codex_scorer_label_uses_its_effective_model(self):
        self.payload["scoring_evaluator"] = {"model_profile": "gpt", "model": "scorer-model"}
        targets = {item["id"]: item for item in self.request(action="describe")["targets"]}
        self.assertEqual(targets["__evaluator__"]["label"], "AI scorer / codex / scorer-model")

    def test_codex_profile_names_are_shortened_in_labels(self):
        self.payload["models"]["openai_codex_auth"] = {"model_name": "gpt-one"}
        self.payload["models"]["openai_codex_auth_2"] = {"provider": "openai_codex_auth", "model_name": "gpt-two"}
        self.payload["scoring_evaluator"] = {"model_profile": "openai_codex_auth_2"}
        targets = {item["id"]: item for item in self.request(action="describe")["targets"]}
        self.assertEqual(targets["openai_codex_auth"]["label"], "codex / gpt-one")
        self.assertEqual(targets["openai_codex_auth_2"]["label"], "codex / gpt-two")
        self.assertEqual(targets["__evaluator__"]["label"], "AI scorer / codex / gpt-two")

    def test_live_metadata_wins_over_exact_catalog(self):
        self.payload["api_providers"]["gateway"]["model_options"]["org/model.v1"]["reasoning_efforts"] = ["medium"]
        targets = self.request(action="describe")["targets"]
        self.assertEqual(next(item for item in targets if item["id"] == self.model)["efforts"], ["medium"])

    def test_known_effort_patches_exact_model_id_and_preserves_siblings(self):
        result = self.request(action="apply", target=self.model, effort="low")
        payload = bridge._apply_overrides(copy.deepcopy(self.payload), result["overrides"])
        self.assertEqual(expanded_model_sections(payload)[self.model]["reasoning_effort"], "low")
        self.assertEqual(payload["api_providers"]["gateway"]["models"], ["org/model.v1", "unknown-model"])
        self.assertNotIn("literal-secret", json.dumps(result))
        self.assertEqual(bridge._read_payload(), self.payload)

    def test_unknown_or_custom_efforts_cannot_apply_without_probe(self):
        for effort in ("medium", "adaptive"):
            with self.subTest(effort=effort), self.assertRaisesRegex(bridge.BridgeError, "Check reasoning support"):
                self.request(action="apply", target=self.model, effort=effort)

    def test_check_reuses_tui_probe_and_restores_masked_credentials(self):
        with patch("tesis.tui_reasoning.probe_reasoning") as probe:
            result = self.request(action="check", target=self.model, effort="adaptive")
        self.assertTrue(result["accepted"])
        self.assertEqual(probe.call_args.args[0]["api_key"], "literal-secret")
        self.assertEqual(probe.call_args.args[1], "adaptive")
        self.assertNotIn("literal-secret", json.dumps(result))

    def test_provider_errors_do_not_echo_secrets(self):
        with patch("tesis.tui_reasoning.probe_reasoning", side_effect=ValueError("literal-secret")):
            result = self.request(action="check", target=self.model, effort="adaptive")
        self.assertFalse(result["accepted"])
        self.assertNotIn("literal-secret", json.dumps(result))
        self.assertNotIn("overrides", result)

    def test_model_default_clears_explicit_and_legacy_effort(self):
        self.payload["models"]["gpt"].update(reasoning_effort="high", reasoning={"effort": "high"})
        result = self.request(action="apply", target="gpt", effort=None)
        payload = bridge._apply_overrides(copy.deepcopy(self.payload), result["overrides"])
        self.assertIsNone(_parse_model_configs(payload["models"])["gpt"].reasoning_effort)

    def test_scorer_inheritance_removes_override_and_preserves_limits(self):
        self.payload["scoring_evaluator"] = {"provider": "gpt", "reasoning_effort": "high", "timeout": 45}
        self.payload["models"]["gpt"]["reasoning_effort"] = "low"
        result = self.request(action="apply", target="__evaluator__", effort=None)
        payload = bridge._apply_overrides(copy.deepcopy(self.payload), result["overrides"])
        resolved = _resolve_scoring_evaluator(payload["scoring_evaluator"], _parse_model_configs(payload["models"]))
        self.assertEqual(resolved["reasoning_effort"], "low")
        self.assertEqual(resolved["timeout"], 45)

    def test_pending_provider_keys_and_staged_overrides_are_used(self):
        with patch("tesis.tui_reasoning.probe_reasoning") as probe:
            result = self.request(action="check", target=self.model, effort="adaptive",
                apiProviderKeys={"gateway": "pending-secret"}, overrides={"scoring_mode": "human"})
        self.assertEqual(probe.call_args.args[0]["api_key"], "pending-secret")
        self.assertNotIn("pending-secret", json.dumps(result))

    def test_legacy_profile_patch_retains_secret_placeholder_identity(self):
        self.payload["models"]["legacy"] = {"provider": "openai_compatible", "model_name": "legacy-model",
            "api_key": "second-secret", "reasoning_efforts": ["low", "high"]}
        self.config.write_text(dump_yaml_config(self.payload))
        result = self.request(action="apply", target="legacy", effort="high")
        self.assertNotIn("second-secret", json.dumps(result))
        masked, preserved = bridge._mask_yaml_secrets(self.payload)
        staged = bridge._apply_overrides(masked, result["overrides"])
        restored = bridge._restore_yaml_secrets(staged, preserved)
        self.assertEqual(restored["models"]["legacy"]["api_key"], "second-secret")
        self.assertEqual(restored["api_providers"]["gateway"]["api_key"], "literal-secret")

    def test_scorer_override_can_be_changed_back_after_inheritance(self):
        self.payload["scoring_evaluator"] = {"model_profile": "gpt", "reasoning_effort": "high"}
        first = self.request(action="apply", target="__evaluator__", effort=None)
        second = self.request(action="apply", target="__evaluator__", effort="low", overrides=first["overrides"])
        staged = bridge._apply_overrides(copy.deepcopy(self.payload), {**first["overrides"], **second["overrides"]})
        self.assertEqual(staged["scoring_evaluator"]["reasoning_effort"], "low")

    def test_legacy_adapter_named_profile_without_explicit_provider_can_probe(self):
        self.payload["models"]["openai_compatible"] = {"model_name": "legacy-model", "api_key": "${OFFLINE_KEY}"}
        with patch.dict(os.environ, {"OFFLINE_KEY": "offline-key"}), patch("tesis.tui_reasoning.probe_reasoning") as probe:
            result = self.request(action="check", target="openai_compatible", effort="low")
        self.assertTrue(result["accepted"])
        self.assertEqual(probe.call_args.args[0]["provider"], "openai_compatible")


if __name__ == "__main__":
    unittest.main()
