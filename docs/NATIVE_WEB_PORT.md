# Native Web Port Architecture

## Goal

Run a Victoria II-compatible engine natively in a modern browser without Wine,
BoxedWine, x86 emulation, or execution of `v2game.exe`.

The selected Victoria II installation is treated only as a local data source.

## Runtime pipeline

```text
GitHub Pages
  |
  +-- Godot 4.7.2 Web runtime
  |     +-- index.wasm
  |     +-- index.side.wasm
  |
  +-- OpenVic GDExtension
  |     +-- libopenvic.web.template_release.wasm32.nothreads.wasm
  |
  +-- browser-local Victoria II installation
        +-- copied to Emscripten MEMFS at /vic2
        +-- passed to OpenVic as --base-path=/vic2
```

## Proprietary-data boundary

The public build must never contain Victoria II assets or executables.

The launcher requires the user to select a local installation and checks for
the expected installation structure, including `v2game.exe`. The Windows
executables and DLLs are deliberately not copied into MEMFS because the native
port does not execute them.

## OpenVic pin

The port currently targets:

```text
OpenVic d3361890c62ede9464eb41af7f797e87dedf4b28
```

Builds clone that exact commit, apply the patches in `scripts/`, and compile
the GDExtension with Emscripten.

## Web-specific port work

- Added an Emscripten platform output to OpenVic's CMake build.
- Added Godot Web GDExtension feature tags.
- Compiled as wasm32, single precision, no pthreads.
- Replaced simulation thread-pool execution with deterministic serial execution
  for the no-threads browser target.
- Replaced the Godot loading-screen worker Thread with synchronous Web startup.
- Disabled desktop-only window/monitor/fullscreen operations on Web.
- Switched the project to Godot's GL Compatibility renderer for WebGL.
- Added a custom HTML launcher that initializes OpenVic WASM before accepting
  a local Victoria II installation.
- Mounted user data directly into Emscripten MEMFS instead of uploading it.

## Why single-thread first

A pthread WebAssembly build requires SharedArrayBuffer and cross-origin
isolation. The first target deliberately avoids this dependency so it works on
more browsers, including Brave, and so GitHub Pages does not need a COOP/COEP
service-worker workaround.

Multithreading can be added later as a performance feature without changing
the data model or gameplay logic.

## Mods

Mod support is intentionally deferred. OpenVic compatibility mode already has
a concept of mod load lists. Once the base game works in the browser, the local
loader can mount mod folders beside `/vic2` and pass the corresponding
`--mod` arguments.
