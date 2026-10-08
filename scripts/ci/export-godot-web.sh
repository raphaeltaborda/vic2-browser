#!/usr/bin/env bash
set -euo pipefail

project="${1:?project directory is required}"
output="${2:?output directory is required}"
html_marker="${3:-}"

: "${GODOT:?GODOT is required}"
test -s "$project/project.godot"
test -s "$project/export_presets.cfg"

"$GODOT" --headless --editor --path "$project" --quit-after 2

rm -rf "$output"
mkdir -p "$output"
output_abs="$(cd "$output" && pwd)"
"$GODOT" --headless --path "$project" --export-release Web "$output_abs/index.html"

for file in index.html index.js index.wasm index.pck; do
  test -s "$output/$file"
done

mapfile -t openvic_modules < <(find "$output" -type f -name 'libopenvic*.wasm' -print)
if [[ "${#openvic_modules[@]}" -ne 1 ]]; then
  printf 'Expected exactly one exported OpenVic side module, found %s\n' "${#openvic_modules[@]}" >&2
  printf '%s\n' "${openvic_modules[@]}" >&2
  exit 1
fi

if [[ -n "$html_marker" ]]; then
  grep -Fq "$html_marker" "$output/index.html"
fi

if find "$output" -type f \( -iname 'v2game.exe' -o -iname '*.v2' \) -print -quit | grep -q .; then
  echo "Proprietary Victoria II runtime data leaked into Web export" >&2
  exit 1
fi

find "$output" -maxdepth 3 -type f -print | sort
