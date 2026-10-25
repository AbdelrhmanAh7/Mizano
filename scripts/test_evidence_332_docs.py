"""Consistency and verification tests for docs/evidence/332/EVIDENCE.md — AC6 evidence mapping.

Run: python3 -m pytest scripts/test_evidence_332_docs.py -q
"""

from pathlib import Path
import re
import pytest

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE_PATH = ROOT / "docs" / "evidence" / "332" / "EVIDENCE.md"


def read_evidence() -> str:
    if not EVIDENCE_PATH.exists():
        pytest.skip(f"Evidence file not found: {EVIDENCE_PATH}")
    return EVIDENCE_PATH.read_text(encoding="utf-8")


def find_ac6_row(content: str) -> str | None:
    """Extract the AC6 row from the verification matrix table."""
    lines = content.splitlines()
    in_table = False
    headers = []

    for line in lines:
        stripped = line.strip()
        if not stripped.startswith("|"):
            in_table = False
            headers = []
            continue

        parts = [p.strip().replace(r"\|", "|") for p in re.split(r"(?<!\\)\|", stripped)[1:-1]]
        if not parts:
            continue

        if all(re.match(r"^:?-+:?$", p) for p in parts):
            continue

        if not in_table:
            if any(re.search(r"(?i:criterion|ac id|ac\b|status|exit code)", p) for p in parts):
                headers = [p.lower() for p in parts]
                in_table = True
            continue

        if in_table and headers and len(parts) == len(headers):
            row_dict = dict(zip(headers, parts))
            ac_val = ""
            for k, v in row_dict.items():
                if "ac" in k or "criterion" in k or "id" in k:
                    ac_val = v
                    break
            if re.search(r"(?i:\bac[-_\s]*6\b)", ac_val):
                return line
    return None


def find_ac6_definition(content: str) -> str | None:
    """Extract the AC6 definition from the numbered acceptance criteria section."""
    lines = content.splitlines()
    in_ac6 = False
    collected = []

    for line in lines:
        stripped = line.strip()
        # Match AC6 definition heading or bullet
        if re.match(r"^\d+\.\s+\*\*AC6\b", stripped) or re.match(r"^-\s+\*\*AC6\b", stripped, re.IGNORECASE):
            in_ac6 = True
            collected.append(line)
            continue
        elif in_ac6:
            # Stop at next AC or major heading
            if re.match(r"^\d+\.\s+\*\*AC[7-9]\b", stripped) or re.match(r"^#{1,3}\s+", stripped):
                in_ac6 = False
            else:
                collected.append(line)
                continue

        # Also check for inline AC6 in list
        if re.search(r"(?i:\bac[-_\s]*6\b)", stripped) and not in_ac6:
            collected.append(line)

    return "\n".join(collected) if collected else None


def ac_references_exist(content: str, ac_nums: list[int]) -> bool:
    """Check if AC rows exist in the verification matrix."""
    lines = content.splitlines()
    in_table = False
    headers = []
    found = set()

    for line in lines:
        stripped = line.strip()
        if not stripped.startswith("|"):
            in_table = False
            headers = []
            continue

        parts = [p.strip().replace(r"\|", "|") for p in re.split(r"(?<!\\)\|", stripped)[1:-1]]
        if not parts:
            continue

        if all(re.match(r"^:?-+:?$", p) for p in parts):
            continue

        if not in_table:
            if any(re.search(r"(?i:criterion|ac id|ac\b|status|exit code)", p) for p in parts):
                headers = [p.lower() for p in parts]
                in_table = True
            continue

        if in_table and headers and len(parts) == len(headers):
            row_dict = dict(zip(headers, parts))
            ac_val = ""
            for k, v in row_dict.items():
                if "ac" in k or "criterion" in k or "id" in k:
                    ac_val = v
                    break
            for ac_num in ac_nums:
                if re.search(rf"(?i:\bac[-_\s]*{ac_num}\b)", ac_val):
                    found.add(ac_num)

    return len(found) == len(ac_nums)


class TestEvidence332AC6:
    """Tests for AC6 evidence mapping in docs/evidence/332/EVIDENCE.md."""

    def test_ac6_row_references_ac2_to_ac4(self):
        """AC6 evidence row must reference AC2, AC3, and AC4 (or AC2–AC4) for TypeScript and Jest results."""
        content = read_evidence()
        ac6_row = find_ac6_row(content)
        assert ac6_row is not None, "AC6 row not found in verification matrix"

        # Check for AC2, AC3, AC4 references (accept both en-dash and hyphen)
        has_ac2 = bool(re.search(r"(?i:\bac[-_\s]*2\b)", ac6_row))
        has_ac3 = bool(re.search(r"(?i:\bac[-_\s]*3\b)", ac6_row))
        has_ac4 = bool(re.search(r"(?i:\bac[-_\s]*4\b)", ac6_row))
        has_range = bool(re.search(r"(?i:ac[-_\s]*2[–-]ac[-_\s]*4|ac2[–-]ac4)", ac6_row))

        assert has_ac2 and has_ac3 and has_ac4 or has_range, (
            f"AC6 row must reference AC2, AC3, and AC4 (or AC2–AC4). Row: {ac6_row}"
        )

    def test_ac6_command_labelled_eslint(self):
        """AC6 row must identify its command as the ESLint check."""
        content = read_evidence()
        ac6_row = find_ac6_row(content)
        assert ac6_row is not None, "AC6 row not found in verification matrix"

        # The command column should mention eslint or lint (case insensitive)
        assert re.search(r"(?i:eslint|\blint\b)", ac6_row), (
            f"AC6 row command column must identify the command as ESLint check. Row: {ac6_row}"
        )

    def test_ac6_definition_unchanged(self):
        """AC6 definition must still list TypeScript, ESLint, and Jest."""
        content = read_evidence()
        ac6_def = find_ac6_definition(content)
        assert ac6_def is not None, "AC6 definition not found in acceptance criteria section"

        # Check all three are mentioned
        has_ts = bool(re.search(r"(?i:typescript|type-?check|tsc)", ac6_def))
        has_eslint = bool(re.search(r"(?i:eslint|\blint\b)", ac6_def))
        has_jest = bool(re.search(r"(?i:jest|unit.*route|route.*spec)", ac6_def))

        assert has_ts, f"AC6 definition must mention TypeScript/type-check. Found: {ac6_def}"
        assert has_eslint, f"AC6 definition must mention ESLint/lint. Found: {ac6_def}"
        assert has_jest, f"AC6 definition must mention Jest/unit/route specs. Found: {ac6_def}"

    def test_ac2_ac4_rows_still_present(self):
        """AC2, AC3, AC4 rows must still exist in the verification matrix."""
        content = read_evidence()
        assert ac_references_exist(content, [2, 3, 4]), "AC2, AC3, AC4 rows must exist in verification matrix"


if __name__ == "__main__":
    pytest.main([__file__, "-q"])