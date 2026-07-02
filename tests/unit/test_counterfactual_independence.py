"""Permanent structural regression test: the Counterfactual Comparator
must never import the compound engine it exists to be an independent
baseline against (Master Plan M5 task 5: "never sharing code with the
real Orchestrator, so it stays an honest baseline" - Counterfactual
Comparator clarifications 5 and 8).

An AST walk over ``counterfactual.py``'s own imports, not a docstring
promise - mirrors ``test_no_wallclock_calls.py``'s "can't be fooled by
a comment or string literal" reasoning (M2 Phase 0 clarification 6).
"""

import ast
from pathlib import Path

FORBIDDEN_MODULE_PREFIXES = (
    "src.domain.agents",
    "src.domain.orchestrator.scheduler",
    "src.domain.orchestrator.risk_formula",
    "src.domain.orchestrator.tiering",
    "src.domain.orchestrator.justification",
)


def _imported_modules(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(), filename=str(path))
    modules: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            modules.append(node.module)
    return modules


def test_counterfactual_module_shares_no_code_with_compound_engine() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    path = repo_root / "src" / "domain" / "orchestrator" / "counterfactual.py"
    modules = _imported_modules(path)

    violations = [
        module
        for module in modules
        if any(module.startswith(prefix) for prefix in FORBIDDEN_MODULE_PREFIXES)
    ]
    assert not violations, f"counterfactual.py imports compound-engine modules: {violations}"
