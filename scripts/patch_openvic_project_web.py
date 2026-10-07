#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OPENVIC = ROOT / "vendor" / "OpenVic"
GAME = OPENVIC / "game"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"{label} changed upstream; refusing blind patch.")
    return text.replace(old, new, 1)


project = GAME / "project.godot"
ptext = project.read_text(encoding="utf-8")
ptext = replace_once(
    ptext,
    'config/features=PackedStringArray("4.7", "Forward Plus")',
    'config/features=PackedStringArray("4.7", "GL Compatibility")',
    "OpenVic project feature list",
)

render_header = "[rendering]\n\n"
render_settings = (
    'renderer/rendering_method="gl_compatibility"\n'
    'renderer/rendering_method.mobile="gl_compatibility"\n'
)
if 'renderer/rendering_method="gl_compatibility"' not in ptext:
    if render_header not in ptext:
        raise SystemExit("OpenVic rendering section changed upstream.")
    ptext = ptext.replace(render_header, render_header + render_settings, 1)

project.write_text(ptext, encoding="utf-8")


window = GAME / "src" / "Autoload" / "WindowOverride.gd"
wtext = window.read_text(encoding="utf-8")
for signature in ("func _init() -> void:\n", "func _ready() -> void:\n"):
    guarded = signature + '\tif OS.has_feature("web"): return\n'
    if guarded not in wtext:
        if signature not in wtext:
            raise SystemExit(f"WindowOverride changed upstream: {signature.strip()}")
        wtext = wtext.replace(signature, guarded, 1)
window.write_text(wtext, encoding="utf-8")


presets = GAME / "export_presets.cfg"
etext = presets.read_text(encoding="utf-8")
if 'Web="Web"' not in etext:
    marker = 'macOS="MacOS"\n'
    if marker not in etext:
        raise SystemExit("OpenVic runnable preset list changed upstream.")
    etext = etext.replace(marker, marker + 'Web="Web"\n', 1)

if 'name="Web"\nplatform="Web"' not in etext:
    etext += r'''

[preset.3]

name="Web"
platform="Web"
runnable=true
advanced_options=false
dedicated_server=false
custom_features=""
export_filter="all_resources"
include_filter="*.txt"
exclude_filter="addons/gdUnit4/*/*, test/*"
export_path="export/Web/index.html"
patches=PackedStringArray()
patch_delta_encoding=false
patch_delta_compression_level_zstd=19
patch_delta_min_reduction=0.1
patch_delta_include_filters="*"
patch_delta_exclude_filters=""
encryption_include_filters=""
encryption_exclude_filters=""
seed=0
encrypt_pck=false
encrypt_directory=false
script_export_mode=2

[preset.3.options]

custom_template/debug=""
custom_template/release=""
variant/extensions_support=true
variant/thread_support=false
vram_texture_compression/for_desktop=true
vram_texture_compression/for_mobile=false
html/export_icon=true
html/custom_html_shell="res://web_shell.html"
html/head_include=""
html/canvas_resize_policy=2
html/focus_canvas_on_start=false
html/experimental_virtual_keyboard=false
progressive_web_app/enabled=false
progressive_web_app/ensure_cross_origin_isolation_headers=false
progressive_web_app/offline_page=""
progressive_web_app/display=1
progressive_web_app/orientation=0
progressive_web_app/icon_144x144=""
progressive_web_app/icon_180x180=""
progressive_web_app/icon_512x512=""
progressive_web_app/background_color=Color(0, 0, 0, 1)
'''

presets.write_text(etext, encoding="utf-8")
print("OpenVic Godot project patched for Web/Compatibility export.")
