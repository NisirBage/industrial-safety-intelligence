"""Forbids wall-clock calls in src/domain and src/services.

Exists because SimClock is meant to be the only notion of "now" those
two layers use (Master Plan A.9); this replaces a proposed CI grep
check with an AST walk (M2 Phase 0 clarification 6), which can't be
fooled by a comment or string literal that happens to contain the
text "datetime.now" the way grep could.
"""

import ast
from pathlib import Path

FORBIDDEN_CALLS = {
    ("datetime", "utcnow"),
    ("datetime", "now"),
    ("time", "time"),
}

SCANNED_DIRS = ("src/domain", "src/services")


def _forbidden_calls_in_file(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(), filename=str(path))
    violations = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            value = node.func.value
            if isinstance(value, ast.Name) and (value.id, node.func.attr) in FORBIDDEN_CALLS:
                violations.append(f"{path}:{node.lineno}: {value.id}.{node.func.attr}()")
    return violations


def test_no_wallclock_calls_in_domain_or_services() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    violations: list[str] = []
    for rel_dir in SCANNED_DIRS:
        for py_file in (repo_root / rel_dir).rglob("*.py"):
            violations.extend(_forbidden_calls_in_file(py_file))
    assert not violations, "wall-clock calls found:\n" + "\n".join(violations)
