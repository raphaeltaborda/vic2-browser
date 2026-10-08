# Stage 3 — OpenVic filesystem boundary

## Purpose

Stage 3 proves one new boundary only:

> Files copied by the browser into Emscripten MEMFS under `/vic2` are visible to OpenVic's native C++ `Dataloader`, can be resolved through `GameSingleton.lookup_file_path`, and the resolved bytes remain readable by the Godot runtime.

It deliberately does **not** call `load_defines_compatibility_mode()` or `GameManager::load_definitions()`.

## Synthetic fixture

CI must not contain Victoria II data. The custom Stage 3 HTML shell therefore creates three original test files in MEMFS after the Godot runtime is initialized and before the project starts:

- `/vic2/v2game.exe` — a six-byte synthetic marker, not an executable;
- `/vic2/common/defines.lua` — original fixture text containing `STAGE3_DEFINES_SENTINEL`;
- `/vic2/map/definition.csv` — original fixture text containing `STAGE3_MAP_SENTINEL`.

No Paradox content is present in the fixture.

## OpenVic proof

The GDScript smoke scene:

1. obtains the registered `GameSingleton`;
2. calls `set_compatibility_mode_roots("/vic2")`;
3. requires OpenVic to resolve `common/defines.lua`;
4. requires OpenVic to resolve `map/definition.csv`;
5. opens each OpenVic-resolved absolute path and checks its sentinel bytes;
6. requires a deliberately nonexistent lookup to return an empty path.

The crucial filesystem checks inside OpenVic use `std::filesystem::is_directory` and `std::filesystem::is_regular_file`, so this stage crosses from the JavaScript/Emscripten mount into the native C++ dataloader.

## Browser proof

Chromium additionally requires:

- cross-origin isolation for the threaded runtime;
- successful synthetic fixture mount before Godot project startup;
- an actual request for the OpenVic side module;
- two `LOOKUP_OK` markers;
- two `READ_OK` markers;
- the negative lookup marker;
- the final `OPENVIC_FILESYSTEM_READY` marker;
- no browser page errors.

## Non-goals

Stage 3 does not parse Victoria II data. Parser behavior and the full definition loader belong to Stage 4.

A Stage 3 failure must be diagnosed at the filesystem, root selection, dynamic-linking or browser-mount boundary before any parser workaround is considered.
