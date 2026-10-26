"""Bounded process-state classifier for watchdog tests (#514)."""

from dataclasses import dataclass
from enum import Enum
import errno
import os
from pathlib import Path
import sys
from typing import Optional


class ProcessState(str, Enum):
    RUNNING = "RUNNING"
    ZOMBIE = "ZOMBIE"
    TERMINATED = "TERMINATED"
    UNKNOWN = "UNKNOWN"


@dataclass(frozen=True)
class StateResult:
    pid: int
    state: ProcessState
    platform: str
    reason: str


def classify_process_state(
    pid: int, proc: Optional[object] = None, platform: Optional[str] = None
) -> StateResult:
    target_platform = platform if platform is not None else sys.platform

    if proc is not None and hasattr(proc, "poll"):
        exit_code = proc.poll()
        if exit_code is not None:
            return StateResult(pid, ProcessState.TERMINATED, target_platform, f"reaped (exit {exit_code})")

    if target_platform.startswith("linux"):
        return _probe_linux(pid, target_platform)
    if target_platform.startswith(("darwin", "freebsd", "openbsd", "netbsd")):
        return _probe_posix(pid, target_platform)

    return StateResult(pid, ProcessState.UNKNOWN, target_platform, f"unsupported platform '{target_platform}'")


def _probe_posix(pid: int, platform: str) -> StateResult:
    for _ in range(2):
        try:
            os.kill(pid, 0)
            return StateResult(pid, ProcessState.RUNNING, platform, "alive (responds to signal 0)")
        except ProcessLookupError:
            return StateResult(pid, ProcessState.TERMINATED, platform, "no such process (ESRCH)")
        except PermissionError:
            return StateResult(pid, ProcessState.UNKNOWN, platform, "permission denied (EPERM)")
        except OSError as exc:
            if exc.errno == errno.ESRCH:
                return StateResult(pid, ProcessState.TERMINATED, platform, "no such process (ESRCH)")
            if exc.errno == errno.EPERM:
                return StateResult(pid, ProcessState.UNKNOWN, platform, "permission denied (EPERM)")
            return StateResult(pid, ProcessState.UNKNOWN, platform, f"os error on signal 0 (errno {exc.errno})")
    return StateResult(pid, ProcessState.UNKNOWN, platform, "re-probes exhausted")


def _probe_linux(pid: int, platform: str) -> StateResult:
    try:
        content = Path(f"/proc/{pid}/stat").read_text()
    except FileNotFoundError:
        try:
            os.kill(pid, 0)
            return StateResult(pid, ProcessState.UNKNOWN, platform, "missing from /proc but alive")
        except (ProcessLookupError, OSError) as exc:
            if isinstance(exc, ProcessLookupError) or exc.errno == errno.ESRCH:
                return StateResult(pid, ProcessState.TERMINATED, platform, "no such process (ESRCH)")
            return StateResult(pid, ProcessState.UNKNOWN, platform, f"probe error after missing /proc: {exc}")
    except PermissionError:
        return StateResult(pid, ProcessState.UNKNOWN, platform, "permission denied reading /proc stat")
    except OSError as exc:
        return StateResult(pid, ProcessState.UNKNOWN, platform, f"os error reading /proc stat: {exc}")

    rindex = content.rfind(")")
    if rindex == -1:
        return StateResult(pid, ProcessState.UNKNOWN, platform, "malformed /proc stat: missing ')'")

    tokens = content[rindex + 1 :].strip().split()
    if not tokens:
        return StateResult(pid, ProcessState.UNKNOWN, platform, "malformed /proc stat: missing state field")

    state_char = tokens[0]
    if state_char in ("Z", "X"):
        return StateResult(pid, ProcessState.ZOMBIE, platform, f"linux stat zombie state '{state_char}'")
    if state_char in ("R", "S", "D", "T", "t", "W", "I", "P"):
        return StateResult(pid, ProcessState.RUNNING, platform, f"linux stat active state '{state_char}'")
    return StateResult(pid, ProcessState.UNKNOWN, platform, f"unrecognised linux stat state '{state_char}'")


def assert_child_terminated(result_or_pid: object, platform: Optional[str] = None) -> None:
    result = (
        result_or_pid
        if isinstance(result_or_pid, StateResult)
        else classify_process_state(int(result_or_pid), platform=platform)
    )
    target_platform = result.platform
    if target_platform.startswith("linux"):
        if result.state in (ProcessState.TERMINATED, ProcessState.ZOMBIE):
            return
    elif result.state == ProcessState.TERMINATED:
        return

    raise AssertionError(
        f"Child process {result.pid} on platform '{target_platform}' is in state {result.state.value} "
        f"(reason: {result.reason}); expected terminated"
    )
