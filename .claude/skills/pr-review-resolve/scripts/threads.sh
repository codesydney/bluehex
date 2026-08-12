#!/usr/bin/env bash
#
# Read and close out PR review threads.
#
#   threads.sh list <pr-number> [--all]   unresolved threads (--all includes resolved)
#   threads.sh reply <thread-id> <body>   reply to a thread
#   threads.sh resolve <thread-id>        mark a thread resolved
#   threads.sh unresolve <thread-id>      reopen a thread
#
# Resolving is GraphQL-only; there is no REST equivalent. Thread ids come from `list`
# and are not the same as comment ids.

set -euo pipefail

usage() { sed -n '2,12p' "$0" | sed 's/^# \?//'; exit 64; }
[ $# -ge 1 ] || usage

repo_owner() { gh repo view --json owner --jq '.owner.login'; }
repo_name() { gh repo view --json name --jq '.name'; }

case $1 in
  list)
    [ $# -ge 2 ] || usage
    pr=$2
    [[ $pr =~ ^[0-9]+$ ]] || { echo "pr must be a number, got '$pr'" >&2; exit 64; }
    filter='map(select(.isResolved | not))'
    [ "${3:-}" = "--all" ] && filter='.'

    # Assign on their own lines. Inside an argument list a failed command substitution
    # does not trip `set -e`, so a gh auth failure would sail through as owner="".
    owner=$(repo_owner)
    repo=$(repo_name)
    [ -n "$owner" ] && [ -n "$repo" ] ||
      { echo "could not determine the repo — is gh authenticated, with a remote set?" >&2; exit 69; }

    response=$(gh api graphql -f owner="$owner" -f repo="$repo" -F pr="$pr" -f query='
      query($owner:String!, $repo:String!, $pr:Int!) {
        repository(owner:$owner, name:$repo) {
          pullRequest(number:$pr) {
            reviewThreads(first:100) {
              pageInfo { hasNextPage }
              nodes {
                id isResolved isOutdated path line
                comments(first:20) { nodes { author { login } body } }
              }
            }
          }
        }
      }')

    # Truncation has to be loud. The skill tells you to reply to every thread, and a
    # thread this never printed is one you will never reply to.
    [ "$(printf '%s' "$response" |
        jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.hasNextPage')" = "true" ] &&
      echo "WARNING: more than 100 threads on this PR — output is truncated." >&2

    printf '%s' "$response" |
      jq -r ".data.repository.pullRequest.reviewThreads.nodes | $filter" |
      jq -r '.[] |
        "── \(.path):\(.line // "?")\(if .isOutdated then "  [outdated]" else "" end)
   id: \(.id)
\(.comments.nodes | map("   @\(.author.login): \(.body | gsub("\n"; "\n   "))") | join("\n"))
"'
    ;;

  reply)
    [ $# -ge 3 ] || usage
    gh api graphql -f threadId="$2" -f body="$3" -f query='
      mutation($threadId:ID!, $body:String!) {
        addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$threadId, body:$body}) {
          comment { url }
        }
      }' --jq '.data.addPullRequestReviewThreadReply.comment.url'
    ;;

  resolve|unresolve)
    [ $# -ge 2 ] || usage
    mutation=resolveReviewThread
    [ "$1" = "unresolve" ] && mutation=unresolveReviewThread

    gh api graphql -f threadId="$2" -f query="
      mutation(\$threadId:ID!) {
        $mutation(input:{threadId:\$threadId}) {
          thread { id isResolved }
        }
      }" --jq ".data.$mutation.thread | \"\(.id) resolved=\(.isResolved)\""
    ;;

  *) usage ;;
esac
