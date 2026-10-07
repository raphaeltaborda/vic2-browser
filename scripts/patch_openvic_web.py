#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OPENVIC = ROOT / "vendor" / "OpenVic"

cmake = OPENVIC / "CMakeLists.txt"
text = cmake.read_text(encoding="utf-8")

platform_block = '''if(APPLE)
    set(OV_OUTPUT_NAME "openvic.macos.${GODOTCPP_TARGET}")
elseif(CMAKE_SYSTEM_NAME STREQUAL "Windows")
    set(OV_OUTPUT_NAME "openvic.windows.${GODOTCPP_TARGET}.${OV_ARCH}")
    # MinGW defaults to a "lib" dll prefix; the gdextension entries have none.
    set_target_properties(openvic PROPERTIES PREFIX "")
elseif(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    set(OV_OUTPUT_NAME "openvic.linux.${GODOTCPP_TARGET}.${OV_ARCH}")
else()
    message(FATAL_ERROR "Unsupported platform: ${CMAKE_SYSTEM_NAME}")
endif()'''

replacement = '''if(APPLE)
    set(OV_OUTPUT_NAME "openvic.macos.${GODOTCPP_TARGET}")
elseif(CMAKE_SYSTEM_NAME STREQUAL "Windows")
    set(OV_OUTPUT_NAME "openvic.windows.${GODOTCPP_TARGET}.${OV_ARCH}")
    # MinGW defaults to a "lib" dll prefix; the gdextension entries have none.
    set_target_properties(openvic PROPERTIES PREFIX "")
elseif(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    set(OV_OUTPUT_NAME "openvic.linux.${GODOTCPP_TARGET}.${OV_ARCH}")
elseif(CMAKE_SYSTEM_NAME STREQUAL "Emscripten")
    # Godot Web GDExtensions are Emscripten SIDE_MODULEs.
    # This port deliberately starts without pthreads for maximum browser compatibility.
    set(OV_OUTPUT_NAME "openvic.web.${GODOTCPP_TARGET}.wasm32.nothreads")
    set_target_properties(openvic PROPERTIES PREFIX "lib" SUFFIX ".wasm")
else()
    message(FATAL_ERROR "Unsupported platform: ${CMAKE_SYSTEM_NAME}")
endif()'''

if platform_block not in text:
    raise SystemExit("OpenVic CMake platform block changed upstream; refusing blind patch.")

cmake.write_text(text.replace(platform_block, replacement), encoding="utf-8")

gdext = OPENVIC / "game" / "bin" / "openvic.gdextension"
gtext = gdext.read_text(encoding="utf-8")
marker = '[libraries]\n\n'
addition = (
    '[libraries]\n\n'
    'web.wasm32.single.release = "res://bin/openvic/libopenvic.web.template_release.wasm32.nothreads.wasm"\n'
    'web.wasm32.single.debug = "res://bin/openvic/libopenvic.web.template_debug.wasm32.nothreads.wasm"\n'
)
if 'web.wasm32.single.release' not in gtext:
    if marker not in gtext:
        raise SystemExit("OpenVic .gdextension layout changed upstream.")
    gtext = gtext.replace(marker, addition, 1)
    gdext.write_text(gtext, encoding="utf-8")

print("OpenVic patched for wasm32/nothreads.")
