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
        ("milan", "mangal_dosha"),  # मंगळ दोष / मंगल दोष
        ("dasha", "balance"),  # शिल्लक / शेष
        ("chart", "drishti"),  # दृष्टी / दृष्टि
    }
)


class LocaleAuditError(Exception):
    """One or more locale problems were found."""


def load_locale(locale: str) -> dict[str, dict[str, str]]:
    """All namespaces for one locale, as ``{namespace: {key: value}}``."""
    directory = LOCALES_DIR / locale
    if not directory.is_dir():
        raise LocaleAuditError(f"no locale directory for {locale!r} at {directory}")
    out: dict[str, dict[str, str]] = {}
    for path in sorted(directory.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise LocaleAuditError(f"{path} is not a flat object")
        out[path.stem] = data
    return out


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

    # 3. No empty values anywhere.
    for locale in LOCALES:
        for namespace, entries in loaded[locale].items():
            for key, value in sorted(entries.items()):
                if not isinstance(value, str) or not value.strip():
                    problems.append(f"{locale}/{namespace}: empty value for {key!r}")

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
        for key, value in sorted(entries.items()):
            if any("ऀ" <= ch <= "ॿ" for ch in value):
                problems.append(f"en/{namespace}: {key!r} contains Devanagari: {value!r}")
    for locale in ("mr", "hi"):
        for namespace, entries in loaded[locale].items():
            for key, value in sorted(entries.items()):
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
