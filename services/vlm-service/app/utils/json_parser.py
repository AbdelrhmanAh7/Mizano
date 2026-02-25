import json
import re


def extract_json_from_vlm_output(text: str) -> dict:
    """Extract JSON from VLM output, handling common formatting issues.

    VLMs sometimes wrap JSON in markdown fences or add explanation text before
    or after the JSON object. This function tries 4 strategies in order:

    1. Direct parse (ideal case — model returned only JSON)
    2. Extract from ```json ... ``` markdown fence
    3. Find the first { ... last } substring
    4. Fix common issues (trailing commas, single quotes) and retry strategy 3
    """
    if not text or not text.strip():
        raise ValueError("VLM returned empty output")

    # Strategy 1: Direct parse
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass

    # Strategy 2: Extract from ```json ... ``` markdown fence
    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence_match:
        try:
            return json.loads(fence_match.group(1))
        except json.JSONDecodeError:
            pass

    # Strategy 3: Find first { ... last } braces
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        candidate = text[first_brace : last_brace + 1]
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            # Fall through to strategy 4
            pass

        # Strategy 4: Fix common JSON formatting issues and retry
        fixed = _fix_common_json_issues(candidate)
        try:
            return json.loads(fixed)
        except json.JSONDecodeError:
            pass

    raise ValueError(
        f"Could not extract valid JSON from VLM output. "
        f"Output preview: {text[:200]!r}"
    )


def _fix_common_json_issues(text: str) -> str:
    """Attempt to fix common JSON formatting issues produced by LLMs."""
    # Remove trailing commas before closing braces/brackets
    text = re.sub(r",\s*([}\]])", r"\1", text)
    # Replace single-quoted strings with double-quoted strings
    # Only replace single quotes that are used as string delimiters (not apostrophes)
    text = re.sub(r"(?<![\\])'([^']*)'", r'"\1"', text)
    # Remove JavaScript-style comments (// ...)
    text = re.sub(r"//[^\n]*", "", text)
    # Remove block comments (/* ... */)
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    return text
