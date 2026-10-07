#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OPENVIC = ROOT / "vendor" / "OpenVic"

cmake = OPENVIC / "CMakeLists.txt"
text = cmake.read_text(encoding="utf-8")

# CMake's Emscripten platform intentionally reports no traditional shared
# libraries. For Web we therefore avoid add_library(... SHARED) entirely and
# create an Emscripten link target that emits a SIDE_MODULE .wasm directly.


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
    # The browser target uses pthreads so Victoria II parsing runs off the UI thread.
    set(OV_OUTPUT_NAME "libopenvic.web.${GODOTCPP_TARGET}.wasm32.threads")
    set_target_properties(openvic PROPERTIES SUFFIX ".wasm")
else()
    message(FATAL_ERROR "Unsupported platform: ${CMAKE_SYSTEM_NAME}")
endif()'''

if platform_block not in text:
    raise SystemExit("OpenVic CMake platform block changed upstream; refusing blind patch.")

target_line = "add_library(openvic SHARED ${openvic_sources})\n"
target_replacement = """if(CMAKE_SYSTEM_NAME STREQUAL "Emscripten")
    add_executable(openvic ${openvic_sources})
    target_link_options(
        openvic
        PRIVATE
            -sSIDE_MODULE=1
            -sWASM_BIGINT
            -sSUPPORT_LONGJMP=wasm
            -pthread
            -fvisibility=hidden
            -shared
    )
else()
    add_library(openvic SHARED ${openvic_sources})
endif()
"""
if "add_executable(openvic ${openvic_sources})" not in text:
    if target_line not in text:
        raise SystemExit("OpenVic add_library() layout changed upstream.")
    text = text.replace(target_line, target_replacement, 1)


cmake.write_text(text.replace(platform_block, replacement), encoding="utf-8")

gdext = OPENVIC / "game" / "bin" / "openvic.gdextension"
gtext = gdext.read_text(encoding="utf-8")
marker = '[libraries]\n\n'
addition = (
    '[libraries]\n\n'
    'web.wasm32.single.release = "res://bin/openvic/libopenvic.web.template_release.wasm32.threads.wasm"\n'
    'web.wasm32.single.debug = "res://bin/openvic/libopenvic.web.template_debug.wasm32.threads.wasm"\n'
)
if 'web.wasm32.single.release' not in gtext:
    if marker not in gtext:
        raise SystemExit("OpenVic .gdextension layout changed upstream.")
    gtext = gtext.replace(marker, addition, 1)
    gdext.write_text(gtext, encoding="utf-8")

print("OpenVic patched for wasm32/threads.")


# ---------------------------------------------------------------------------
# WebAssembly fallback patches
# ---------------------------------------------------------------------------
# Keep the serial fallback available for a future no-pthreads Web build, while
# allowing the primary pthread build to use OpenVic's normal worker pools.

sim = OPENVIC / "extension" / "deps" / "openvic-simulation"

# Add lightweight phase markers to the Victoria II compatibility loader so the
# browser can expose the exact stage being processed instead of sitting at 15%.
dataloader_cpp = sim / "src/openvic-simulation/dataloader/Dataloader.cpp"
dl = dataloader_cpp.read_text(encoding="utf-8")
markers = [
    ('\tbool ret = true;\n\n\tif (!_load_sound_effect_defines(definition_manager)) {',
     '\tbool ret = true;\n\n\tSPDLOG_INFO("[WebLoad] sound/interface/bootstrap");\n\tif (!_load_sound_effect_defines(definition_manager)) {'),
    ('\tif (!definition_manager.get_define_manager().load_defines_file(',
     '\tSPDLOG_INFO("[WebLoad] common/defines.lua");\n\tif (!definition_manager.get_define_manager().load_defines_file('),
    ('\tif (!_load_goods(definition_manager)) {',
     '\tSPDLOG_INFO("[WebLoad] goods/cultures/politics");\n\tif (!_load_goods(definition_manager)) {'),
    ('\tif (!_load_map_dir(definition_manager)) {',
     '\tSPDLOG_INFO("[WebLoad] map + provinces");\n\tif (!_load_map_dir(definition_manager)) {'),
    ('\tif (!_load_units(definition_manager)) {',
     '\tSPDLOG_INFO("[WebLoad] units/rebels/technology");\n\tif (!_load_units(definition_manager)) {'),
    ('\tif (!_load_history(definition_manager, false)) {',
     '\tSPDLOG_INFO("[WebLoad] history/events");\n\tif (!_load_history(definition_manager, false)) {'),
    ('\tret &= parse_scripts(definition_manager);\n\n\tfree_cache();\n\n\treturn ret;',
     '\tret &= parse_scripts(definition_manager);\n\n\tfree_cache();\n\n\tSPDLOG_INFO("[WebLoad] definitions parsed");\n\treturn ret;'),
]
for old, new in markers:
    if new in dl:
        continue
    if old not in dl:
        raise SystemExit(f"Dataloader diagnostic anchor changed: {old[:60]}")
    dl = dl.replace(old, new, 1)
dataloader_cpp.write_text(dl, encoding="utf-8")

# OpenVic's pinned hash helpers assume a 64-bit size_t. wasm32 uses a 32-bit
# size_t, where shifts by 32/33 are invalid and the 64-bit FNV constants are
# truncated. Keep the desktop behavior unchanged and select proper 32-bit
# mixing when compiling the same source for WebAssembly.
hash_hpp = sim / "src/openvic-simulation/core/Hash.hpp"
hash_text = hash_hpp.read_text(encoding="utf-8")
hash_old = """\tinline constexpr std::size_t hash_murmur3(std::size_t key, std::size_t seed = MURMUR3_SEED) {
\t\tkey ^= seed;
\t\tkey ^= key >> 33;
\t\tkey *= 0xff51afd7ed558ccd;
\t\tkey ^= key >> 33;
\t\tkey *= 0xc4ceb9fe1a85ec53;
\t\tkey ^= key >> 33;
\t\treturn key;
\t}"""
hash_new = """\tinline constexpr std::size_t hash_murmur3(std::size_t key, std::size_t seed = MURMUR3_SEED) {
\t\tif constexpr (sizeof(std::size_t) >= 8) {
\t\t\tstd::uint64_t value = static_cast<std::uint64_t>(key ^ seed);
\t\t\tvalue ^= value >> 33;
\t\t\tvalue *= UINT64_C(0xff51afd7ed558ccd);
\t\t\tvalue ^= value >> 33;
\t\t\tvalue *= UINT64_C(0xc4ceb9fe1a85ec53);
\t\t\tvalue ^= value >> 33;
\t\t\treturn static_cast<std::size_t>(value);
\t\t} else {
\t\t\t// MurmurHash3 fmix32 for wasm32/other 32-bit size_t targets.
\t\t\tstd::uint32_t value = static_cast<std::uint32_t>(key ^ seed);
\t\t\tvalue ^= value >> 16;
\t\t\tvalue *= UINT32_C(0x85ebca6b);
\t\t\tvalue ^= value >> 13;
\t\t\tvalue *= UINT32_C(0xc2b2ae35);
\t\t\tvalue ^= value >> 16;
\t\t\treturn static_cast<std::size_t>(value);
\t\t}
\t}"""
if hash_old not in hash_text:
    raise SystemExit("Pinned Hash.hpp Murmur finalizer changed; refusing blind patch.")
hash_text = hash_text.replace("#include <cstddef>\n", "#include <cstddef>\n#include <cstdint>\n", 1)
hash_hpp.write_text(hash_text.replace(hash_old, hash_new, 1), encoding="utf-8")

ordered_hpp = sim / "src/openvic-simulation/types/OrderedContainers.hpp"
ordered_text = ordered_hpp.read_text(encoding="utf-8")
fnv_old = """\t\t[[nodiscard]] static constexpr size_t _hash_bytes_case_insensitive(char const* first, size_t count) {
\t\t\tconstexpr size_t _offset_basis = 14695981039346656037ULL;
\t\t\tconstexpr size_t _prime = 1099511628211ULL;
\t\t\tsize_t hash = _offset_basis;
\t\t\tfor (size_t i = 0; i < count; ++i) {
\t\t\t\thash ^= static_cast<size_t>(std::tolower(static_cast<unsigned char>(first[i])));
\t\t\t\thash *= _prime;
\t\t\t}
\t\t\treturn hash;
\t\t}"""
fnv_new = """\t\t[[nodiscard]] static constexpr size_t _hash_bytes_case_insensitive(char const* first, size_t count) {
\t\t\tsize_t hash;
\t\t\tsize_t prime;
\t\t\tif constexpr (sizeof(size_t) >= 8) {
\t\t\t\thash = static_cast<size_t>(14695981039346656037ULL);
\t\t\t\tprime = static_cast<size_t>(1099511628211ULL);
\t\t\t} else {
\t\t\t\thash = static_cast<size_t>(2166136261U);
\t\t\t\tprime = static_cast<size_t>(16777619U);
\t\t\t}
\t\t\tfor (size_t i = 0; i < count; ++i) {
\t\t\t\thash ^= static_cast<size_t>(std::tolower(static_cast<unsigned char>(first[i])));
\t\t\t\thash *= prime;
\t\t\t}
\t\t\treturn hash;
\t\t}"""
if fnv_old not in ordered_text:
    raise SystemExit("Pinned OrderedContainers.hpp FNV hash changed; refusing blind patch.")
ordered_hpp.write_text(ordered_text.replace(fnv_old, fnv_new, 1), encoding="utf-8")

point_hpp = sim / "src/openvic-simulation/pathfinding/PointMap.hpp"
point_text = point_hpp.read_text(encoding="utf-8")
segment_old = """\t\tstruct SegmentHash {
\t\t\tinline constexpr std::size_t operator()(Segment const& segment) const {
\t\t\t\treturn hash_murmur3(hash_murmur3(segment.key.first) << 32) |
\t\t\t\t\thash_murmur3(segment.key.second);
\t\t\t}
\t\t};"""
segment_new = """\t\tstruct SegmentHash {
\t\t\tinline constexpr std::size_t operator()(Segment const& segment) const {
\t\t\t\tif constexpr (sizeof(std::size_t) >= 8) {
\t\t\t\t\tstd::uint64_t high = static_cast<std::uint64_t>(
\t\t\t\t\t\thash_murmur3(static_cast<std::size_t>(segment.key.first))
\t\t\t\t\t);
\t\t\t\t\treturn hash_murmur3(static_cast<std::size_t>(high << 32)) |
\t\t\t\t\t\thash_murmur3(static_cast<std::size_t>(segment.key.second));
\t\t\t\t} else {
\t\t\t\t\tconst std::uint64_t first = segment.key.first;
\t\t\t\t\tconst std::uint64_t second = segment.key.second;
\t\t\t\t\tstd::size_t seed = hash_murmur3(static_cast<std::size_t>(first ^ (first >> 32)));
\t\t\t\t\tconst std::size_t folded_second = static_cast<std::size_t>(second ^ (second >> 32));
\t\t\t\t\tseed ^= hash_murmur3(folded_second) + static_cast<std::size_t>(0x9e3779b9U) +
\t\t\t\t\t\t(seed << 6) + (seed >> 2);
\t\t\t\t\treturn hash_murmur3(seed);
\t\t\t\t}
\t\t\t}
\t\t};"""
if segment_old not in point_text:
    raise SystemExit("Pinned PointMap.hpp SegmentHash changed; refusing blind patch.")
point_hpp.write_text(point_text.replace(segment_old, segment_new, 1), encoding="utf-8")
print("OpenVic hashing patched for 32-bit wasm size_t.")

# Base-game Web startup does not need to scan Victoria II's mod descriptors when
# no mods were requested. On browser MEMFS that directory walk/parser is pure
# overhead and can dominate startup. Keep the normal upstream path for future
# mod-enabled launches.
game_singleton_cpp = OPENVIC / "extension" / "src" / "openvic-extension" / "singletons" / "GameSingleton.cpp"
gs_cpp = game_singleton_cpp.read_text(encoding="utf-8")
compat_old = """godot::Error GameSingleton::load_defines_compatibility_mode(PackedStringArray const& mods) {
\tgodot::Error err = OK;
\tauto add_message = std::bind_front(&LoadLocalisation::add_message, LoadLocalisation::get_singleton());

\tERR_FAIL_COND_V_MSG(!game_manager.load_mod_descriptors(), FAILED, "Failed to load mod descriptors!");

\tmemory::vector<memory::string> std_mods;
\tstd_mods.reserve(mods.size());
\tfor (String const& mod : mods) {
\t\tstd_mods.emplace_back(convert_to<std::string>(mod));
\t}

\tERR_FAIL_COND_V_MSG(!game_manager.load_mods(std_mods), FAILED, "Loading mods failed.");

\tif (!game_manager.load_definitions(add_message)) {
\t\tUtilityFunctions::push_error("Failed to load defines!");
\t\terr = FAILED;
\t}

\tif (_load_terrain_variants() != OK) {
\t\tUtilityFunctions::push_error("Failed to load terrain variants!");
\t\terr = FAILED;
\t}
\tif (_load_flag_sheet() != OK) {
\t\tUtilityFunctions::push_error("Failed to load flag sheet!");
\t\terr = FAILED;
\t}
\tif (_load_map_images() != OK) {
\t\tUtilityFunctions::push_error("Failed to load map images!");
\t\terr = FAILED;
\t}

\tAssetManager* asset_manager = AssetManager::get_singleton();
\tif (asset_manager == nullptr || asset_manager->preload_textures() != OK) {
\t\tUtilityFunctions::push_error("Failed to preload assets!");
\t\terr = FAILED;
\t}

\treturn err;
}"""
compat_new = """godot::Error GameSingleton::load_defines_compatibility_mode(PackedStringArray const& mods) {
\tgodot::Error err = OK;
\tauto add_message = std::bind_front(&LoadLocalisation::add_message, LoadLocalisation::get_singleton());

\tif (!mods.is_empty()) {
\t\tUtilityFunctions::print("[WebLoad] scanning mod descriptors");
\t\tERR_FAIL_COND_V_MSG(!game_manager.load_mod_descriptors(), FAILED, "Failed to load mod descriptors!");

\t\tmemory::vector<memory::string> std_mods;
\t\tstd_mods.reserve(mods.size());
\t\tfor (String const& mod : mods) {
\t\t\tstd_mods.emplace_back(convert_to<std::string>(mod));
\t\t}

\t\tUtilityFunctions::print("[WebLoad] resolving requested mods");
\t\tERR_FAIL_COND_V_MSG(!game_manager.load_mods(std_mods), FAILED, "Loading mods failed.");
\t} else {
\t\tUtilityFunctions::print("[WebLoad] vanilla mode; skipping mod descriptor scan");
\t}

\tUtilityFunctions::print("[WebLoad] loading definitions");
\tif (!game_manager.load_definitions(add_message)) {
\t\tUtilityFunctions::push_error("Failed to load defines!");
\t\terr = FAILED;
\t}

\tUtilityFunctions::print("[WebLoad] loading terrain variants");
\tif (_load_terrain_variants() != OK) {
\t\tUtilityFunctions::push_error("Failed to load terrain variants!");
\t\terr = FAILED;
\t}
\tUtilityFunctions::print("[WebLoad] building flag sheet");
\tif (_load_flag_sheet() != OK) {
\t\tUtilityFunctions::push_error("Failed to load flag sheet!");
\t\terr = FAILED;
\t}
\tUtilityFunctions::print("[WebLoad] building map images");
\tif (_load_map_images() != OK) {
\t\tUtilityFunctions::push_error("Failed to load map images!");
\t\terr = FAILED;
\t}

\tUtilityFunctions::print("[WebLoad] preloading textures");
\tAssetManager* asset_manager = AssetManager::get_singleton();
\tif (asset_manager == nullptr || asset_manager->preload_textures() != OK) {
\t\tUtilityFunctions::push_error("Failed to preload assets!");
\t\terr = FAILED;
\t}

\tUtilityFunctions::print("[WebLoad] compatibility definitions complete");
\treturn err;
}"""
if compat_new not in gs_cpp:
    if compat_old not in gs_cpp:
        raise SystemExit("Pinned GameSingleton compatibility loader changed; refusing blind patch.")
    gs_cpp = gs_cpp.replace(compat_old, compat_new, 1)

# The upstream Godot logger uses callback_sink_st and calls Godot APIs from the
# loading thread. With Web pthreads this can block as soon as the simulation
# emits its first SPDLOG_INFO. Keep Emscripten's default console sink instead;
# it is compatible with pthread stdout/stderr and avoids crossing into Godot
# from the worker thread.
logger_old = """void GameSingleton::setup_logger() {
\tspdlog::sink_ptr godot_sink = std::make_shared<spdlog::sinks::callback_sink_st>([](spdlog::details::log_msg const& msg) {"""
logger_new = """void GameSingleton::setup_logger() {
#if defined(__EMSCRIPTEN__) && defined(__EMSCRIPTEN_PTHREADS__)
\tUtilityFunctions::print("[WebLoad] pthread logger: using Emscripten default sink");
\treturn;
#endif
\tspdlog::sink_ptr godot_sink = std::make_shared<spdlog::sinks::callback_sink_st>([](spdlog::details::log_msg const& msg) {"""
if logger_new not in gs_cpp:
    if logger_old not in gs_cpp:
        raise SystemExit("Pinned GameSingleton logger changed; refusing blind patch.")
    gs_cpp = gs_cpp.replace(logger_old, logger_new, 1)

game_singleton_cpp.write_text(gs_cpp, encoding="utf-8")
print("OpenVic base-game Web loader and pthread-safe logger patched.")

# Raw WASM diagnostics around the definition loader. These deliberately bypass
# both Godot and spdlog so a pthread/logger issue cannot hide the exact stall.
game_manager_cpp = sim / "src/openvic-simulation/GameManager.cpp"
gm_text = game_manager_cpp.read_text(encoding="utf-8")
if "#include <cstdio>" not in gm_text:
    gm_text = gm_text.replace('#include "GameManager.hpp"\n', '#include "GameManager.hpp"\n\n#include <cstdio>\n', 1)
gm_old = """bool GameManager::load_definitions(Dataloader::localisation_callback_t localisation_callback) {
\tif (definitions_loaded) {
\t\tspdlog::error_s("Cannot load definitions - already loaded!");
\t\treturn false;
\t}

\tbool ret = true;

\tif (!dataloader.load_defines(game_rules_manager, definition_manager)) {"""
gm_new = """bool GameManager::load_definitions(Dataloader::localisation_callback_t localisation_callback) {
\tstd::printf("[WebLoadRaw] GameManager::load_definitions entered\\n");
\tstd::fflush(stdout);
\tif (definitions_loaded) {
\t\tspdlog::error_s("Cannot load definitions - already loaded!");
\t\treturn false;
\t}

\tbool ret = true;
\tstd::printf("[WebLoadRaw] calling Dataloader::load_defines\\n");
\tstd::fflush(stdout);

\tif (!dataloader.load_defines(game_rules_manager, definition_manager)) {"""
if gm_new not in gm_text:
    if gm_old not in gm_text:
        raise SystemExit("Pinned GameManager load_definitions changed; refusing blind patch.")
    gm_text = gm_text.replace(gm_old, gm_new, 1)
game_manager_cpp.write_text(gm_text, encoding="utf-8")

dataloader_cpp = sim / "src/openvic-simulation/dataloader/Dataloader.cpp"
dl = dataloader_cpp.read_text(encoding="utf-8")
if "#include <cstdio>" not in dl:
    # Insert after the file's first local include, preserving upstream layout.
    first_include = dl.find("#include")
    first_nl = dl.find("\n", first_include)
    dl = dl[:first_nl + 1] + "#include <cstdio>\n" + dl[first_nl + 1:]
dl_old = """bool Dataloader::load_defines(
\tGameRulesManager const& game_rules_manager,
\tDefinitionManager& definition_manager
) {
\tif (roots.empty()) {"""
dl_new = """bool Dataloader::load_defines(
\tGameRulesManager const& game_rules_manager,
\tDefinitionManager& definition_manager
) {
\tstd::printf("[WebLoadRaw] Dataloader::load_defines entered; roots=%zu\\n", roots.size());
\tstd::fflush(stdout);
\tif (roots.empty()) {"""
if dl_new not in dl:
    if dl_old not in dl:
        raise SystemExit("Pinned Dataloader load_defines entry changed; refusing blind patch.")
    dl = dl.replace(dl_old, dl_new, 1)

# Replace the diagnostic-only SPDLOG_INFO markers with raw stdout too.
dl = dl.replace('SPDLOG_INFO("[WebLoad] sound/interface/bootstrap");', 'std::printf("[WebLoadRaw] sound/interface/bootstrap\\n"); std::fflush(stdout);')
dl = dl.replace('SPDLOG_INFO("[WebLoad] common/defines.lua");', 'std::printf("[WebLoadRaw] common/defines.lua\\n"); std::fflush(stdout);')
dl = dl.replace('SPDLOG_INFO("[WebLoad] goods/cultures/politics");', 'std::printf("[WebLoadRaw] goods/cultures/politics\\n"); std::fflush(stdout);')
dl = dl.replace('SPDLOG_INFO("[WebLoad] map + provinces");', 'std::printf("[WebLoadRaw] map + provinces\\n"); std::fflush(stdout);')
dl = dl.replace('SPDLOG_INFO("[WebLoad] units/rebels/technology");', 'std::printf("[WebLoadRaw] units/rebels/technology\\n"); std::fflush(stdout);')
dl = dl.replace('SPDLOG_INFO("[WebLoad] history/events");', 'std::printf("[WebLoadRaw] history/events\\n"); std::fflush(stdout);')
dl = dl.replace('SPDLOG_INFO("[WebLoad] definitions parsed");', 'std::printf("[WebLoadRaw] definitions parsed\\n"); std::fflush(stdout);')
# Split the first definition phase into filesystem / parser / manager calls.
sound_old = """bool Dataloader::_load_sound_effect_defines(DefinitionManager& definition_manager) const {
\tstatic constexpr std::string_view sfx_file = "interface/sound.sfx";
\tconst fs::path path = lookup_file(sfx_file);

\tbool ret = true;
\tSoundEffectManager& sound_effect_manager = definition_manager.get_sound_effect_manager();

\tret &= sound_effect_manager.load_sound_defines_file(*this, parse_defines(path).get_file_node());

\tsound_effect_manager.lock_sound_effects();

\treturn ret;

}"""
sound_new = """bool Dataloader::_load_sound_effect_defines(DefinitionManager& definition_manager) const {
\tstd::printf("[WebLoadRaw] sound.sfx: enter\\n");
\tstd::fflush(stdout);
\tstatic constexpr std::string_view sfx_file = "interface/sound.sfx";
\tstd::printf("[WebLoadRaw] sound.sfx: lookup_file\\n");
\tstd::fflush(stdout);
\tconst fs::path path = lookup_file(sfx_file);
\tstd::printf("[WebLoadRaw] sound.sfx: lookup done: %s\\n", path.string().c_str());
\tstd::fflush(stdout);

\tbool ret = true;
\tSoundEffectManager& sound_effect_manager = definition_manager.get_sound_effect_manager();

\tstd::printf("[WebLoadRaw] sound.sfx: parse_defines begin\\n");
\tstd::fflush(stdout);
\tauto parsed_sound = parse_defines(path);
\tstd::printf("[WebLoadRaw] sound.sfx: parse_defines done\\n");
\tstd::fflush(stdout);
\tret &= sound_effect_manager.load_sound_defines_file(*this, parsed_sound.get_file_node());
\tstd::printf("[WebLoadRaw] sound.sfx: manager load done\\n");
\tstd::fflush(stdout);

\tsound_effect_manager.lock_sound_effects();
\tstd::printf("[WebLoadRaw] sound.sfx: locked\\n");
\tstd::fflush(stdout);

\treturn ret;

}"""
if sound_new not in dl:
    if sound_old not in dl:
        raise SystemExit("Pinned sound effect loader changed; refusing blind patch.")
    dl = dl.replace(sound_old, sound_new, 1)

iface_old = """bool Dataloader::_load_interface_files(UIManager& ui_manager) const {
\tstatic constexpr std::string_view interface_directory = "interface/";

\tbool ret = apply_to_files(
\t\tlookup_files_in_dir(interface_directory, ".gfx"),"""
iface_new = """bool Dataloader::_load_interface_files(UIManager& ui_manager) const {
\tstd::printf("[WebLoadRaw] interface: enter\\n");
\tstd::fflush(stdout);
\tstatic constexpr std::string_view interface_directory = "interface/";

\tstd::printf("[WebLoadRaw] interface: listing .gfx files\\n");
\tstd::fflush(stdout);
\tauto gfx_files = lookup_files_in_dir(interface_directory, ".gfx");
\tstd::printf("[WebLoadRaw] interface: %zu .gfx files found\\n", gfx_files.size());
\tstd::fflush(stdout);
\tbool ret = apply_to_files(
\t\tgfx_files,"""
if iface_new not in dl:
    if iface_old not in dl:
        raise SystemExit("Pinned interface loader changed; refusing blind patch.")
    dl = dl.replace(iface_old, iface_new, 1)

# Distinguish parser construction, file reading, and parsing for the first file.
# Restrict this detailed trace to sound.sfx instead of logging every game file.
parser_old = """static Parser _run_ovdl_parser(fs::path const& path) {
\tParser parser;"""
parser_new = """static Parser _run_ovdl_parser(fs::path const& path) {
#if defined(__EMSCRIPTEN__)
\tconst bool trace_sound = path.filename() == "sound.sfx";
\tif (trace_sound) { std::puts("[WebLoadRaw] sound.sfx: constructing parser"); std::fflush(stdout); }
#endif
\tParser parser;
#if defined(__EMSCRIPTEN__)
\tif (trace_sound) { std::puts("[WebLoadRaw] sound.sfx: parser constructed"); std::fflush(stdout); }
#endif"""
if parser_old not in dl:
    raise SystemExit("Pinned parser construction changed; refusing blind patch.")
dl = dl.replace(parser_old, parser_new, 1)
read_old = "\tparser.load_from_file(path);"
read_new = """#if defined(__EMSCRIPTEN__)
\tif (trace_sound) { std::puts("[WebLoadRaw] sound.sfx: reading file"); std::fflush(stdout); }
#endif
\tparser.load_from_file(path);
#if defined(__EMSCRIPTEN__)
\tif (trace_sound) { std::puts("[WebLoadRaw] sound.sfx: file read"); std::fflush(stdout); }
#endif"""
if read_old not in dl:
    raise SystemExit("Pinned parser file read changed; refusing blind patch.")
dl = dl.replace(read_old, read_new, 1)

dataloader_cpp.write_text(dl, encoding="utf-8")
print("Raw Web definition-loader diagnostics patched.")

ecs_cpp = sim / "src/openvic-simulation/core/ecs/EcsThreadPool.cpp"
ecs_text = ecs_cpp.read_text(encoding="utf-8")
ecs_ctor = """EcsThreadPool::EcsThreadPool(uint32_t worker_count) {
\tuint32_t const n = std::max<uint32_t>(1u, worker_count);
\tworkers_.reserve(n);
\tfor (uint32_t i = 0; i < n; ++i) {
\t\tworkers_.emplace_back([this, i]() { worker_loop(i); });
\t}
}"""
ecs_web_ctor = """EcsThreadPool::EcsThreadPool(uint32_t worker_count) {
#if defined(__EMSCRIPTEN__) && !defined(__EMSCRIPTEN_PTHREADS__)
\t// The no-pthreads Web fallback uses an empty worker vector so
\t// parallel_for/run_concurrent take their existing serial fast paths.
\t(void)worker_count;
#else
\tuint32_t const n = std::max<uint32_t>(1u, worker_count);
\tworkers_.reserve(n);
\tfor (uint32_t i = 0; i < n; ++i) {
\t\tworkers_.emplace_back([this, i]() { worker_loop(i); });
\t}
#endif
}"""
if ecs_ctor not in ecs_text:
    raise SystemExit("Pinned EcsThreadPool constructor changed; refusing blind patch.")
ecs_cpp.write_text(ecs_text.replace(ecs_ctor, ecs_web_ctor, 1), encoding="utf-8")

thread_hpp = sim / "src/openvic-simulation/utility/ThreadPool.hpp"
hpp = thread_hpp.read_text(encoding="utf-8")
hpp_anchor = """\t\tbool is_cancellation_requested = false;
\t\tDate const& current_date;

\t\tvoid loop_until_cancelled("""
hpp_replacement = """\t\tbool is_cancellation_requested = false;
\t\tDate const& current_date;

#if defined(__EMSCRIPTEN__) && !defined(__EMSCRIPTEN_PTHREADS__)
\t\tGameRulesManager const* web_game_rules_manager = nullptr;
\t\tGoodInstanceManager const* web_good_instance_manager = nullptr;
\t\tModifierEffectCache const* web_modifier_effect_cache = nullptr;
\t\tPopsDefines const* web_pop_defines = nullptr;
\t\tProductionTypeManager const* web_production_type_manager = nullptr;
\t\tstd::size_t web_country_count = 0;
\t\tgood_index_t web_good_count {};
\t\tstrata_index_t web_strata_count {};
\t\tvoid process_work_serial(work_t work_type);
#endif

\t\tvoid loop_until_cancelled("""
if hpp_anchor not in hpp:
    raise SystemExit("Pinned ThreadPool.hpp layout changed; refusing blind patch.")
thread_hpp.write_text(hpp.replace(hpp_anchor, hpp_replacement, 1), encoding="utf-8")

thread_cpp = sim / "src/openvic-simulation/utility/ThreadPool.cpp"
cpp = thread_cpp.read_text(encoding="utf-8")

process_old = """void ThreadPool::process_work(const work_t work_type) {
\t{
\t\tstd::unique_lock<std::mutex> thread_lock { thread_mutex };
\t\tif (is_cancellation_requested) {
\t\t\treturn;
\t\t}

\t\t{
\t\t\tstd::lock_guard<std::mutex> completed_lock { completed_mutex };
\t\t\tactive_work_count = threads.size();
\t\t}

\t\tfor (work_t& work_for_thread : work_per_thread) {
\t\t\twork_for_thread = work_type;
\t\t}
\t\tthread_condition.notify_all();
\t}
\tawait_completion();
}"""

process_new = """#if defined(__EMSCRIPTEN__) && !defined(__EMSCRIPTEN_PTHREADS__)
void ThreadPool::process_work_serial(const work_t work_type) {
\tif (
\t\tweb_game_rules_manager == nullptr ||
\t\tweb_good_instance_manager == nullptr ||
\t\tweb_modifier_effect_cache == nullptr ||
\t\tweb_pop_defines == nullptr ||
\t\tweb_production_type_manager == nullptr
\t) {
\t\treturn;
\t}

\tmemory::FixedVector<char, good_index_t> reusable_goods_mask { web_good_count, {} };
\tmemory::FixedVector<fixed_point_t, country_index_t> reusable_country_map_0 {
\t\tcountry_index_t(web_country_count), fixed_point_t::_0
\t};
\tmemory::FixedVector<fixed_point_t, country_index_t> reusable_country_map_1 {
\t\tcountry_index_t(web_country_count), fixed_point_t::_0
\t};

\tstatic constexpr std::size_t VECTOR_COUNT = std::max(
\t\tGoodMarket::VECTORS_FOR_EXECUTE_ORDERS,
\t\tstd::max(
\t\t\tCountryInstance::VECTORS_FOR_COUNTRY_TICK,
\t\t\tProvinceInstance::VECTORS_FOR_PROVINCE_TICK
\t\t)
\t);
\tstd::array<memory::vector<fixed_point_t>, VECTOR_COUNT> reusable_vectors;
\tstd::span<memory::vector<fixed_point_t>, VECTOR_COUNT> reusable_vectors_span = std::span(reusable_vectors);
\tmemory::vector<good_index_t> reusable_good_index_vector;
\tPopValuesFromProvince reusable_pop_values {
\t\t*web_game_rules_manager,
\t\t*web_good_instance_manager,
\t\t*web_modifier_effect_cache,
\t\t*web_production_type_manager,
\t\t*web_pop_defines,
\t\tweb_strata_count
\t};

\tswitch (work_type) {
\t\tcase work_t::NONE:
\t\t\tbreak;
\t\tcase work_t::GOOD_EXECUTE_ORDERS:
\t\t\tfor (WorkBundle& work_bundle : all_work_bundles) {
\t\t\t\tfor (GoodMarket& good : work_bundle.goods_chunk) {
\t\t\t\t\tgood.execute_orders(
\t\t\t\t\t\treusable_country_map_0,
\t\t\t\t\t\treusable_country_map_1,
\t\t\t\t\t\treusable_vectors_span.first<GoodMarket::VECTORS_FOR_EXECUTE_ORDERS>()
\t\t\t\t\t);
\t\t\t\t}
\t\t\t}
\t\t\tbreak;
\t\tcase work_t::PROVINCE_TICK:
\t\t\tfor (WorkBundle& work_bundle : all_work_bundles) {
\t\t\t\tfor (ProvinceInstance& province : work_bundle.provinces_chunk) {
\t\t\t\t\tprovince.province_tick(
\t\t\t\t\t\tcurrent_date,
\t\t\t\t\t\treusable_pop_values,
\t\t\t\t\t\twork_bundle.random_number_generator,
\t\t\t\t\t\treusable_goods_mask,
\t\t\t\t\t\treusable_vectors_span.first<ProvinceInstance::VECTORS_FOR_PROVINCE_TICK>()
\t\t\t\t\t);
\t\t\t\t}
\t\t\t}
\t\t\tbreak;
\t\tcase work_t::PROVINCE_INITIALISE_FOR_NEW_GAME:
\t\t\tfor (WorkBundle& work_bundle : all_work_bundles) {
\t\t\t\tfor (ProvinceInstance& province : work_bundle.provinces_chunk) {
\t\t\t\t\tprovince.initialise_for_new_game(
\t\t\t\t\t\tcurrent_date,
\t\t\t\t\t\treusable_pop_values,
\t\t\t\t\t\twork_bundle.random_number_generator,
\t\t\t\t\t\treusable_goods_mask,
\t\t\t\t\t\treusable_vectors_span.first<ProvinceInstance::VECTORS_FOR_PROVINCE_TICK>()
\t\t\t\t\t);
\t\t\t\t}
\t\t\t}
\t\t\tbreak;
\t\tcase work_t::COUNTRY_TICK_BEFORE_MAP:
\t\t\tfor (WorkBundle& work_bundle : all_work_bundles) {
\t\t\t\tfor (CountryInstance& country : work_bundle.countries_chunk) {
\t\t\t\t\tcountry.country_tick_before_map(
\t\t\t\t\t\treusable_goods_mask,
\t\t\t\t\t\treusable_vectors_span.first<CountryInstance::VECTORS_FOR_COUNTRY_TICK>(),
\t\t\t\t\t\treusable_good_index_vector
\t\t\t\t\t);
\t\t\t\t}
\t\t\t}
\t\t\tbreak;
\t\tcase work_t::COUNTRY_TICK_AFTER_MAP:
\t\t\tfor (WorkBundle& work_bundle : all_work_bundles) {
\t\t\t\tfor (CountryInstance& country : work_bundle.countries_chunk) {
\t\t\t\t\tcountry.country_tick_after_map(current_date);
\t\t\t\t}
\t\t\t}
\t\t\tbreak;
\t}
}
#endif

void ThreadPool::process_work(const work_t work_type) {
#if defined(__EMSCRIPTEN__) && !defined(__EMSCRIPTEN_PTHREADS__)
\tprocess_work_serial(work_type);
\treturn;
#else
\t{
\t\tstd::unique_lock<std::mutex> thread_lock { thread_mutex };
\t\tif (is_cancellation_requested) {
\t\t\treturn;
\t\t}

\t\t{
\t\t\tstd::lock_guard<std::mutex> completed_lock { completed_mutex };
\t\t\tactive_work_count = threads.size();
\t\t}

\t\tfor (work_t& work_for_thread : work_per_thread) {
\t\t\twork_for_thread = work_type;
\t\t}
\t\tthread_condition.notify_all();
\t}
\tawait_completion();
#endif
}"""
if process_old not in cpp:
    raise SystemExit("Pinned ThreadPool::process_work changed; refusing blind patch.")
cpp = cpp.replace(process_old, process_new, 1)

spawn_anchor = """\tconst std::size_t max_worker_threads = std::min(
\t\tstd::max<std::size_t>(std::thread::hardware_concurrency(), 1),
\t\tWORK_BUNDLE_COUNT
\t);"""

spawn_replacement = """#if defined(__EMSCRIPTEN__) && !defined(__EMSCRIPTEN_PTHREADS__)
\t// Preserve the exact deterministic work-bundle partitioning above, but do
\t// not create pthreads in the no-threads Web build. process_work_serial()
\t// executes these same bundles on the browser's single Wasm thread.
\tweb_game_rules_manager = &game_rules_manager;
\tweb_good_instance_manager = &good_instance_manager;
\tweb_modifier_effect_cache = &modifier_effect_cache;
\tweb_pop_defines = &pop_defines;
\tweb_production_type_manager = &production_type_manager;
\tweb_country_count = countries.size();
\tweb_good_count = good_index_t(goods.size());
\tweb_strata_count = strata_count;
\treturn;
#endif

\tconst std::size_t max_worker_threads = std::min(
\t\tstd::max<std::size_t>(std::thread::hardware_concurrency(), 1),
\t\tWORK_BUNDLE_COUNT
\t);"""
if spawn_anchor not in cpp:
    raise SystemExit("Pinned ThreadPool worker creation changed; refusing blind patch.")
cpp = cpp.replace(spawn_anchor, spawn_replacement, 1)

thread_cpp.write_text(cpp, encoding="utf-8")
print("OpenVic simulation thread pools patched for serial WebAssembly runtime.")
