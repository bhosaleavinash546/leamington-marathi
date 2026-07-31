"""``/locale-audit`` — list missing keys and suspicious mr==hi duplicates.

CLAUDE.md 7: "A locale sanity CI check: fail the build if any key is missing in
any locale, or if an ``mr`` value is byte-identical to its ``hi`` value for keys
in the known-divergent list above."

The second check is the interesting one. Marathi and Hindi share a script, so a
machine translation produces Hindi-flavoured Marathi that passes every
completeness check and that a Maharashtrian reader spots immediately. The
divergent list below is taken from the table in CLAUDE.md 7 and extended with the
cases found while curating the files - the weekday मंगळवार/मंगलवार and the full
moon पौर्णिमा/पूर्णिमा are exactly this failure mode.

Run: ``python -m tools.locale_audit``. Exits non-zero on any finding.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Final

LOCALES_DIR: Final[Path] = Path(__file__).resolve().parent.parent / "locales"
LOCALES: Final[tuple[str, ...]] = ("mr", "hi", "en")
REFERENCE_LOCALE: Final[str] = "mr"  # the default locale (CLAUDE.md N5, 7)

#: ``(namespace, key)`` pairs whose Marathi and Hindi values must differ.
#: Every entry from the CLAUDE.md 7 table, plus the divergences curating the
#: files turned up.
KNOWN_DIVERGENT: Final[frozenset[tuple[str, str]]] = frozenset(
    {
        # From the table in CLAUDE.md 7.
        ("rashi", "tula"),  # तूळ / तुला
        ("graha", "mars"),  # मंगळ / मंगल
        ("graha", "saturn"),  # शनी / शनि
        ("panchang", "tithi"),  # तिथी / तिथि
        ("nakshatra", "mula"),  # मूळ / मूल
        ("nakshatra", "shatataraka"),  # शततारका / शतभिषा
        ("panchang", "rahu_kaal"),  # राहूकाळ / राहुकाल
        ("milan", "guna_milan"),  # गुणमेलन / गुण मिलान
        # Found while curating. Each is a real Marathi/Hindi split, and each is
        # the kind of word machine translation gets wrong.
        ("graha", "sun"),  # रवि / सूर्य
        ("graha", "rahu"),  # राहू / राहु
        ("graha", "ketu"),  # केतू / केतु
        ("nakshatra", "mrigashira"),  # मृगशीर्ष / मृगशिरा
        ("nakshatra", "punarvasu"),  # पुनर्वसू / पुनर्वसु
        ("nakshatra", "swati"),  # स्वाती / स्वाति
        ("tithi", "purnima"),  # पौर्णिमा / पूर्णिमा
        ("vara", "mangalavara"),  # मंगळवार / मंगलवार
        ("panchang", "purnimanta"),  # पौर्णिमांत / पूर्णिमान्त
        ("panchang", "amanta"),  # अमांत / अमान्त
        ("panchang", "pala"),  # पळ / पल
        ("milan", "nadi"),  # नाडी / नाड़ी
        # Doshas and chart combinations. Each of these carries a graha name or a
        # verbal noun that Marathi and Hindi spell differently, so each is a place
        # a machine translation would produce Hindi-flavoured Marathi.
        ("dosha", "mangal_dosha"),  # मंगळ दोष / मंगल दोष
        ("dosha", "kaal_sarpa"),  # काळसर्प / कालसर्प
        ("dosha", "shani_sade_sati"),  # शनी साडेसाती / शनि साढ़ेसाती
        ("dosha", "nadi_dosha"),  # नाडी दोष / नाड़ी दोष
        ("dosha", "guru_chandal_dosha"),  # गुरू चांडाळ / गुरु चांडाल
        ("combination", "chandra_mangal"),  # चंद्र-मंगळ / चंद्र-मंगल
        ("combination", "vakri_bala_vriddhi"),  # बलवृद्धी / बलवृद्धि
        ("combination", "kemadruma_bhanga_kendra_jupiter"),  # गुरू केंद्रात / गुरु केंद्र में
        ("combination", "mangal_dosha_cancellation_own_sign"),  # मंगळ / मंगल
        ("combination", "mangal_dosha_cancellation_jupiter_aspect"),  # दृष्टी / दृष्टि
        ("combination", "veshi"),  # वेशी / वेशि
        ("common", "strong"),  # प्रबळ / प्रबल
        ("common", "yes"),  # होय / हाँ
        ("common", "no"),  # नाही / नहीं
        ("dasha", "balance"),  # शिल्लक / शेष
        ("chart", "drishti"),  # दृष्टी / दृष्टि
        # Added with the patrika sheet (DESIGN.md Phase B). Each is a word
        # Marathi and Hindi genuinely spell differently, so each is a place a
        # machine translation would produce Hindi-flavoured Marathi.
        ("chart", "rashi"),  # रास / राशि - CLAUDE.md 7's own table
        ("chart", "dignity"),  # स्थिती / स्थिति
        ("chart", "sunrise_convention"),  # सूर्योदय पद्धत / सूर्योदय पद्धति
        ("chart", "engine_version"),  # इंजिन आवृत्ती / इंजन संस्करण
        ("chart", "yogas_present"),  # कुंडलीतील योग / कुंडली के योग
        ("chart", "graha_spashta"),  # ग्रहस्पष्ट / ग्रह स्पष्ट
        # REVIEW-360 Workstream A (positioning) strings. Same rule: each is a
        # word Marathi and Hindi genuinely spell differently.
        ("ui", "tagline"),  # जन्मपत्रिका / जन्मकुंडली
        ("ui", "first_run_practitioner"),  # कोष्टके / सारणियाँ
        ("ui", "no_birth_body"),  # जन्मतारीख द्या / जन्म-तिथि दें
        ("ui", "enter_birth"),  # तपशील / विवरण
    }
)


#: Namespaces CLAUDE.md 7 names explicitly: "Separate namespaces: ``common``,
#: ``panchang``, ``rashi``, ``nakshatra``, ``graha``, ``yoga``, ``dosha``,
#: ``dasha``, ``ui``, ``legal``." Checked against the spec rather than against
#: whatever happens to be on disk - ``common`` and ``dosha`` were both missing and
#: this audit passed clean regardless (audit F-006).
REQUIRED_NAMESPACES: Final[frozenset[str]] = frozenset(
    {
        "common",
        "panchang",
        "rashi",
        "nakshatra",
        "graha",
        "yoga",
        "dosha",
        "dasha",
        "ui",
        "legal",
    }
)

#: Namespaces a yoga or dosha key may be named in, mirroring
#: ``api/locale.py:FINDING_NAMESPACES``.
FINDING_NAMESPACES: Final[tuple[str, ...]] = ("combination", "dosha", "milan")

#: ``(namespace, key)`` pairs whose value is structured data rather than a display
#: string. The blocklist is a ``{category: [regex, ...]}`` map (CLAUDE.md 6:
#: "keyed to a blocklist per locale"), so the string checks below do not apply to
#: it and :func:`audit_blocklists` checks it properly instead.
STRUCTURED_VALUES: Final[frozenset[tuple[str, str]]] = frozenset({("narrative", "blocklist")})


class LocaleAuditError(Exception):
    """One or more locale problems were found."""


def load_locale(locale: str) -> dict[str, dict[str, object]]:
    """All namespaces for one locale, as ``{namespace: {key: value}}``."""
    directory = LOCALES_DIR / locale
    if not directory.is_dir():
        raise LocaleAuditError(f"no locale directory for {locale!r} at {directory}")
    out: dict[str, dict[str, object]] = {}
    for path in sorted(directory.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise LocaleAuditError(f"{path} is not a flat object")
        out[path.stem] = data
    return out


def display_strings(namespace: str, entries: dict[str, object]) -> dict[str, str]:
    """The entries of one namespace that are user-visible strings.

    Structured values are excluded here and audited by
    :func:`audit_blocklists`; a non-string that is *not* declared structured is
    reported as a problem rather than skipped.
    """
    out: dict[str, str] = {}
    for key, value in entries.items():
        if (namespace, key) in STRUCTURED_VALUES:
            continue
        if isinstance(value, str):
            out[key] = value
    return out


def rule_keys() -> list[str]:
    """Every yoga/dosha key the engine can emit, read from the rule tables.

    Includes the keys computed outside the YAML - Kaal Sarpa, Sade Sati and Nadi
    dosha are produced by ``core/doshas/computed.py`` and reach exactly the same
    place on the page, so a coverage check that skipped them would leave the gap it
    exists to close.
    """
    import yaml

    keys: set[str] = {"kaal_sarpa", "shani_sade_sati", "nadi_dosha"}
    rules_dir = LOCALES_DIR.parent / "core" / "rules" / "data"
    for path in sorted(rules_dir.glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        keys.update(str(rule["key"]) for rule in data.get("rules", []))
    return sorted(keys)


def warning_keys() -> list[str]:
    """Every warning key the engine can emit, read from the source rather than listed.

    ``BirthData.warnings`` and the geocoder are the two producers. Parsing them
    means a new warning cannot be added without a term, which is how audit F-004
    would otherwise have shipped a sixth untranslated key into the one surface
    F-005 had just cleaned up.
    """
    import ast

    root = LOCALES_DIR.parent
    keys: set[str] = set()
    for relative, function in (("core/types.py", "warnings"), ("api/routers/geocode.py", None)):
        tree = ast.parse((root / relative).read_text(encoding="utf-8"))
        scopes = (
            [n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == function]
            if function
            else [tree]
        )
        for scope in scopes:
            keys.update(
                node.value
                for node in ast.walk(scope)
                if isinstance(node, ast.Constant)
                and isinstance(node.value, str)
                and node.value.islower()
                and node.value.count("_") >= 3
                and node.value.isascii()
            )
    return sorted(keys)


#: Namespaces a consumer is allowed not to load, with the reason. ``narrative``
#: holds the blocklist and refusal string and is server-side only, so the web
#: bundle must *not* carry it.
CONSUMER_EXEMPT: Final[dict[str, frozenset[str]]] = {
    "api/locale.py": frozenset({"narrative"}),
    "web/lib/messages.ts": frozenset({"narrative"}),
}


def consumer_namespaces() -> dict[str, list[str]]:
    """What each consumer actually loads, parsed from its source.

    Three lists of namespaces existed - this audit's, ``api/locale.py``'s and
    ``web/lib/messages.ts``'s - and nothing compared them. The API's was missing
    ``graha_abbr``, so every chart printed Latin ``Su Me`` on a Marathi sheet; the
    web's was missing ``combination``, ``dosha``, ``common`` and ``warning``, so
    yoga names reached the reader as ``kemadruma_bhanga_kendra_jupiter``. Every
    term was present in ``locales/`` and this audit passed clean throughout,
    because it checked the files and never asked who read them.
    """
    import ast

    root = LOCALES_DIR.parent
    out: dict[str, list[str]] = {}

    tree = ast.parse((root / "api" / "locale.py").read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.AnnAssign)
            and isinstance(node.target, ast.Name)
            and node.target.id == "GLOSSARY_NAMESPACES"
            and isinstance(node.value, ast.Tuple)
        ):
            out["api/locale.py"] = [
                element.value
                for element in node.value.elts
                if isinstance(element, ast.Constant) and isinstance(element.value, str)
            ]

    # The TypeScript side is read with a regex rather than parsed: the array is a
    # flat list of quoted names, and a TS parser is a heavy dependency for that.
    source = (root / "web" / "lib" / "messages.ts").read_text(encoding="utf-8")
    match = re.search(r"export const NAMESPACES\s*=\s*\[(.*?)\]", source, re.DOTALL)
    if match:
        out["web/lib/messages.ts"] = re.findall(r"'([a-z_]+)'", match.group(1))
    return out


def audit_consumer_coverage(loaded: dict[str, dict[str, dict[str, object]]]) -> list[str]:
    """Every namespace on disk must be loaded by every consumer that renders it."""
    problems: list[str] = []
    on_disk = set(loaded[REFERENCE_LOCALE])
    consumers = consumer_namespaces()

    for path in sorted(CONSUMER_EXEMPT):
        if path not in consumers:
            problems.append(
                f"{path}: could not read its namespace list; the audit cannot verify it"
            )
            continue
        declared = set(consumers[path])
        for namespace in sorted(on_disk - declared - CONSUMER_EXEMPT[path]):
            problems.append(
                f"{path}: does not load namespace {namespace!r}, which exists in locales/. "
                "Its terms will reach the reader as raw keys."
            )
        for namespace in sorted(declared - on_disk):
            problems.append(f"{path}: loads namespace {namespace!r}, which is not in locales/")
    return problems


def audit_warning_coverage(loaded: dict[str, dict[str, dict[str, object]]]) -> list[str]:
    """Warning keys must be translated too, not only rule keys.

    They reach the reader through the same confidence banner, and before this
    check they rendered as raw Latin machine keys in all three locales - the
    F-005 defect in a vocabulary that finding did not cover.
    """
    problems: list[str] = []
    keys = warning_keys()
    for locale, namespaces in sorted(loaded.items()):
        terms = namespaces.get("warning", {})
        for key in keys:
            value = terms.get(key)
            if not isinstance(value, str) or not value.strip():
                problems.append(f"{locale}: warning key {key!r} has no term in 'warning'")
    return problems


def audit_rule_key_coverage(loaded: dict[str, dict[str, dict[str, object]]]) -> list[str]:
    """Every engine-emitted finding key must have a display term in every locale.

    This is the check whose absence let audit F-005 ship: parity across locales
    passed because the keys were missing from *all* of them equally, so 29 of 33
    rule keys rendered to the reader as Latin snake_case in the UI and on the
    printed patrika. Key parity alone cannot see that - it compares locales to each
    other, never to what the engine actually emits.
    """
    problems: list[str] = []
    keys = rule_keys()
    for locale, namespaces in sorted(loaded.items()):
        named = {
            key
            for namespace in FINDING_NAMESPACES
            for key, value in namespaces.get(namespace, {}).items()
            if isinstance(value, str) and value.strip()
        }
        for key in keys:
            if key not in named:
                problems.append(
                    f"{locale}: rule key {key!r} has no term in any of "
                    f"{FINDING_NAMESPACES}; it would render as a Latin machine key"
                )
    return problems


def audit_blocklists(loaded: dict[str, dict[str, dict[str, object]]]) -> list[str]:
    """The prohibited-content blocklists must be complete in every locale.

    This is the check that keeps CLAUDE.md 6.6/6.7 enforceable: a category with
    no patterns in one locale means that locale's prose is unguarded, which a
    key-parity check alone would not catch because the key is present.

    The required categories are imported from the validator rather than repeated,
    so adding a prohibition there fails this audit until all three locales carry
    patterns for it.
    """
    from narrative.validator import REQUIRED_CATEGORIES

    problems: list[str] = []
    for locale, namespaces in loaded.items():
        blocklist = namespaces.get("narrative", {}).get("blocklist")
        if not isinstance(blocklist, dict):
            problems.append(f"{locale}/narrative: 'blocklist' must be an object of category lists")
            continue
        for category in sorted(REQUIRED_CATEGORIES - set(blocklist)):
            problems.append(f"{locale}/narrative: blocklist has no {category!r} patterns")
        for category, patterns in sorted(blocklist.items()):
            if not isinstance(patterns, list) or not patterns:
                problems.append(
                    f"{locale}/narrative: blocklist {category!r} is empty; that locale's "
                    "prose would be unguarded for a CLAUDE.md 6.6 category"
                )
                continue
            if locale in ("mr", "hi"):
                for pattern in patterns:
                    if not any("ऀ" <= ch <= "ॿ" for ch in str(pattern)):
                        problems.append(
                            f"{locale}/narrative: blocklist {category!r} pattern "
                            f"{pattern!r} has no Devanagari; an English pattern cannot "
                            "match Devanagari prose"
                        )
    return problems


def audit() -> list[str]:
    """Every problem found, as human-readable lines. Empty means clean."""
    loaded = {locale: load_locale(locale) for locale in LOCALES}
    problems: list[str] = []

    reference = loaded[REFERENCE_LOCALE]

    # 1. Namespace parity.
    for locale in LOCALES:
        if locale == REFERENCE_LOCALE:
            continue
        missing_ns = set(reference) - set(loaded[locale])
        extra_ns = set(loaded[locale]) - set(reference)
        problems += [f"{locale}: missing namespace {ns!r}" for ns in sorted(missing_ns)]
        problems += [f"{locale}: unexpected namespace {ns!r}" for ns in sorted(extra_ns)]

    # 2. Key parity within each namespace.
    for namespace, ref_keys in reference.items():
        for locale in LOCALES:
            if locale == REFERENCE_LOCALE or namespace not in loaded[locale]:
                continue
            other = loaded[locale][namespace]
            for key in sorted(set(ref_keys) - set(other)):
                problems.append(f"{locale}/{namespace}: missing key {key!r}")
            for key in sorted(set(other) - set(ref_keys)):
                problems.append(f"{locale}/{namespace}: extra key {key!r}")

    # 3. No empty values anywhere, and no undeclared structured value.
    for locale in LOCALES:
        for namespace, entries in loaded[locale].items():
            for key, value in sorted(entries.items()):
                if (namespace, key) in STRUCTURED_VALUES:
                    continue
                if not isinstance(value, str):
                    problems.append(
                        f"{locale}/{namespace}: {key!r} is not a string. Add it to "
                        "STRUCTURED_VALUES with a check of its own if that is intended."
                    )
                elif not value.strip():
                    problems.append(f"{locale}/{namespace}: empty value for {key!r}")

    # 1b. The namespaces CLAUDE.md 7 requires by name, checked against the spec.
    for locale in LOCALES:
        for namespace in sorted(REQUIRED_NAMESPACES - set(loaded[locale])):
            problems.append(
                f"{locale}: CLAUDE.md 7 requires a {namespace!r} namespace and there is none"
            )

    # 3b. The prohibited-content blocklists (CLAUDE.md 6.6/6.7).
    problems += audit_blocklists(loaded)

    # 3c. Every finding key the engine can emit has a term (CLAUDE.md N5).
    problems += audit_rule_key_coverage(loaded)

    # 3d. And every warning key, which reaches the same banner.
    problems += audit_warning_coverage(loaded)

    # 3e. And every namespace is actually loaded by the code that renders it.
    problems += audit_consumer_coverage(loaded)

    # 4. Known-divergent terms must actually differ between mr and hi.
    for namespace, key in sorted(KNOWN_DIVERGENT):
        mr = loaded["mr"].get(namespace, {}).get(key)
        hi = loaded["hi"].get(namespace, {}).get(key)
        if mr is None or hi is None:
            problems.append(
                f"divergent list names {namespace}/{key!r} but it is absent from mr or hi"
            )
        elif mr == hi:
            problems.append(
                f"{namespace}/{key!r}: mr and hi are byte-identical ({mr!r}). "
                "This is the machine-translation failure mode CLAUDE.md 7 warns about."
            )

    # 5. English must not be left in Devanagari, nor mr/hi left in Latin.
    for namespace, entries in loaded["en"].items():
        for key, value in sorted(display_strings(namespace, entries).items()):
            if any("ऀ" <= ch <= "ॿ" for ch in value):
                problems.append(f"en/{namespace}: {key!r} contains Devanagari: {value!r}")
    for locale in ("mr", "hi"):
        for namespace, entries in loaded[locale].items():
            for key, value in sorted(display_strings(namespace, entries).items()):
                if not any("ऀ" <= ch <= "ॿ" for ch in value):
                    problems.append(
                        f"{locale}/{namespace}: {key!r} has no Devanagari: {value!r} "
                        "(untranslated?)"
                    )

    return problems


def main() -> int:
    try:
        problems = audit()
    except LocaleAuditError as exc:
        print(f"locale audit could not run: {exc}", file=sys.stderr)
        return 2

    locales = {locale: load_locale(locale) for locale in LOCALES}
    total_keys = sum(len(entries) for entries in locales[REFERENCE_LOCALE].values())
    print(
        f"locales: {', '.join(LOCALES)}  "
        f"namespaces: {len(locales[REFERENCE_LOCALE])}  keys per locale: {total_keys}"
    )
    print(f"known-divergent terms checked: {len(KNOWN_DIVERGENT)}")

    if problems:
        print(f"\n{len(problems)} problem(s):", file=sys.stderr)
        for line in problems:
            print(f"  {line}", file=sys.stderr)
        return 1
    print("locale audit clean")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
