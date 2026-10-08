#!/usr/bin/env bash
set -euo pipefail

: "${GODOT_VERSION:?GODOT_VERSION is required}"
: "${GODOT_TAG:?GODOT_TAG is required}"
: "${GODOT_LINUX_SHA256:?GODOT_LINUX_SHA256 is required}"
: "${GODOT_TEMPLATES_SHA256:?GODOT_TEMPLATES_SHA256 is required}"
: "${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
: "${GITHUB_ENV:?GITHUB_ENV is required}"

rm -rf build/godot build/godot-templates
mkdir -p build/godot build/godot-templates

editor_zip="build/Godot_v${GODOT_TAG}_linux.x86_64.zip"
templates_tpz="build/Godot_v${GODOT_TAG}_export_templates.tpz"
release_base="https://github.com/godotengine/godot/releases/download/${GODOT_TAG}"

curl --fail --silent --show-error --location --retry 3 --retry-all-errors \
  --proto '=https' --tlsv1.2 \
  -o "$editor_zip" "$release_base/Godot_v${GODOT_TAG}_linux.x86_64.zip"
echo "${GODOT_LINUX_SHA256}  $editor_zip" | sha256sum -c -

curl --fail --silent --show-error --location --retry 3 --retry-all-errors \
  --proto '=https' --tlsv1.2 \
  -o "$templates_tpz" "$release_base/Godot_v${GODOT_TAG}_export_templates.tpz"
echo "${GODOT_TEMPLATES_SHA256}  $templates_tpz" | sha256sum -c -

unzip -q "$editor_zip" -d build/godot
mapfile -t editors < <(find build/godot -maxdepth 1 -type f -name 'Godot_v*-stable_linux.x86_64' -print)
[[ "${#editors[@]}" -eq 1 ]]
godot="${editors[0]}"
chmod +x "$godot"

version="$("$godot" --version)"
case "$version" in
  "${GODOT_VERSION}.stable."*) ;;
  *)
    echo "Unexpected Godot version: $version" >&2
    exit 1
    ;;
esac

unzip -q "$templates_tpz" 'templates/web*' -d build/godot-templates
template_dir="$HOME/.local/share/godot/export_templates/${GODOT_VERSION}.stable"
rm -rf "$template_dir"
mkdir -p "$template_dir"
cp -a build/godot-templates/templates/web* "$template_dir/"

printf 'GODOT=%s/%s\n' "$GITHUB_WORKSPACE" "$godot" >> "$GITHUB_ENV"
echo "Godot verified: $version"
