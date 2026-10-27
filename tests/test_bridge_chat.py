"""Offline tests for chat configuration and streamed provider events."""
import contextlib
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import httpx

from test_bridge_reasoning import bridge
from tesis.config_loader import dump_yaml_config
from langchain_core.messages import HumanMessage


class ChatBridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "config.yaml"
        self.path.write_text(dump_yaml_config({"models": {"openai_codex_auth": {
            "model_name": "gpt-fixture", "extra": {"account": "test"},
            "reasoning_efforts": ["low", "high"], "reasoning_effort": "low"}}}))
        env = patch.dict(os.environ, {"TESIS_WEB_CONFIG_PATH": str(self.path)})
        env.start()
        self.addCleanup(env.stop)

    def test_chat_uses_saved_profile_and_effort(self):
        request = {"target": "openai_codex_auth", "expectedModel": "gpt-fixture", "effort": "high", "messages": [{"role": "user", "content": "hello"}],
                   "documentation": True, "excerpts": [{"id": "S1", "source": "tesis/README.md", "line": 2, "text": "reference"}]}
        with patch.object(bridge, "_stream_codex_chat") as stream:
            result = bridge.command_chat(request)
        model, messages, effort, _ = stream.call_args.args
        self.assertEqual((model.model_name, model.extra["account"], effort), ("gpt-fixture", "test", "high"))
        self.assertEqual(messages[0].type, "system")
        self.assertIn("[S1] tesis/README.md:2", messages[0].content)
        self.assertIn("untrusted reference material", messages[0].content)
        self.assertEqual(messages[1].content, "hello")
        self.assertEqual(result["type"], "done")
        request["effort"] = "unadvertised"
        with self.assertRaises(bridge.BridgeError):
            bridge.command_chat(request)
        request.update(effort="high", expectedModel="old-model")
        with self.assertRaisesRegex(bridge.BridgeError, "model has changed"):
            bridge.command_chat(request)

    def test_codex_names_use_model_without_profile_number(self):
        payload = {"models": {"openai_codex_auth": {"model_name": "one"}, "openai_codex_auth_2": {"provider": "openai_codex_auth", "model_name": "two"}}}
        self.path.write_text(dump_yaml_config(payload))
        targets = bridge.command_chat_models({})["targets"]
        self.assertEqual([(item["id"], item["label"]) for item in targets], [("openai_codex_auth", "codex / one"), ("openai_codex_auth_2", "codex / two")])
        profiles = bridge.command_schema({})["modelProfiles"]
        self.assertEqual(profiles, [{"id": item["id"], "label": item["label"]} for item in targets])

    def test_codex_raw_stream_without_header_retains_completed_answer_and_summary(self):
        events = [
            {"type": "response.output_text.delta", "delta": "tentative"},
            {"type": "response.output_item.done", "output_index": 0, "item": {"type": "reasoning",
                "summary": [{"type": "summary_text", "text": "final summary"}], "encrypted_content": "private"}},
            {"type": "response.output_item.done", "output_index": 1, "item": {"type": "message",
                "content": [{"type": "output_text", "text": "final answer"}]}},
            {"type": "response.completed", "response": {"status": "completed", "output": []}},
        ]
        body = "".join(f"data: {json.dumps(event)}\n\n" for event in events).encode()
        transport = httpx.MockTransport(lambda request: httpx.Response(200, content=body))
        session = SimpleNamespace(access_token=lambda account: "secret-token", http=lambda: httpx.Client(transport=transport))
        output = []
        model = SimpleNamespace(model_name="gpt-fixture", extra={}, timeout=60)
        with patch("llm.siwc.oauth.SIWCSession", return_value=session):
            bridge._stream_codex_chat(model, [HumanMessage(content="hi")], "low", lambda kind, text: output.append((kind, text)))
        self.assertEqual(output, [("text", "tentative"), ("replace_text", "final answer"), ("replace_summary", "final summary")])
        self.assertNotIn("private", json.dumps(output))
        self.assertNotIn("secret-token", json.dumps(output))

    def test_codex_incomplete_stream_preserves_completed_items_and_reports_error(self):
        events = [
            {"type": "response.output_item.done", "output_index": 0, "item": {"type": "message",
                "content": [{"type": "output_text", "text": "partial answer"}]}},
            {"type": "response.incomplete", "response": {"status": "incomplete", "output": []}},
        ]
        body = "".join(f"data: {json.dumps(event)}\n\n" for event in events).encode()
        transport = httpx.MockTransport(lambda request: httpx.Response(200, content=body))
        session = SimpleNamespace(access_token=lambda account: "token", http=lambda: httpx.Client(transport=transport))
        output = []
        model = SimpleNamespace(model_name="gpt-fixture", extra={}, timeout=60)
        with patch("llm.siwc.oauth.SIWCSession", return_value=session), self.assertRaisesRegex(bridge.BridgeError, "incomplete"):
            bridge._stream_codex_chat(model, [HumanMessage(content="hi")], None, lambda kind, text: output.append((kind, text)))
        self.assertIn(("replace_text", "partial answer"), output)

    def test_codex_stream_exposes_summary_and_terminal_answer(self):
        events = [
            {"type": "response.reasoning_summary_text.delta", "output_index": 0, "summary_index": 0, "delta": "thinking"},
            {"type": "response.output_text.delta", "delta": "partial"},
            {"type": "response.completed", "response": {"status": "completed", "output": [
                {"type": "reasoning", "summary": [{"type": "summary_text", "text": "final summary"}]},
                {"type": "message", "content": [{"type": "output_text", "text": "final answer"}]},
            ]}},
        ]
        response = SimpleNamespace(status_code=200, headers={"content-type": "text/event-stream"})
        sent = {}
        def open_stream(*args, **kwargs):
            sent.update(kwargs)
            return contextlib.nullcontext(response)
        client = SimpleNamespace(stream=open_stream)
        session = SimpleNamespace(access_token=lambda account: "secret-token", http=lambda: contextlib.nullcontext(client))
        output = []
        model = SimpleNamespace(model_name="gpt-fixture", extra={"account": "test"}, timeout=60)
        with patch("llm.siwc.oauth.SIWCSession", return_value=session), patch("llm.siwc.provider._events", return_value=iter(events)):
            bridge._stream_codex_chat(model, [HumanMessage(content="hi")], "high", lambda kind, text: output.append((kind, text)))
        self.assertEqual(output, [("summary", "thinking"), ("text", "partial"), ("replace_text", "final answer"), ("replace_summary", "final summary")])
        self.assertEqual(sent["json"]["reasoning"], {"effort": "high", "summary": "auto"})
        self.assertEqual(sent["json"]["input"], [{"role": "user", "content": "hi"}])
        self.assertFalse(sent["json"]["store"])
        self.assertNotIn("secret-token", json.dumps(output))

    def test_codex_summary_events_survive_answer_only_terminal_output(self):
        for kind in ("response.reasoning_summary_text.delta", "response.reasoning_summary_text.done", "response.reasoning_summary_part.done"):
            with self.subTest(kind=kind):
                event = {"type": kind, "output_index": 0, "summary_index": 0}
                if kind.endswith(".delta"):
                    event["delta"] = "Provider summary"
                elif kind == "response.reasoning_summary_text.done":
                    event["text"] = "Provider summary"
                else:
                    event["part"] = {"type": "summary_text", "text": "Provider summary"}
                events = [event, {"type": "response.completed", "response": {"status": "completed", "output": [
                    {"type": "message", "content": [{"type": "output_text", "text": "final answer"}]}]}}]
                body = "".join(f"data: {json.dumps(item)}\n\n" for item in events).encode()
                transport = httpx.MockTransport(lambda request: httpx.Response(200, content=body))
                session = SimpleNamespace(access_token=lambda account: "token", http=lambda: httpx.Client(transport=transport))
                output = []
                model = SimpleNamespace(model_name="gpt-fixture", extra={}, timeout=60)
                with patch("llm.siwc.oauth.SIWCSession", return_value=session):
                    bridge._stream_codex_chat(model, [HumanMessage(content="hi")], "high", lambda kind, text: output.append((kind, text)))
                self.assertIn(("replace_summary", "Provider summary"), output)
                self.assertIn(("replace_text", "final answer"), output)
                self.assertFalse(any(kind == "trace" for kind, text in output))

    def test_missing_terminal_is_not_success(self):
        response = SimpleNamespace(status_code=200, headers={"content-type": "text/event-stream"})
        client = SimpleNamespace(stream=lambda *args, **kwargs: contextlib.nullcontext(response))
        session = SimpleNamespace(access_token=lambda account: "token", http=lambda: contextlib.nullcontext(client))
        model = SimpleNamespace(model_name="gpt-fixture", extra={}, timeout=60)
        with patch("llm.siwc.oauth.SIWCSession", return_value=session), patch("llm.siwc.provider._events", return_value=iter([])):
            with self.assertRaisesRegex(bridge.BridgeError, "terminal"):
                bridge._stream_codex_chat(model, [HumanMessage(content="hi")], None, lambda *args: None)

    def test_api_reasoning_deltas_stay_separate(self):
        from langchain_core.messages import AIMessageChunk
        self.path.write_text(dump_yaml_config({"models": {"api": {"provider": "openai_compatible", "model_name": "fixture", "base_url": "https://example.invalid/v1", "api_key": "secret", "reasoning_efforts": ["high"]}}}))
        client = SimpleNamespace(stream=lambda messages: iter([AIMessageChunk(content="answer", additional_kwargs={"reasoning_content": "trace"})]))
        output = io.StringIO()
        with patch("llm.provider.get_llm_from_model_config", return_value=client), contextlib.redirect_stdout(output):
            bridge.command_chat({"target": "api", "expectedModel": "fixture", "effort": "high", "messages": [{"role": "user", "content": "hello"}]})
        events = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual(events, [{"type": "text", "text": "answer"}, {"type": "trace", "text": "trace"}])
        self.assertNotIn("secret", output.getvalue())

    def test_title_uses_same_selected_model_without_losing_answer(self):
        def stream(model, messages, effort, emit):
            if messages[0].type == "system" and messages[0].content.startswith("Write a concise title"):
                emit("replace_text", "A useful title")
            else:
                emit("text", "A useful answer")
        output = io.StringIO()
        with patch.object(bridge, "_stream_codex_chat", side_effect=stream) as mocked, contextlib.redirect_stdout(output):
            result = bridge.command_chat({"target": "openai_codex_auth", "expectedModel": "gpt-fixture", "effort": "high", "generateTitle": True, "messages": [{"role": "user", "content": "hello"}]})
        events = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual([event["type"] for event in events], ["text", "response_done", "title"])
        self.assertEqual(events[-1]["text"], "A useful title")
        self.assertEqual(mocked.call_count, 2)
        self.assertEqual(result["type"], "done")


if __name__ == "__main__":
    unittest.main()
