# Stage 1 — clean OpenVic WebAssembly build

## Scope

Stage 1 proves one thing only:

> The pinned OpenVic source can be compiled into a genuine wasm32 Godot GDExtension side module with Emscripten.

It does **not** start Godot, load Victoria II data, patch compatibility parsers, bypass audio, or publish a playable page.

## Pinned inputs

- OpenVic: `d3361890c62ede9464eb41af7f797e87dedf4b28`
- OpenVic-Simulation: `b7f5feb25b4bc83307489afd5e5d76e50a4915cc`
- OpenVic scripts: `8f83cabf147de7d8a511b4aaefd137777c4eb9c8`
- Emscripten: `4.0.20`
- target: `wasm32`
- Godot C++ target: `template_release`
- precision: single
- threads: enabled

## Patch boundary

Stage 1 has exactly four narrowly scoped portability/integration patches.

### OpenVic target

`patches/openvic/0001-emscripten-side-module.patch`

Changes only the top-level build target so Emscripten emits a dynamic WebAssembly side module with the expected filename.

### Web GDExtension descriptor

`patches/openvic/0002-web-gdextension-library.patch`

Declares the validated release side module using the Godot feature tags `web.wasm32.single.release`. It deliberately does not declare a Web debug library that Stage 1 does not build.

### libc++ ABI namespace

`patches/openvic-scripts/0001-portable-libcpp-abi-namespace.patch`

The pinned memory-code generator hard-codes libc++'s historical `std::__1` ABI namespace. Emscripten 4.0.20 uses a different configured namespace. The patch uses libc++'s own `_LIBCPP_ABI_NAMESPACE` macro instead.

### wasm32 hashing

`patches/openvic-simulation/0001-wasm32-size-t-hashing.patch`

The pinned simulation contains size_t hashing operations that assume a 64-bit `size_t`. wasm32 uses 32-bit `size_t`. The patch keeps the existing 64-bit behavior and supplies defined 32-bit mixing/folding where required.

No compatibility loader, sound system, parser, game rule, or UI source is changed.

## Reproducibility checks

`scripts/apply-portability-patches.sh` refuses to patch if any source checkout is on the wrong revision or is already dirty.

GitHub Actions dependencies are referenced by immutable commit SHA. The artifact records the port commit, source revisions and Emscripten version. Its `bin/openvic/` layout already matches the `res://bin/openvic/` path declared by the GDExtension. The exact patch series and license/notices travel with the artifact, and all checksum manifests use paths relative to the artifact root so they can be verified after extraction.

## Acceptance criteria

The workflow succeeds only if:

1. all source repositories are on the expected revisions;
2. every patch passes `git apply --check`;
3. all patched trees pass `git diff --check`;
4. CMake configures the wasm32 pthread build;
5. the `openvic` target builds;
6. exactly one OpenVic WASM artifact is produced;
7. the artifact begins with `00 61 73 6d`;
8. the module contains the Emscripten `dylink.0` custom section;
9. the module exports `openvic_library_init`;
10. `openvic.gdextension` points `web.wasm32.single.release` at the validated filename;
11. the descriptor and WASM are packaged under `bin/openvic/`, matching the descriptor path;
12. provenance, the exact patch files, third-party notices and the OpenVic license are uploaded with the artifact;
13. all checksum manifests pass `sha256sum -c` from the artifact root before upload.

A new workaround is not an acceptable response to a future failure until that failure is isolated.
