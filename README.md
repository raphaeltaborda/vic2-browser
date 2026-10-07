# Victoria II Browser — native Web port

Experimental native WebAssembly port of a Victoria II-compatible engine.

## Architecture

```text
OpenVic C++ / Godot project
        |
        | compile
        v
Godot Web + OpenVic GDExtension
        |
        | WebAssembly
        v
Browser
        |
        | reads user-supplied local files
        v
Legitimate Victoria II data
```

The Victoria II installation is **data input**, not something converted into WebAssembly.

A copy stored in Google Drive can be useful as the user's source/backup copy, but the intended runtime boundary is still local: the browser receives files explicitly selected by the user and OpenVic reads them through the browser filesystem.

There is no Wine, BoxedWine, x86 emulation, or execution of `v2game.exe` in the target architecture.

## Pinned toolchain

- OpenVic: `d3361890c62ede9464eb41af7f797e87dedf4b28`
- Godot: `4.7.2-stable`
- Emscripten: `4.0.11`
- Web target: `wasm32`, single-thread first

The Emscripten version is intentionally aligned with the one used by Godot 4.7.2's own Web build workflow.

## Milestones

1. **WASM extension**
   - Compile the OpenVic GDExtension as a Godot-compatible WebAssembly side module.
   - Produce `libopenvic.web.template_release.wasm32.nothreads.wasm`.
2. **Godot Web export**
   - Export the OpenVic Godot project using the Compatibility renderer and Web GDExtension support.
3. **Local Victoria II data**
   - Validate a legitimate installation selected in the browser.
   - Mount `common/`, `history/`, `map/`, `localisation/`, `events/`, `decisions/`, `gfx/`, and the other required data under the browser filesystem.
4. **First native boot**
   - Start OpenVic with the mounted Victoria II base path and reach the main menu.
5. **Playable campaign**
   - Fix remaining Web-specific renderer, audio, filesystem, memory, and performance issues.

The current CI intentionally stops at milestone 1. The site export will only be re-enabled after the native OpenVic WASM extension builds reproducibly.

## Copyright boundary

No proprietary Victoria II content is committed or deployed.

Do **not** commit:

- `v2game.exe`
- `victoria2.exe`
- Victoria II game directories or assets
- Steam depots
- user-provided archives

Only original port code, build scripts, and redistributable open-source dependencies belong in this repository.
