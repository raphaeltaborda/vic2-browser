# Stage 1 — clean OpenVic WebAssembly build

## Scope

Stage 1 proves one thing only:

> The pinned OpenVic source can be compiled into a genuine wasm32 Godot GDExtension side-module candidate with Emscripten.

It does **not** attempt to start Godot, load Victoria II data, patch parsers, bypass audio, or publish a playable page.

## Input versions

- OpenVic: `d3361890c62ede9464eb41af7f797e87dedf4b28`
- Emscripten: `4.0.20`
- target: `wasm32`
- Godot C++ target: `template_release`
- precision: single
- threads: enabled

## Patch boundary

`patches/openvic/0001-emscripten-side-module.patch` changes only OpenVic's top-level CMake build:

1. Emscripten builds `openvic` as an executable target instead of a desktop shared library.
2. The target is linked with `SIDE_MODULE=1`.
3. The Emscripten output receives an explicit `.wasm` filename.

No simulation or compatibility-loader source file is modified.

## Acceptance criteria

The GitHub Action must:

1. apply the patch with `git apply --check`;
2. configure the pinned source with Emscripten;
3. build the `openvic` target;
4. locate a non-empty `.wasm`;
5. verify the binary starts with the WebAssembly magic bytes `00 61 73 6d`;
6. upload that exact validated artifact.

If compilation exposes a wasm32 portability defect, Stage 1 remains failed until that defect is isolated and introduced as a separate numbered patch with its own rationale.
