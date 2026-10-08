# Web Port V2 foundation

## Purpose

`main` is the implementation base for the native Web port. Pre-V2 commits remain available in repository history as a forensic record of experiments, but the current tree does not inherit an old workaround merely because it once moved startup farther.

## Accepted foundation

### Production Web shell

`stage4/stage4-shell.html` is the single user-facing launcher and the exact shell deployed to GitHub Pages. It:

- validates the expected Victoria II installation structure before startup;
- rejects unsafe, duplicate and case-colliding relative paths;
- mounts only permitted local files under `/vic2`;
- never uploads selected Victoria II files;
- excludes executables, DLLs, archives, mods, saves and map cache from MEMFS;
- keeps diagnostics bounded and records both the Web deploy SHA and Stage 1 WASM provenance;
- updates the official Godot Service Worker without HTTP cache reuse and verifies cross-origin isolation;
- treats Godot stderr as diagnostic output while rejected JS/WASM startup promises are terminal;
- allows a single start per page because a partially failed Emscripten instance is not safely reusable.

The obsolete pre-Stage-4 launcher was removed so tests cannot pass against code that is not deployed.

### Stage 1 WebAssembly port

The first native build milestone is reproducible from pinned revisions and contains five isolated patches:

1. `patches/openvic/0001-emscripten-side-module.patch` — emits the OpenVic GDExtension as an Emscripten side module.
2. `patches/openvic/0002-web-gdextension-library.patch` — declares only the validated release Web library in the GDExtension descriptor.
3. `patches/openvic-scripts/0001-portable-libcpp-abi-namespace.patch` — removes a hard-coded libc++ ABI namespace assumption in generated memory code.
4. `patches/openvic-simulation/0001-wasm32-size-t-hashing.patch` — makes size_t-dependent hashing defined on wasm32 while preserving the existing 64-bit path.
5. `patches/openvic-dataloader/0001-emscripten-owned-file-buffer.patch` — after the Stage 4 real-data test reproduced an abort on the first interface parser input, keeps native `lexy::read_file` unchanged but uses an owned `fread` buffer on Emscripten to avoid the POSIX mmap path over browser MEMFS.

The Stage 1 CI verifies the WASM magic bytes, Emscripten `dylink.0` section, exported `openvic_library_init` symbol, and exact Web descriptor entry.

### Stage 2 Godot Web integration

The second milestone uses the validated Stage 1 artifact without rebuilding OpenVic. It installs checksum-verified official Godot 4.7.2 editor/export templates, exports a minimal threaded Web project and verifies in Chromium that:

1. the page is cross-origin isolated;
2. the OpenVic side-module WASM is requested;
3. Godot reports the GDExtension as loaded;
4. OpenVic's scene initializer registers the `OVGame` singleton.

Stage 2 intentionally contains no Victoria II data path or compatibility loading.

### Stage 3 filesystem boundary

The third milestone mounts an original synthetic fixture into Emscripten MEMFS at `/vic2` before Godot starts, then verifies through the native OpenVic `GameSingleton`/Dataloader boundary that:

1. `/vic2` is accepted as the compatibility-mode root;
2. two known files are resolved by OpenVic's C++ filesystem lookup;
3. the resolved bytes match their fixture sentinels;
4. a deliberately missing file remains unresolved.

Stage 3 does not invoke the definition loader. Its purpose is to prove that the browser-mounted filesystem and OpenVic's `std::filesystem` view are coherent before parser work begins.

### Shared CI infrastructure

Stages 2–4 use the same versioned CI helpers for Stage 1 artifact resolution/verification, Godot installation and Web export. Browser smoke tests share one local HTTP/COOP/COEP harness. This keeps artifact provenance and Web-runtime assumptions identical across milestones.

Stage 1 packaging is also scripted: the repository audit owns the exact patch allowlist, while packaging automatically copies and hashes that audited patch set.

### Tests

Tests exercise the deployed Stage 4 shell and cover:

- incomplete installation rejection;
- case-insensitive recognition of required Victoria II paths;
- invalid and case-colliding path rejection;
- permitted/excluded local data;
- single-start behavior and terminal startup rejection;
- diagnostic log bounds and build provenance;
- desktop/mobile layout and safe waiting state with a stub engine;
- Stage 2 GDExtension initialization, Stage 3 MEMFS/native filesystem coherence, and the Stage 4 public Pages runtime.

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
- OpenVic-Dataloader: `b40b95636eb39cc0a55e9a0ef7575be90c21858e`
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
