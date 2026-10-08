# Stage 2 — minimal Godot Web GDExtension smoke test

## Purpose

Stage 2 proves one boundary only:

> An official Godot 4.7.2 threaded Web export can download and initialize the validated OpenVic Stage 1 WebAssembly GDExtension in Chromium.

Victoria II data is intentionally absent. There is no `/vic2` mount, compatibility parsing, audio bootstrap, main menu, map loading or gameplay in this stage.

## Inputs

- the latest successful `openvic-wasm-stage1` artifact from `main`;
- official Godot 4.7.2 Linux editor;
- official Godot 4.7.2 export templates;
- Chromium on the GitHub-hosted Ubuntu runner.

The two Godot downloads are checked against SHA-256 digests published with the 4.7.2 release.

## Minimal project

`stage2/` contains only:

- `project.godot`;
- `Main.tscn`;
- `Main.gd`;
- `export_presets.cfg`;
- `bin/openvic/` populated by CI from the validated Stage 1 artifact.

The Web preset enables both:

- `variant/extensions_support=true`;
- `variant/thread_support=true`.

## Runtime proof

The Stage 2 scene explicitly asks `GDExtensionManager` to load:

`res://bin/openvic/openvic.gdextension`

It then requires:

1. `GDExtensionManager.is_extension_loaded(...)` to be true;
2. `Engine.has_singleton("OVGame")` to be true.

The second check proves that OpenVic's scene-level initializer ran and registered one of its native singletons.

The Chromium smoke test independently requires:

1. `crossOriginIsolated === true`;
2. a network request for `libopenvic.web.template_release.wasm32.threads.wasm`;
3. the `[Stage2] OPENVIC_GDEXTENSION_READY` console marker;
4. no browser page errors.

## Server boundary

The test server supplies the headers required by threaded WebAssembly:

- `Cross-Origin-Opener-Policy: same-origin`;
- `Cross-Origin-Embedder-Policy: require-corp`;
- `Cross-Origin-Resource-Policy: same-origin`.

## Non-goals

A failure here must not be worked around by changing Victoria II loading code, because no Victoria II files are involved. Stage 2 failures belong to one of four boundaries:

- Godot Web export configuration;
- Web GDExtension descriptor/packaging;
- Emscripten dynamic linking/thread compatibility;
- OpenVic initialization before game-data loading.
