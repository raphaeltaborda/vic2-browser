# Victoria II Browser — clean Web port foundation

Experimental native browser port of a Victoria II-compatible engine using **OpenVic + Godot Web + WebAssembly**.

This branch, `web-port-v2`, is the clean foundation for the next iteration of the port. It intentionally carries only components that were already independently useful and testable in the previous implementation.

## Non-negotiable design rule

**No Victoria II game files are hosted or committed here.**

The browser client requires the player to select their own legitimate Victoria II installation locally. Proprietary Paradox files stay inside the browser session and are not part of the repository or deployment.

## Preserved foundation

- Local Victoria II folder selection.
- Installation structure validation before startup.
- Local-only mounting into Emscripten MEMFS under `/vic2`.
- Exclusion of Windows executables, DLLs, archives, saves, mods and map cache from the mounted vanilla data set.
- Godot/OpenVic browser launcher UI.
- Runtime diagnostics panel with bounded logs.
- Desktop/mobile launcher smoke test.
- Unit tests covering local mounting, validation, single-start behavior and failure handling.
- Copyright boundary and third-party notices.

## Intentionally not carried from the old branch

The old monolithic Web patcher and its loader/audio workarounds are not part of this branch.

In particular, `scripts/patch_openvic_web.py`, `scripts/prepare_openvic_godot_web.py`, and build workflows coupled to those scripts were deliberately left behind. Necessary WebAssembly portability changes will be reintroduced as small, auditable patches after they are reproduced and tested.

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

## Next milestone

Rebuild the native Web toolchain cleanly and establish this progression:

```text
select legitimate installation
→ mount /vic2
→ initialize OpenVic
→ load all definitions
→ main menu
→ country selection
→ 1836 map
→ advance one game day
```

No audio workaround or feature bypass should be added merely to move the loading percentage forward. A Web incompatibility should be isolated at the API/assumption that causes it and fixed there.

See `docs/FOUNDATION.md` for the migration boundary.
