"""Guards turbo.json against task `inputs` that skip source directories.

Turborepo hashes only the files that match a task's `inputs`. A list such as
`src/**` matches nothing in apps/web (its code lives in app/, components/, lib/ and
messages/), so web tasks were replayed from the cache whatever changed, locally and
across git worktrees. A task may therefore only declare `inputs` that start from
`$TURBO_DEFAULT$` (every file of the package) and then add or subtract globs.
Standard library only, so the CI lint job can run it without installing anything.
"""

import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_INPUTS = "$TURBO_DEFAULT$"


def load_tasks(path=ROOT / "turbo.json"):
    return json.loads(path.read_text(encoding="utf-8"))["tasks"]


def restrictive_inputs(tasks):
    """Return the tasks whose `inputs` do not start from the package defaults."""
    return sorted(
        name
        for name, task in tasks.items()
        if "inputs" in task and DEFAULT_INPUTS not in task["inputs"]
    )


class TurboInputsTest(unittest.TestCase):
    def test_cached_tasks_hash_every_file_of_the_package(self):
        self.assertEqual(
            restrictive_inputs(load_tasks()),
            [],
            "turbo.json tasks with `inputs` must include $TURBO_DEFAULT$; listing "
            "directories by hand misses some (apps/web has no src/) and the cache "
            "replays stale results",
        )

    def test_guard_flags_a_source_directory_only_list(self):
        tasks = {
            "lint": {"inputs": ["src/**/*.ts", ".eslintrc.*"]},
            "test": {"inputs": [DEFAULT_INPUTS, "!**/*.md"]},
            "build": {},
        }
        self.assertEqual(restrictive_inputs(tasks), ["lint"])


if __name__ == "__main__":
    unittest.main()
