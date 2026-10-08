# Stage 4 — real Victoria II compatibility definition loader

## Purpose

Stage 4 is the first milestone that invokes OpenVic's real compatibility loader against a legitimate local Victoria II installation.

It calls the existing public OpenVic API:

`GameSingleton.load_defines_compatibility_mode(PackedStringArray())`

No loader bypass, parser replacement or Stage-4-specific C++ patch is introduced before observing an actual failure.

## Why CI cannot prove full success

A successful definition load requires the proprietary Victoria II data set. Those files must not be committed, embedded in an artifact or uploaded to CI.

The automated Stage 4 test proves the harness boundary:

1. the verified Godot 4.7.2 threaded runtime initializes;
2. the page is cross-origin isolated;
3. the local folder picker becomes available;
4. the loader cannot start before a valid installation is selected;
5. the export is published directly to GitHub Pages.

The success/failure of the real OpenVic loader is a manual browser test using user-supplied local files.

## Runtime sequence

After a valid folder is selected:

1. the browser validates the expected Victoria II installation structure;
2. Windows executables, DLLs, archives, saves, mods and map cache are excluded from the MEMFS copy;
3. allowed files are copied under `/vic2`;
4. the Stage 4 Godot project starts;
5. `GameSingleton.set_compatibility_mode_roots("/vic2")` is called;
6. `common/defines.lua` is resolved through OpenVic as a preflight;
7. `load_defines_compatibility_mode([])` runs;
8. the page records either `OPENVIC_DEFINITIONS_READY` or `OPENVIC_DEFINITIONS_FAILED`.

The upstream compatibility method includes `GameManager::load_definitions()` and then OpenVic's compatibility asset post-processing. A successful Stage 4 therefore proves at least the complete definition load and its immediate compatibility post-load path.

## Diagnostics

The harness records:

- `ENTRY`;
- logger setup state;
- root acceptance;
- `PREFLIGHT_OK`;
- `LOAD_BEGIN`;
- `LOAD_RETURN` with status and elapsed time;
- final ready/failure marker;
- all Godot/OpenVic stdout and stderr visible to the Web runtime.

If the loader stalls before `LOAD_RETURN`, the captured log becomes the evidence used to decide whether a narrowly scoped diagnostic patch is justified.

## Browser test

Open the deployed GitHub Pages site, select the root folder of a legitimate Victoria II installation and run the loader.

The threaded export enables Godot's official PWA Service Worker with cross-origin isolation headers. On the first visit the page may reload once after the Service Worker is installed. No local server, Python script or batch file is part of the test flow.

The Victoria II files remain local to the browser session.
