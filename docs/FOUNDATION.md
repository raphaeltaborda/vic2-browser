# Web Port V2 foundation

## Purpose

This branch is a clean migration point from the experimental Web port. The old branch remains the forensic reference for previous experiments; this branch is the implementation base.

## Components accepted into the foundation

### Launcher

`web/openvic-shell.html` is retained because it already provides useful behavior independently from the old C++ patch stack:

- checks the browser runtime before enabling installation selection;
- validates the expected Victoria II installation structure;
- mounts user-selected data locally to `/vic2`;
- does not upload the selected Victoria II files;
- filters executables, DLLs, archives, mods, saves and map cache;
- locks installation input once startup begins;
- exposes bounded runtime diagnostics;
- requires page reload after a partially failed Emscripten/Godot startup.

### Tests

The launcher tests are retained only where they test launcher behavior itself:

- rejects incomplete installation data;
- mounts permitted game data and excludes unwanted files;
- performs no network upload of local game files;
- starts the engine once;
- bounds diagnostic output;
- exposes loader phase text;
- prevents unsafe restart after a failed engine start;
- checks desktop/mobile layout with a stub engine.

Tests that existed solely to assert text inside the old patch scripts were removed.

### Repository boundary

`.gitignore` and `THIRD_PARTY_NOTICES.md` are retained so proprietary Victoria II material remains outside source control and upstream ownership remains explicit.

## Components rejected from the migration

The following are intentionally absent:

- the monolithic `scripts/patch_openvic_web.py`;
- the old `scripts/prepare_openvic_godot_web.py`;
- workflows whose correctness depends on those patch scripts;
- sound-loader bypasses;
- diagnostic C++ mutations whose only purpose was chasing a current stall;
- unverified compatibility workarounds.

This does not mean every old change was technically wrong. Some wasm32 fixes may be necessary. They must be reproduced one by one with a minimal patch and a test that demonstrates the underlying portability issue.

## Last validated upstream/toolchain reference

The previous experimental branch targeted:

- OpenVic: `d3361890c62ede9464eb41af7f797e87dedf4b28`
- Godot: 4.7.2
- Emscripten: 4.0.20
- wasm32
- pthreads / SharedArrayBuffer

These values are reference points, not a promise that the clean rebuild will retain every version unchanged.

## Rule for new compatibility patches

A patch belongs in V2 only when all of the following are true:

1. the failure is reproducible;
2. the failing desktop assumption or Web API boundary is identified;
3. the change is narrowly scoped;
4. desktop behavior remains unchanged unless explicitly required;
5. a test or deterministic diagnostic proves the fix;
6. the patch can be understood without reading an unrelated patch chain.
