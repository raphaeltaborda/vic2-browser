# vic2-browser

Private browser-based Victoria II experiment.

## Goal

Run a legitimate personal copy of Victoria II from private cloud storage in a modern web browser, without requiring Victoria II to be installed on the computer being used.

## Current direction

The project will first try to run the original Windows game through a WebAssembly compatibility layer (BoxedWine/Wine) rather than reimplementing the Clausewitz engine.

Planned flow:

```text
Browser
  ↓
vic2-browser frontend
  ↓
BoxedWine / WebAssembly
  ↓
Private cloud game image
  ↓
Victoria II.exe
```

Game files and other proprietary Victoria II assets must not be committed to this public repository.

## Milestones

1. Boot a simple Windows executable in BoxedWine/WebAssembly.
2. Prepare private cloud storage for the owner's Victoria II installation.
3. Load the private game image from the browser.
4. Launch Victoria II.
5. Add persistent saves and browser-side caching.
6. Improve loading time, fullscreen, audio and input.

## Status

Early proof of concept.
