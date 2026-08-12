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

# $pr is interpolated into the REST path below. Quoting stops shell injection but not a
# malformed value reshaping the path, so require digits.
[[ $pr =~ ^[0-9]+$ ]] || { echo "pr must be a number, got '$pr'" >&2; exit 64; }

for f in "$findings" "$summary"; do
  [ -r "$f" ] || { echo "cannot read $f" >&2; exit 66; }
done

jq -e 'type == "array"' "$findings" >/dev/null 2>&1 ||
  { echo "$findings must be a JSON array of comment objects" >&2; exit 65; }

# A comment missing any of these is rejected by GitHub with a 422 that takes the whole
# review down with it, so catch it here where the message can name the problem.
jq -e 'all(.[]; has("path") and has("line") and has("body"))' "$findings" >/dev/null 2>&1 ||
  { echo "every comment needs path, line and body" >&2; exit 65; }

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

# Keep stderr out of $response. Folding it in means any stderr chatter on an otherwise
# successful POST breaks the jq parse below — after the review has already been created,
# so a caller that retries on non-zero exit posts the whole review twice.
errfile=$(mktemp)
trap 'rm -f "$errfile"' EXIT

if ! response=$(printf '%s' "$payload" |
  gh api --method POST "repos/{owner}/{repo}/pulls/$pr/reviews" --input - 2>"$errfile"); then
  cat "$errfile" >&2
  case "$(cat "$errfile")" in
    *422*) cat >&2 <<'EOT'

422 usually means a comment is anchored to a line that is not in the diff.
Check each `line` against `gh pr diff <N>`, or move that finding into the summary.
EOT
      ;;
  esac
  exit 1
fi

printf '%s\n' "$response" | jq -r '"Review posted: \(.html_url)"'
