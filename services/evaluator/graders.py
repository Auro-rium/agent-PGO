"""Pure deterministic graders: no network, model calls, or random state."""

import json
from collections.abc import Mapping
from typing import Any


def _normalized(value: Any) -> str:
    return " ".join(str(value).strip().split()).casefold()


def exact_match(actual: Any, expected: Any) -> float:
    if isinstance(actual, str) or isinstance(expected, str):
        return float(_normalized(actual) == _normalized(expected))
    return float(actual == expected)


def contains(actual: Any, expected: Any) -> float:
    return float(_normalized(expected) in _normalized(actual))


def json_subset(actual: Any, expected: Any) -> float:
    try:
        actual_obj = json.loads(actual) if isinstance(actual, str) else actual
        expected_obj = json.loads(expected) if isinstance(expected, str) else expected
    except (TypeError, ValueError, json.JSONDecodeError):
        return 0.0

    def subset(a: Any, e: Any) -> bool:
        if isinstance(e, Mapping):
            return isinstance(a, Mapping) and all(k in a and subset(a[k], v) for k, v in e.items())
        if isinstance(e, list):
            return isinstance(a, list) and len(a) >= len(e) and all(subset(x, y) for x, y in zip(a, e))
        return a == e

    return float(subset(actual_obj, expected_obj))



class DeterministicGrader:
    """Serializable deterministic grader facade used by eval jobs."""
    def __init__(self, kind: str, expected: Any = None, *, pattern: str | None = None, tolerance: float = 0.0):
        self.kind, self.expected, self.pattern, self.tolerance = kind, expected, pattern, tolerance
        if kind not in {"exact_match", "contains", "regex", "numeric_tolerance", "json_subset"}:
            raise ValueError(f"unsupported deterministic grader: {kind}")

    def grade(self, actual: Any, expected: Any = None) -> float:
        import re
        target = self.expected if expected is None else expected
        if self.kind == "exact_match": return exact_match(actual, target)
        if self.kind == "contains": return contains(actual, target)
        if self.kind == "json_subset": return json_subset(actual, target)
        if self.kind == "regex": return float(re.search(self.pattern or str(target), str(actual)) is not None)
        try: return float(abs(float(actual) - float(target)) <= self.tolerance)
        except (TypeError, ValueError): return 0.0

    def __call__(self, actual: Any, expected: Any = None) -> float:
        return self.grade(actual, expected)
