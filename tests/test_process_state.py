"""Unit and behavioral tests for bounded process state classifier (#514)."""

import os
from pathlib import Path
import subprocess
import sys
import time
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tests.support.process_state import (
    ProcessState,
    StateResult,
    assert_child_terminated,
    classify_process_state,
)


class ProcessStateContractTests(unittest.TestCase):
    def test_classify_process_state_contract(self):
        res = classify_process_state(99999999)
        self.assertIsInstance(res, StateResult)
        self.assertEqual(res.pid, 99999999)
        self.assertIn(res.state, set(ProcessState))
        self.assertTrue(res.reason and res.platform)


class RunningSurvivorAndTerminatedTests(unittest.TestCase):
    def spawn_sleeper(self):
        proc = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])
        self.addCleanup(self._cleanup_proc, proc)
        return proc

    def _cleanup_proc(self, proc):
        if proc.poll() is None:
            try:
                proc.kill()
                proc.wait(timeout=2)
            except Exception:
                pass

    def test_running_child_classified_as_running_and_fails_assertion(self):
        proc = self.spawn_sleeper()
        res = classify_process_state(proc.pid, proc=proc)
        self.assertEqual(res.state, ProcessState.RUNNING)
        with self.assertRaises(AssertionError) as ctx:
            assert_child_terminated(res)
        msg = str(ctx.exception)
        self.assertTrue(str(proc.pid) in msg and "RUNNING" in msg and res.platform in msg)

    def test_terminated_reaped_child_classified_as_terminated_and_passes(self):
        proc = self.spawn_sleeper()
        proc.kill()
        proc.wait(timeout=5)
        res = classify_process_state(proc.pid, proc=proc)
        self.assertEqual(res.state, ProcessState.TERMINATED)
        assert_child_terminated(res)
        assert_child_terminated(proc.pid)


class LinuxZombieTests(unittest.TestCase):
    @unittest.skipUnless(sys.platform.startswith("linux"), "Linux-specific /proc zombie test")
    def test_live_linux_zombie_classified_and_passes_assertion(self):
        proc = subprocess.Popen([sys.executable, "-c", "import sys; sys.exit(0)"])
        try:
            for _ in range(30):
                res = classify_process_state(proc.pid)
                if res.state == ProcessState.ZOMBIE:
                    break
                time.sleep(0.05)
            self.assertEqual(res.state, ProcessState.ZOMBIE)
            assert_child_terminated(res)
        finally:
            proc.wait(timeout=2)
        self.assertEqual(classify_process_state(proc.pid, proc=proc).state, ProcessState.TERMINATED)

    def test_mocked_linux_zombie_parsing_with_parentheses_and_spaces(self):
        content = "12345 (worker proc (sub)) Z 1 12345 12345 0 -1 4194304"
        with mock.patch("pathlib.Path.read_text", return_value=content):
            res = classify_process_state(12345, platform="linux")
            self.assertEqual(res.state, ProcessState.ZOMBIE)
            assert_child_terminated(res)

    def test_mocked_linux_active_states_map_to_running_and_fail(self):
        for state_char in ("R", "S", "D", "T", "t", "W", "I", "P"):
            with mock.patch("pathlib.Path.read_text", return_value=f"123 (w) {state_char} 1"):
                res = classify_process_state(123, platform="linux")
                self.assertEqual(res.state, ProcessState.RUNNING)
                with self.assertRaises(AssertionError):
                    assert_child_terminated(res)

    def test_zombie_on_non_linux_platform_fails_assertion(self):
        darwin_zombie = StateResult(123, ProcessState.ZOMBIE, "darwin", "simulated zombie")
        with self.assertRaises(AssertionError) as ctx:
            assert_child_terminated(darwin_zombie)
        self.assertIn("darwin", str(ctx.exception))


class FailClosedUnknownTests(unittest.TestCase):
    def test_permission_error_on_signal_probe_returns_unknown(self):
        with mock.patch("os.kill", side_effect=PermissionError("denied")):
            res = classify_process_state(123, platform="darwin")
            self.assertEqual(res.state, ProcessState.UNKNOWN)
            with self.assertRaises(AssertionError) as ctx:
                assert_child_terminated(res)
            self.assertTrue("UNKNOWN" in str(ctx.exception) and "permission" in str(ctx.exception))

    def test_permission_error_on_proc_stat_returns_unknown(self):
        with mock.patch("pathlib.Path.read_text", side_effect=PermissionError("denied")):
            res = classify_process_state(123, platform="linux")
            self.assertEqual(res.state, ProcessState.UNKNOWN)
            with self.assertRaises(AssertionError):
                assert_child_terminated(res)

    def test_malformed_proc_stat_returns_unknown(self):
        for bad_stat in ("123 broken", "123 (w)"):
            with mock.patch("pathlib.Path.read_text", return_value=bad_stat):
                res = classify_process_state(123, platform="linux")
                self.assertEqual(res.state, ProcessState.UNKNOWN)
                with self.assertRaises(AssertionError):
                    assert_child_terminated(res)

    def test_unrecognised_linux_state_and_unsupported_platform(self):
        with mock.patch("pathlib.Path.read_text", return_value="123 (w) Q 1"):
            self.assertEqual(classify_process_state(123, platform="linux").state, ProcessState.UNKNOWN)
        win_res = classify_process_state(123, platform="win32")
        self.assertEqual(win_res.state, ProcessState.UNKNOWN)
        with self.assertRaises(AssertionError):
            assert_child_terminated(win_res)


if __name__ == "__main__":
    unittest.main()
