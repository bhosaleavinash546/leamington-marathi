"""Architectural boundaries, enforced as tests.

CLAUDE.md 1: "``core/`` must have **zero** dependency on FastAPI, the LLM client,
or any locale file."
CLAUDE.md 2.1: "Never call ``swe.*`` outside [the adapter]."
CLAUDE.md 12: "``core/`` ... imports nothing from ``api/`` or the LLM client."

These are the kind of rule that a reviewer enforces once and a codebase erodes
quietly, so they are checked mechanically by walking the AST of every module.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

CORE = Path(__file__).resolve().parents[2] / "core"

#: The one module permitted to import the Swiss Ephemeris binding.
SWISSEPH_ALLOWLIST = {"core/ephemeris/swisseph_adapter.py"}

#: Import prefixes ``core/`` may never reach for. The first three are this
#: repository's own layers: ``core/`` sits below all of them, so an import of any
#: one is a dependency inversion, not merely a style problem.
FORBIDDEN_PREFIXES = (
    "api",
    "narrative",
    "render",
    "fastapi",
    "starlette",
    "pydantic",
    "anthropic",
    "openai",
    "httpx",
    "requests",
    "flask",
    "django",
    "sqlalchemy",
    "weasyprint",
)


def _modules() -> list[Path]:
    return sorted(p for p in CORE.rglob("*.py"))


def _imported_names(path: Path) -> set[str]:
    """Top-level module names imported by a file, from its AST."""
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            names.add(node.module)
    return names


@pytest.mark.parametrize("path", _modules(), ids=lambda p: str(p.name))
def test_swisseph_is_confined_to_the_adapter(path: Path) -> None:
    """Only ``swisseph_adapter.py`` may import ``swisseph``."""
    relative = path.relative_to(CORE.parent).as_posix()
    imports = _imported_names(path)
    if any(name == "swisseph" or name.startswith("swisseph.") for name in imports):
        assert relative in SWISSEPH_ALLOWLIST, (
            f"{relative} imports swisseph. The ephemeris must stay behind "
            "core/ephemeris/adapter.py so it can be swapped for Skyfield "
            "without touching another module (CLAUDE.md 2.1)."
        )


@pytest.mark.parametrize("path", _modules(), ids=lambda p: str(p.name))
def test_core_imports_no_web_or_llm_dependency(path: Path) -> None:
    """``core/`` stays a pure computation package."""
    relative = path.relative_to(CORE.parent).as_posix()
    for name in _imported_names(path):
        head = name.split(".")[0]
        assert head not in FORBIDDEN_PREFIXES, (
            f"{relative} imports {name!r}; core/ must not depend on the API, "
            "the LLM client, the ORM or the PDF renderer (CLAUDE.md 1)"
        )


@pytest.mark.parametrize("path", _modules(), ids=lambda p: str(p.name))
def test_core_imports_no_locale_file(path: Path) -> None:
    """No module in ``core/`` reads a locale file.

    ``core/`` returns keys; mapping them to mr/hi/en happens strictly above it
    (CLAUDE.md 1, 5). A module that opened ``locales/`` would let a translation
    leak into ChartFacts.
    """
    text = path.read_text(encoding="utf-8")
    for needle in ("locales/", "locales\\", "next-intl", "gettext"):
        assert needle not in text, f"{path.name} references {needle!r}"


def test_no_devanagari_in_engine_keys() -> None:
    """Devanagari may appear in comments and docstrings, never in a key or enum.

    The distinction matters: a docstring that names तिथी is documentation, while a
    string literal that reaches ChartFacts would break the contract in
    CLAUDE.md 5. So the check targets assigned string values, not prose.
    """
    from core import enums

    def has_devanagari(text: str) -> bool:
        return any("ऀ" <= ch <= "ॿ" for ch in text)

    for name in dir(enums):
        if name.startswith("_"):
            continue
        value = getattr(enums, name)
        if isinstance(value, str):
            assert not has_devanagari(value), f"enums.{name}"
        elif isinstance(value, tuple | list):
            for item in value:
                if isinstance(item, str):
                    assert not has_devanagari(item), f"enums.{name} contains {item!r}"


def test_every_core_package_has_an_init() -> None:
    """Guards against a namespace package appearing by accident."""
    for directory in sorted(p for p in CORE.rglob("*") if p.is_dir()):
        if directory.name in {"__pycache__", "data", "schema"}:
            continue
        assert (directory / "__init__.py").exists(), f"{directory} has no __init__.py"
