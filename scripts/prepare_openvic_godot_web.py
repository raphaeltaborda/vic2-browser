#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OPENVIC = ROOT / "vendor" / "OpenVic"
GAME = OPENVIC / "game"

# Use Godot's Web-compatible renderer.
project = GAME / "project.godot"
text = project.read_text(encoding="utf-8")
text = text.replace(
    'config/features=PackedStringArray("4.7", "Forward Plus")',
    'config/features=PackedStringArray("4.7", "GL Compatibility")'
)
render_header = "[rendering]\n\n"
render_settings = (
    'renderer/rendering_method="gl_compatibility"\n'
    'renderer/rendering_method.mobile="gl_compatibility"\n'
)
if "renderer/rendering_method=" not in text:
    if render_header not in text:
        raise SystemExit("project.godot has no [rendering] section")
    text = text.replace(render_header, render_header + render_settings, 1)
project.write_text(text, encoding="utf-8")

# Desktop window management is not meaningful in a browser and can override
# the canvas sizing policy used by the custom Web shell.
window = GAME / "src/Autoload/WindowOverride.gd"
w = window.read_text(encoding="utf-8")
for function in ("_init", "_ready"):
    needle = f"func {function}() -> void:\n"
    replacement = needle + '\tif OS.has_feature("web"): return\n'
    if replacement not in w:
        if needle not in w:
            raise SystemExit(f"WindowOverride.gd missing {function}")
        w = w.replace(needle, replacement, 1)
window.write_text(w, encoding="utf-8")

# Keep OpenVic's original LoadingScreen Thread on Web. The threaded Godot/Emscripten
# target lets Victoria II compatibility parsing run without freezing browser UI.

# The desktop startup scene is covered by an autoplay .ogv splash while the
# loading screen starts hidden. Browser autoplay/video support can leave that
# layer permanently black, so Web skips the splash and reveals loading UI
# immediately. Native builds keep the upstream startup sequence unchanged.
game_start = GAME / "src/Systems/Startup/GameStart.gd"
gs = game_start.read_text(encoding="utf-8")
ready = "func _ready() -> void:\n"
web_ready = (
    ready
    + '\tif OS.has_feature("web"):\n'
    + '\t\tvar splash := get_node_or_null("SplashContainer")\n'
    + '\t\tif splash != null:\n'
    + '\t\t\tsplash.hide()\n'
    + '\t\t\tsplash.queue_free()\n'
    + '\t\tloading_screen.show()\n'
    + '\t\tprint("[Web] Loading screen visible; preparing Victoria II compatibility path.")\n'
)
if web_ready not in gs:
    if ready not in gs:
        raise SystemExit("GameStart.gd missing _ready")
    gs = gs.replace(ready, web_ready, 1)
game_start.write_text(gs, encoding="utf-8")

# Add coarse browser-side startup markers around the monolithic C++ loader.
gs = game_start.read_text(encoding="utf-8")
load_fn = "func _load_compatibility_mode() -> void:\n"
if '[WebLoad] setting roots' not in gs:
    gs = gs.replace(
        load_fn,
        load_fn + '\tprint("[WebLoad] setting roots")\n',
        1,
    )
    gs = gs.replace(
        '\tCursorManager.initial_cursor_setup()\n',
        '\tprint("[WebLoad] roots ready; cursor/title")\n\tCursorManager.initial_cursor_setup()\n',
        1,
    )
    gs = gs.replace(
        '\tif GameSingleton.load_defines_compatibility_mode(ModSettings.get_load_list()) != OK:\n',
        '\tprint("[WebLoad] entering compatibility definitions")\n\tif GameSingleton.load_defines_compatibility_mode(ModSettings.get_load_list()) != OK:\n',
        1,
    )
    gs = gs.replace(
        '\tSoundSingleton.load_sounds()\n',
        '\tprint("[WebLoad] definitions complete; loading audio")\n\tSoundSingleton.load_sounds()\n',
        1,
    )
    gs = gs.replace(
        '\tMusicManager.add_compat_songs()\n',
        '\tMusicManager.add_compat_songs()\n\tprint("[WebLoad] compatibility load complete")\n',
        1,
    )
game_start.write_text(gs, encoding="utf-8")


