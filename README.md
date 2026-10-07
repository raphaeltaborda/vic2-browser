# Victoria II Browser — native Web port

Experimental native browser port of a Victoria II-compatible engine using **OpenVic + Godot Web + WebAssembly**.

## Non-negotiable design rule

**No Victoria II game files are hosted or committed here.**

The web client requires the player to select their own legitimate Victoria II installation locally. Proprietary Paradox files stay in the browser session and are not part of the repository or GitHub Pages deployment.

## Architecture

```text
Browser
  ├─ HTML / JavaScript launcher
  ├─ Godot 4.7.2 Web runtime
  │    ├─ index.wasm
  │    └─ index.side.wasm
  ├─ OpenVic GDExtension
  │    └─ libopenvic.web.template_release.wasm32.threads.wasm
  └─ user-supplied Victoria II data
       └─ mounted locally in Emscripten MEMFS at /vic2
```

There is **no Wine, BoxedWine, x86 emulation, or Windows executable execution** in the final architecture.

## Current status

Working:

- OpenVic C++ builds as a real Emscripten `SIDE_MODULE`.
- The WebAssembly artifact is checked for the `00 61 73 6d` WebAssembly magic header before publication.
- Godot 4.7.2 exports the project with the official Web GDExtension template.
- Automated Chromium smoke testing confirms **Godot Web + OpenVic WASM** load together.
- The runtime has also been manually confirmed to initialize on Android Chromium.
- The launcher validates a legitimate Victoria II folder and mounts its non-executable data under `/vic2`.
- GitHub Pages is published only after the browser smoke test succeeds.

In progress:

- completing the transition from a fully mounted Victoria II data set to the OpenVic game/menu startup path;
- diagnosing compatibility loading at the initial sound/interface phase;
- reducing CI rebuild time for the native Linux editor extension.

## CI pipeline

```text
Build OpenVic Web port
        ↓
validate real WebAssembly artifact
        ↓
Validate Godot Web export
        ↓
headless Chromium smoke test
        ↓
Publish validated native Web export
        ↓
GitHub Pages
```

The heavy OpenVic WebAssembly build is reused by later Web-shell validation runs. The remaining major CI optimization is caching/reusing the Linux editor GDExtension used during Godot import/export.

## Upstream engine

Pinned OpenVic revision:

```text
d3361890c62ede9464eb41af7f797e87dedf4b28
```

Toolchain currently targeted by CI:

- Godot: **4.7.2**
- Emscripten: **4.0.20**
- wasm32
- single precision
- pthreads enabled (8 Emscripten workers / 4 Godot workers)

The browser build requires `SharedArrayBuffer` and cross-origin isolation. The Godot Service Worker provides COOP/COEP on GitHub Pages.

## Local Victoria II data

The launcher checks for an installation structure including:

```text
v2game.exe
common/defines.lua
map/definition.csv
map/provinces.bmp
localisation/
history/
interface/sound.sfx
interface/core.gui
```

`v2game.exe` is used only as an installation marker. Windows executables and DLLs are deliberately **not copied into the Web filesystem and are never executed**.

## Copyright boundary

Do **not** commit or deploy:

- `v2game.exe`
- `victoria2.exe`
- Victoria II game directories/assets
- Steam depots
- user-provided ZIPs

Only original port code, build scripts, and redistributable open-source dependencies belong in this repository.

See `docs/NATIVE_WEB_PORT.md` for implementation details and `THIRD_PARTY_NOTICES.md` for upstream notices.

## Launcher and loading diagnostics

The launcher keeps installation files local, skips mods, saves, map caches and
Windows binaries, and shows only the bytes actually copied to MEMFS. Once loading
starts, changing the installation is disabled. A failed start requires a page
reload because a partially started Godot instance cannot safely be started twice.

The diagnostics panel remains accessible over the game canvas. It retains the
last 500 log lines and understands both `[WebLoad]` and `[WebLoadRaw]` markers.
A 45-second silence notice identifies the last phase; it is not proof of a deadlock.
The in-game 15% value covers the whole compatibility loader, not measured byte progress.

Native artifacts carry a SHA-256 fingerprint of the port patch script. Export
refuses artifacts from different patches, including older artifacts without the
fingerprint. After changing the C++ patches, rebuild **both** native extensions
before exporting. An engine-only smoke test does not prove a full game can load.

Current investigation: the sound/interface diagnostic build at `983633b` compiled
its WASM job but its Linux job was cancelled, so that revision was not published.
The new trace distinguishes sound parser construction from file reading. A real
installation run is still required to identify and verify the 15% stall.
