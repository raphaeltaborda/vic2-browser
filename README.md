# Victoria II Browser — clean Web port foundation

Experimental native browser port of a Victoria II-compatible engine using **OpenVic + Godot Web + WebAssembly**.

The `web-port-v2` branch is the clean implementation base. Compatibility work is introduced only as isolated, reproducible patches with a demonstrated failure behind each change.

## Non-negotiable design rule

**No Victoria II game files are hosted or committed here.**

The browser client requires the player to select their own legitimate Victoria II installation locally. Proprietary Paradox files stay inside the browser session and are not part of the repository or deployment.

## Validated foundation

- Local Victoria II folder selection and structure validation.
- Local-only mounting into Emscripten MEMFS under `/vic2`.
- Exclusion of executables, DLLs, archives, saves, mods and map cache from the vanilla mount.
- Path-safety and duplicate-path validation before startup.
- Godot/OpenVic launcher UI with bounded diagnostics.
- Desktop/mobile browser smoke tests and behavioral unit tests.
- Reproducible OpenVic wasm32 build from pinned revisions.
- Separate patches for the Emscripten side-module target, Web GDExtension descriptor, libc++ ABI namespace portability and 32-bit hashing.
- Stage 1 artifact validation for WebAssembly magic, Emscripten `dylink.0`, the `openvic_library_init` entry symbol, and the exact Web library declaration in `openvic.gdextension`.
- GitHub Actions dependencies pinned to immutable commit SHAs.
- Stage 1 artifact layout mirrors `res://bin/openvic/` and includes provenance, the exact patch series, self-verifying checksums and license/notices.

## Architecture target

```text
Browser
  ├─ HTML / JavaScript launcher
  ├─ Godot Web runtime
  ├─ OpenVic GDExtension compiled to WebAssembly
  └─ user-supplied Victoria II data
       └─ mounted locally at /vic2
```

There is no Wine, BoxedWine, x86 emulation, or execution of `v2game.exe` in the target architecture.

## Milestones

```text
[done] clean launcher foundation
[done] reproducible OpenVic wasm32 side module
[next] minimal Godot Web export loading the validated GDExtension
       ↓
mount /vic2
       ↓
load all definitions
       ↓
main menu
       ↓
country selection
       ↓
1836 map
       ↓
advance one game day
```

No subsystem should be disabled merely to move startup forward. A Web incompatibility must be isolated at the API or platform assumption that causes it and fixed at that boundary.

See `docs/FOUNDATION.md` for engineering rules and `docs/BUILD_STAGE_1.md` for the validated WASM build.
