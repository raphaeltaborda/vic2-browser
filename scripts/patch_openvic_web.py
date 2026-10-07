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
