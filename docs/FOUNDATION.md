# Web Port V2 foundation

## Purpose

This branch is the implementation base for the native Web port. The old `main` history remains useful as a forensic record of experiments, but V2 does not inherit an old workaround merely because it once moved startup farther.

## Accepted foundation

### Launcher

`web/openvic-shell.html` provides behavior independent from the C++ compatibility stack:

- validates browser capabilities before enabling startup;
- validates the expected Victoria II installation structure;
- rejects unsafe or ambiguous relative paths before mounting;
- mounts selected data locally to `/vic2`;
- never uploads selected Victoria II files;
- filters executables, DLLs, archives, mods, saves and map cache;
- locks installation input once startup begins;
- bounds diagnostics to avoid unbounded DOM/log growth;
- treats Godot stderr as diagnostic output rather than assuming every warning is fatal;
- requires page reload after a partially failed Emscripten/Godot start.

### Stage 1 WebAssembly port

The first native build milestone is reproducible from pinned revisions and contains four isolated patches:

1. `patches/openvic/0001-emscripten-side-module.patch` — emits the OpenVic GDExtension as an Emscripten side module.
2. `patches/openvic/0002-web-gdextension-library.patch` — declares only the validated release Web library in the GDExtension descriptor.
3. `patches/openvic-scripts/0001-portable-libcpp-abi-namespace.patch` — removes a hard-coded libc++ ABI namespace assumption in generated memory code.
4. `patches/openvic-simulation/0001-wasm32-size-t-hashing.patch` — makes size_t-dependent hashing defined on wasm32 while preserving the existing 64-bit path.

The Stage 1 CI verifies the WASM magic bytes, Emscripten `dylink.0` section, exported `openvic_library_init` symbol, and exact Web descriptor entry.

### Tests

Tests cover:

- incomplete installation rejection;
- case-insensitive recognition of required Victoria II paths;
- invalid and case-colliding path rejection;
- permitted/excluded local data;
- absence of local-file network upload in the startup path;
- single-start behavior;
- diagnostic log bounds;
- stderr versus terminal-error semantics;
- failed-start retry prevention;
- desktop/mobile layout with a stub engine.

## Explicitly rejected legacy behavior

V2 does not contain:

- the monolithic `scripts/patch_openvic_web.py`;
- the old `scripts/prepare_openvic_godot_web.py`;
- sound-loader bypasses;
- parser bypasses introduced only to advance a loading percentage;
- diagnostic mutations mixed into unrelated compatibility fixes;
- unverified gameplay changes.

## Pinned Stage 1 baseline

- OpenVic: `d3361890c62ede9464eb41af7f797e87dedf4b28`
- OpenVic-Simulation: `b7f5feb25b4bc83307489afd5e5d76e50a4915cc`
- OpenVic scripts: `8f83cabf147de7d8a511b4aaefd137777c4eb9c8`
- Godot API target: 4.7
- Emscripten: 4.0.20
- wasm32, single precision, pthreads

## Rule for every new compatibility patch

A patch belongs in V2 only when all of the following are true:

1. the failure is reproducible;
2. the failing desktop assumption or Web API boundary is identified;
3. the change is narrowly scoped;
4. desktop behavior remains unchanged unless explicitly required;
5. a test or deterministic validation proves the fix;
6. the patch can be understood without reading an unrelated patch chain;
7. upstream revisions and build dependencies remain pinned;
8. a successful artifact is validated structurally, not merely by filename or extension.
