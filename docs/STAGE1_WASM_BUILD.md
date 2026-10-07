# Stage 1 — OpenVic WebAssembly build

This stage answers one question only:

> Can the pinned OpenVic revision compile into a real Godot-compatible WebAssembly GDExtension with a minimal, reviewable Web patch?

## Inputs

- OpenVic `d3361890c62ede9464eb41af7f797e87dedf4b28`
- Emscripten `4.0.20`
- Godot C++ target `template_release`
- wasm32, single precision, pthreads

## Patch boundary

`patches/0001-openvic-emscripten-gdextension.patch` currently changes only:

1. the OpenVic target shape required for an Emscripten side module;
2. Emscripten side-module linker flags;
3. Web artifact naming;
4. the two Web library entries in `openvic.gdextension`.

It does not touch simulation code, file IO, parsers, audio, loading, hashes, threading logic or gameplay.

## Success condition

The workflow succeeds only if:

- the patch applies cleanly to the pinned revision;
- CMake configures with Emscripten;
- the `openvic` target builds;
- a non-empty `.wasm` artifact is found;
- its first four bytes are the WebAssembly magic `00 61 73 6d`;
- the patched GDExtension declares the Web library.

A compiler failure is considered useful evidence. No additional compatibility patch should be introduced until the failure identifies the underlying assumption that needs correction.
