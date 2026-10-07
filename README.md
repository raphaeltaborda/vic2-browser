# Victoria II Browser — native Web port

This repository is an experimental **native web port** of a Victoria II-compatible engine.

## Non-negotiable design rule

**No Victoria II game files are hosted or committed here.**

The web client requires the player to supply their own legitimate Victoria II installation locally. Proprietary Paradox files are read in the browser and are not part of the public GitHub repository or GitHub Pages deployment.

## Architecture

```text
Browser
  ├─ HTML / JavaScript loader
  ├─ Godot Web runtime (WebAssembly)
  ├─ OpenVic GDExtension (WebAssembly)
  └─ User-supplied legitimate Victoria II data
       ├─ common/
       ├─ history/
       ├─ map/
       ├─ localisation/
       ├─ events/
       ├─ decisions/
       ├─ gfx/
       └─ other required game data
```

There is **no Wine, BoxedWine, x86 emulation, or Windows executable execution** in the final architecture.

## Upstream engine

The port is based on OpenVic/OpenVic-Simulation, pinned while porting to:

- OpenVic: `d3361890c62ede9464eb41af7f797e87dedf4b28`

OpenVic is intended to faithfully recreate Victoria II: Heart of Darkness and supports loading Victoria II data for legitimate owners.

## Current build milestone

The build job compiles the OpenVic C++ GDExtension as a native WebAssembly side module:

```text
OpenVic C++ -> Emscripten -> libopenvic.web.template_release.wasm32.nothreads.wasm
```

The first browser target is intentionally single-threaded to maximize Brave/Chromium compatibility and avoid making SharedArrayBuffer a prerequisite.

## Copyright boundary

Do **not** commit or deploy:

- `v2game.exe`
- `victoria2.exe`
- Victoria II game directories/assets
- Steam depots
- user-provided ZIPs

Only original port code, build scripts, and redistributable open-source dependencies belong in this repository.
