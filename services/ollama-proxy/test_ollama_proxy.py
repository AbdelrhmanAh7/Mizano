"""Tests for the ollama-proxy webhook secret handling.

Run from this directory:  python -m unittest discover -s . -p "test_*.py"
(needs fastapi, httpx and uvicorn, the same packages as the Dockerfile).
"""

import importlib
import os
import sys
import tempfile
import unittest
from unittest import mock

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def load_proxy(env: dict):
    """Import (or re-import) the proxy module under the given environment."""
    clean = {k: v for k, v in os.environ.items() if k != "WEBHOOK_SECRET"}
    clean.update(env)
    with mock.patch.dict(os.environ, clean, clear=True):
        import ollama_proxy

        return importlib.reload(ollama_proxy)


class SecretGuardTests(unittest.TestCase):
    def test_no_hardcoded_fallback_secret(self):
        proxy = load_proxy({})
        self.assertEqual(proxy.WEBHOOK_SECRET, "")
        here = os.path.dirname(os.path.abspath(__file__))
        with open(os.path.join(here, "ollama_proxy.py"), encoding="utf-8") as f:
            source = f.read()
        with open(os.path.join(here, "Dockerfile"), encoding="utf-8") as f:
            dockerfile = f.read()
        # "change-me" may only appear in the placeholder deny-list, never as a default value
        self.assertNotIn('"change-me")', source)
        self.assertNotIn("=change-me", dockerfile)
        self.assertNotRegex(dockerfile, r"(?m)^ENV\s+WEBHOOK_SECRET")

    def test_refuses_to_start_without_secret(self):
        proxy = load_proxy({})
        with self.assertRaises(RuntimeError):
            proxy.require_webhook_secret()

    def test_refuses_blank_and_placeholder_secrets(self):
        for value in ["", "   ", "change-me", "CHANGE-ME", "__CHANGE_ME__", "changeme", "secret"]:
            with self.subTest(value=value):
                proxy = load_proxy({"WEBHOOK_SECRET": value})
                with self.assertRaises(RuntimeError):
                    proxy.require_webhook_secret()

    def test_accepts_a_real_secret(self):
        proxy = load_proxy({"WEBHOOK_SECRET": "a-long-random-value-1234567890"})
        proxy.require_webhook_secret()  # does not raise

    def test_application_lifespan_fails_fast_without_secret(self):
        proxy = load_proxy({})
        with self.assertRaises(RuntimeError):
            with TestClient(proxy.app):
                pass

    def test_secrets_match_is_exact_and_type_safe(self):
        proxy = load_proxy({"WEBHOOK_SECRET": "s3cret-value"})
        self.assertTrue(proxy.secrets_match("s3cret-value", "s3cret-value"))
        self.assertFalse(proxy.secrets_match("s3cret-valuf", "s3cret-value"))
        self.assertFalse(proxy.secrets_match("short", "s3cret-value"))
        self.assertFalse(proxy.secrets_match("s3cret-value" * 50, "s3cret-value"))
        self.assertFalse(proxy.secrets_match("", "s3cret-value"))
        self.assertFalse(proxy.secrets_match("anything", ""))
        self.assertFalse(proxy.secrets_match(None, "s3cret-value"))
        self.assertFalse(proxy.secrets_match(123, "s3cret-value"))

    def test_comparison_uses_hmac_compare_digest_on_equal_length_digests(self):
        proxy = load_proxy({"WEBHOOK_SECRET": "s3cret-value"})
        with mock.patch.object(proxy.hmac, "compare_digest", wraps=proxy.hmac.compare_digest) as spy:
            proxy.secrets_match("x", "a-completely-different-length-secret")
        spy.assert_called_once()
        left, right = spy.call_args[0]
        self.assertEqual(len(left), 32)
        self.assertEqual(len(right), 32)


class WebhookEndpointTests(unittest.TestCase):
    SECRET = "a-long-random-value-1234567890"

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.url_file = os.path.join(self.tmp.name, "tunnel_url")
        self.proxy = load_proxy({"WEBHOOK_SECRET": self.SECRET, "TUNNEL_URL_FILE": self.url_file})
        self.proxy._cached_url = None
        self.client_cm = TestClient(self.proxy.app)
        self.client = self.client_cm.__enter__()

    def tearDown(self):
        self.client_cm.__exit__(None, None, None)
        self.tmp.cleanup()

    def post(self, body):
        return self.client.post("/api/internal/tunnel-update", json=body)

    def test_rejects_wrong_secret_without_writing(self):
        response = self.post({"secret": "wrong", "tunnel_url": "https://x.trycloudflare.com"})
        self.assertEqual(response.status_code, 403)
        self.assertFalse(os.path.exists(self.url_file))

    def test_rejects_missing_secret_and_non_string_secret(self):
        for body in [{"tunnel_url": "https://x.example"}, {"secret": None, "tunnel_url": "https://x.example"},
                     {"secret": 12345, "tunnel_url": "https://x.example"}]:
            with self.subTest(body=body):
                self.assertEqual(self.post(body).status_code, 403)

    def test_rejects_malformed_bodies(self):
        self.assertEqual(self.client.post("/api/internal/tunnel-update", content="not json").status_code, 400)
        self.assertEqual(self.post(["secret"]).status_code, 400)

    def test_rejects_non_https_tunnel_url(self):
        response = self.post({"secret": self.SECRET, "tunnel_url": "http://insecure.example"})
        self.assertEqual(response.status_code, 400)

    def test_accepts_correct_secret_and_does_not_echo_the_url(self):
        response = self.post({"secret": self.SECRET, "tunnel_url": "https://ok.trycloudflare.com"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})
        with open(self.url_file, encoding="utf-8") as f:
            self.assertEqual(f.read(), "https://ok.trycloudflare.com")

    def test_tunnel_file_is_private(self):
        if os.name == "nt":
            self.skipTest("POSIX file modes are not meaningful on Windows")
        self.post({"secret": self.SECRET, "tunnel_url": "https://ok.trycloudflare.com"})
        self.assertEqual(os.stat(self.url_file).st_mode & 0o777, 0o600)

    def test_health_never_exposes_the_tunnel_url(self):
        self.post({"secret": self.SECRET, "tunnel_url": "https://secret-host.trycloudflare.com"})
        with mock.patch.object(self.proxy.httpx, "AsyncClient", side_effect=RuntimeError("offline")):
            body = self.client.get("/health").json()
        self.assertTrue(body["tunnel_configured"])
        self.assertNotIn("secret-host", str(body))
        self.assertNotIn("tunnel_url", body)


if __name__ == "__main__":
    unittest.main()
