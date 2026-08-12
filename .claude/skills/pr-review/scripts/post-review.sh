#!/usr/bin/env bash
#
# Post a PR review with inline comments.
#
#   post-review.sh <pr-number> <findings.json> <summary.md> [event]
#
# findings.json is an array of {path, line, side, body}. `side` defaults to RIGHT.
# event defaults to COMMENT; REQUEST_CHANGES and APPROVE are the other valid values.
#
# GitHub rejects the whole review with a 422 if any comment anchors to a line that is
# not part of the diff, so an anchoring mistake in one finding loses all of them.

set -euo pipefail

if [ $# -lt 3 ]; then
  sed -n '2,8p' "$0" | sed 's/^# \?//'
  exit 64
fi

pr=$1
findings=$2
summary=$3
event=${4:-COMMENT}

for f in "$findings" "$summary"; do
  [ -r "$f" ] || { echo "cannot read $f" >&2; exit 66; }
done

jq -e 'type == "array"' "$findings" >/dev/null 2>&1 ||
  { echo "$findings must be a JSON array of comment objects" >&2; exit 65; }

# Anchor every comment to the right-hand side unless it explicitly targets a removed line.
payload=$(jq -n \
  --arg event "$event" \
  --rawfile body "$summary" \
  --slurpfile comments "$findings" \
  '{
     event: $event,
     body: $body,
     comments: ($comments[0] | map(. + { side: (.side // "RIGHT") }))
   }')

count=$(jq 'length' "$findings")
echo "Posting $count inline comment(s) to PR #$pr as $event..." >&2

if ! response=$(printf '%s' "$payload" |
  gh api --method POST "repos/{owner}/{repo}/pulls/$pr/reviews" --input - 2>&1); then
  echo "$response" >&2
  case "$response" in
    *422*) cat >&2 <<'EOT'

422 usually means a comment is anchored to a line that is not in the diff.
Check each `line` against `gh pr diff <N>`, or move that finding into the summary.
EOT
      ;;
  esac
  exit 1
fi

printf '%s\n' "$response" | jq -r '"Review posted: \(.html_url)"'
