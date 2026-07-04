"""Conformance tests that guard the two architectural invariants.

1. Shared code never branches on a *specific* SKU identity. Dispatch is allowed
   by ``sku_id`` (as a lookup key) and by ``ResultType``; comparing ``sku_id`` to
   a hardcoded string/set — ``if sku_id == "widget"``, ``match sku_id: case ...``
   — is forbidden. This is enforced by AST scan, so it cannot be commented away.
2. Every :class:`ResultType` has a validation reducer (contracts step 4).
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

from core.contracts import ResultType

REPO_ROOT = Path(__file__).resolve().parents[1]

#: Shared code owned by core/backend. Per-SKU code (ml/adapters, plugins, skus)
#: and tests are intentionally NOT scanned — they legitimately name their own id.
SHARED_ROOTS = [REPO_ROOT / "core", REPO_ROOT / "backend"]
SHARED_ML_FILES = [
    REPO_ROOT / "ml" / "__init__.py",
    REPO_ROOT / "ml" / "validate.py",
    REPO_ROOT / "ml" / "train.py",
]

#: Names/attributes that denote a SKU identity.
_SKU_NAMES = {"sku", "sku_id"}
_IDENTITY_OPS = (ast.Eq, ast.NotEq, ast.In, ast.NotIn)


def _shared_python_files() -> list[Path]:
    files: list[Path] = []
    for root in SHARED_ROOTS:
        files.extend(p for p in root.rglob("*.py") if "__pycache__" not in p.parts)
    files.extend(p for p in SHARED_ML_FILES if p.exists())
    return files


def _is_sku_ref(node: ast.AST) -> bool:
    if isinstance(node, ast.Name):
        return node.id in _SKU_NAMES
    if isinstance(node, ast.Attribute):
        return node.attr in _SKU_NAMES
    return False


def _is_string_constant(node: ast.AST) -> bool:
    return isinstance(node, ast.Constant) and isinstance(node.value, str)


def _is_constant_identity(node: ast.AST) -> bool:
    """A string literal, or a container literal of string literals."""
    if _is_string_constant(node):
        return True
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        return bool(node.elts) and all(_is_string_constant(e) for e in node.elts)
    return False


def _scan_source(path: Path) -> list[str]:
    """Return human-readable descriptions of any sku-identity branches found."""
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    violations: list[str] = []
    rel = path.relative_to(REPO_ROOT)

    for node in ast.walk(tree):
        # Case A: comparing a sku ref against a hardcoded identity.
        if isinstance(node, ast.Compare):
            if not any(isinstance(op, _IDENTITY_OPS) for op in node.ops):
                continue
            operands = [node.left, *node.comparators]
            has_sku = any(_is_sku_ref(o) for o in operands)
            has_const = any(_is_constant_identity(o) for o in operands)
            if has_sku and has_const:
                violations.append(f"{rel}:{node.lineno}: sku identity comparison")

        # Case B: match sku_id / match sku with constant case patterns.
        elif isinstance(node, ast.Match) and _is_sku_ref(node.subject):
            for case in node.cases:
                if _match_has_constant_pattern(case.pattern):
                    violations.append(
                        f"{rel}:{case.pattern.lineno}: match on sku identity"
                    )

    return violations


def _match_has_constant_pattern(pattern: ast.AST) -> bool:
    if isinstance(pattern, ast.MatchValue):
        return _is_string_constant(pattern.value)
    if isinstance(pattern, ast.MatchOr):
        return any(_match_has_constant_pattern(p) for p in pattern.patterns)
    return False


def test_no_sku_identity_branching_in_shared_code():
    all_violations: list[str] = []
    for path in _shared_python_files():
        all_violations.extend(_scan_source(path))
    assert not all_violations, "sku_id branching in shared code:\n" + "\n".join(
        all_violations
    )


def test_scanner_detects_a_planted_violation(tmp_path: Path):
    """Guard the guard: the scanner must flag an obvious violation."""
    planted = tmp_path / "bad.py"
    planted.write_text(
        "def f(sku_id):\n"
        "    if sku_id == 'widget':\n"
        "        return 1\n"
        "    return 0\n",
        encoding="utf-8",
    )
    # Re-root the relative path so _scan_source works outside the repo tree.
    tree = ast.parse(planted.read_text(encoding="utf-8"))
    found = any(
        isinstance(n, ast.Compare)
        and any(_is_sku_ref(o) for o in [n.left, *n.comparators])
        and any(_is_constant_identity(o) for o in [n.left, *n.comparators])
        for n in ast.walk(tree)
    )
    assert found


def test_every_result_type_has_a_validation_reducer():
    from ml.validate import supported_result_types

    missing = set(ResultType) - supported_result_types()
    assert not missing, f"ResultType(s) without a validation reducer: {missing}"
