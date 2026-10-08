#!/usr/bin/env bash
set -euo pipefail

branch="${1:-main}"
: "${GH_TOKEN:?GH_TOKEN is required}"
: "${GITHUB_API_URL:?GITHUB_API_URL is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

api() {
  curl --fail --silent --show-error --location \
    --proto '=https' --tlsv1.2 --retry 3 --retry-all-errors \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "$1"
}

list_runs() {
  api "$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/actions/workflows/build-openvic-wasm.yml/runs?branch=$branch&per_page=20"
}

pick_run() {
  local response="$1"
  local preferred="${PREFER_STAGE1_SHA:-}"
  if [[ -n "$preferred" ]]; then
    local same
    same="$(jq -r --arg sha "$preferred" '[.workflow_runs[] | select(.head_sha == $sha)][0].id // empty' <<<"$response")"
    if [[ -n "$same" ]]; then
      printf '%s\n' "$same"
      return
    fi
  fi
  jq -r '.workflow_runs[0].id // empty' <<<"$response"
}

response=""
run_id=""
if [[ -n "${PREFER_STAGE1_SHA:-}" ]]; then
  for _ in $(seq 1 6); do
    response="$(list_runs)"
    run_id="$(pick_run "$response")"
    same_sha="$(jq -r --arg id "$run_id" '.workflow_runs[] | select((.id|tostring) == $id) | .head_sha // empty' <<<"$response")"
    [[ "$same_sha" == "$PREFER_STAGE1_SHA" ]] && break
    sleep 5
  done
fi

if [[ -z "$run_id" ]]; then
  response="$(list_runs)"
  run_id="$(pick_run "$response")"
fi

test -n "$run_id"

current="$(api "$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/actions/runs/$run_id")"
head_sha="$(jq -r '.head_sha // empty' <<<"$current")"
test -n "$head_sha"

status=""
conclusion=""
for _ in $(seq 1 120); do
  current="$(api "$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/actions/runs/$run_id")"
  status="$(jq -r '.status' <<<"$current")"
  conclusion="$(jq -r '.conclusion // ""' <<<"$current")"
  echo "Stage 1 run $run_id ($head_sha): status=$status conclusion=${conclusion:-pending}"
  [[ "$status" == "completed" ]] && break
  sleep 15
done

[[ "$status" == "completed" ]]
[[ "$conclusion" == "success" ]]

echo "run_id=$run_id" >> "$GITHUB_OUTPUT"
echo "head_sha=$head_sha" >> "$GITHUB_OUTPUT"