# Do not report successful loading or open the menu after invalid data.
gs = game_start.read_text(encoding="utf-8")
if "func _load_compatibility_mode() -> bool:" not in gs:
    replacements = {
        "func _load_compatibility_mode() -> void:": "func _load_compatibility_mode() -> bool:",
        '\t\tpush_error("Errors setting game roots!")':
            '\t\tpush_error("Errors setting game roots!")\n\t\treturn false',
        '\t\tpush_error("Errors loading game defines!")':
            '\t\tpush_error("Errors loading game defines!")\n\t\treturn false',
        '\tprint("[WebLoad] compatibility load complete")':
            '\tprint("[WebLoad] compatibility load complete")\n\treturn true',
        '\t_load_compatibility_mode()\n':
            '\tif not _load_compatibility_mode():\n\t\tpush_error("[WebLoad] Loading failed; menu startup cancelled.")\n\t\treturn\n',
    }
    for old, new in replacements.items():
        if gs.count(old) != 1:
            raise SystemExit(f"GameStart failure-handling anchor changed: {old}")
        gs = gs.replace(old, new, 1)
    game_start.write_text(gs, encoding="utf-8")


# Godot's GL Compatibility/WebGL2 backend does not support GLSL fma() on
# low-end platforms. These two calls are ordinary affine operations, so
# replacing them with multiply+add preserves the intended calculation.
terrain_shader = GAME / "src/Systems/Session/Map/TerrainMap.gdshader"
shader = terrain_shader.read_text(encoding="utf-8")
shader_replacements = {
    "fma(corner, corner_args.half_pixel_size, corner_args.uv)":
        "(corner * corner_args.half_pixel_size + corner_args.uv)",
    "fma(uv, map_size, vec2(0.5))":
        "(uv * map_size + vec2(0.5))",
}
for old, new in shader_replacements.items():
    if old in shader:
        shader = shader.replace(old, new)
    elif new not in shader:
        raise SystemExit(f"TerrainMap.gdshader compatibility anchor changed: {old}")
terrain_shader.write_text(shader, encoding="utf-8")

# Browser canvas sizing/fullscreen are controlled by the HTML shell. Avoid
# desktop-only monitor/fullscreen/VSync operations during startup.
settings = GAME / "src/Autoload/Settings/GameSettings.gd"
g = settings.read_text(encoding="utf-8")
for function in ("_resolution_apply", "_screen_mode_apply", "_monitor_selection_apply", "_refresh_rate_apply"):
    needle = f"func {function}("
    pos = g.find(needle)
    if pos == -1:
        raise SystemExit(f"GameSettings.gd missing {function}")
    body = g.find("\n", pos)
    guard = '\tif OS.has_feature("web"): return\n'
    if g[body + 1:body + 1 + len(guard)] != guard:
        g = g[:body + 1] + guard + g[body + 1:]
settings.write_text(g, encoding="utf-8")

# Add a real Godot Web export preset with GDExtension support and pthreads.
presets = GAME / "export_presets.cfg"
p = presets.read_text(encoding="utf-8")
if 'Web="Web"' not in p:
    anchor = 'macOS="MacOS"\n'
    if anchor not in p:
        raise SystemExit("Could not locate runnable presets block")
    p = p.replace(anchor, anchor + 'Web="Web"\n', 1)

if 'name="Web"\nplatform="Web"' not in p:
    p += r'''

[preset.3]

name="Web"
platform="Web"
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
variant/thread_support=true
vram_texture_compression/for_desktop=true
vram_texture_compression/for_mobile=false
html/export_icon=true
html/custom_html_shell="res://web_shell.html"
html/head_include=""
html/canvas_resize_policy=2
html/focus_canvas_on_start=true
html/experimental_virtual_keyboard=false
progressive_web_app/enabled=true
progressive_web_app/ensure_cross_origin_isolation_headers=true
progressive_web_app/display=3
progressive_web_app/orientation=0
progressive_web_app/icon_144x144=""
progressive_web_app/icon_180x180=""
progressive_web_app/icon_512x512=""
progressive_web_app/background_color=Color(0.05098, 0.06275, 0.07843, 1)
threads/emscripten_pool_size=8
threads/godot_pool_size=4
'''
presets.write_text(p, encoding="utf-8")

shell_src = ROOT / "web" / "openvic-shell.html"
shell_dst = GAME / "web_shell.html"
shell_dst.write_text(shell_src.read_text(encoding="utf-8"), encoding="utf-8")

print("OpenVic Godot project prepared for native Web export.")
