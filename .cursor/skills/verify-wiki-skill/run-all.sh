#!/usr/bin/env bash
# Drive every verify fixture through the real renderer at 1440 and 390, light and dark,
# asserting the per-fixture rules. Exits non-zero if any run fails.
# usage: bash .cursor/skills/verify-wiki-skill/run-all.sh [out-dir]
set -u
cd "$(dirname "$0")/../../.."
OUT="${1:-verify-out}"
D=.cursor/skills/verify-wiki-skill/drive.js
F=test/fixtures/verify
fail=0
run() { # fixture expect-json [allow-warning-regex] [extra flags...]
  local fx="$1" ex="$2" allow="$3"; shift 3
  for w in 1440 390; do for s in light dark; do
    local a=(node "$D" "$F/$fx.md" --width "$w" --scheme "$s" --out "$OUT" --expect "$ex")
    [ -n "$allow" ] && a+=(--allow-warning "$allow")
    if "${a[@]}" "$@" > /dev/null; then echo "PASS $fx $w $s"; else echo "FAIL $fx $w $s"; fail=1; fi
  done; done
}
run full '{"hasContents":true,"hasReferences":true,"hasInfobox":true}' '' --popover --jump
run explainer '{"mode":"explainer","hasContents":true,"hasReferences":true}' '' --popover --jump
run no-headings '{"hasContents":false,"tocEntries":0}' ''
run no-footnotes '{"hasReferences":false,"footnoteMarkers":0}' ''
run no-infobox '{"hasInfobox":false}' ''
run empty-infobox-field '{"hasInfobox":true,"emptyInfoboxRows":0}' ''
run broken-link '{"hasSeeAlso":true,"missingLinkElements":0}' ''
run missing-image '{"brokenImages":0}' 'image .* not found; figure dropped'
run see-also-all-missing '{"hasSeeAlso":false,"tocTexts":["1 Section"]}' ''
exit $fail
