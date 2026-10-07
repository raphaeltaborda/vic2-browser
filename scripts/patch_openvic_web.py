#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OPENVIC = ROOT / "vendor" / "OpenVic"

cmake = OPENVIC / "CMakeLists.txt"
text = cmake.read_text(encoding="utf-8")

# Emscripten's CMake toolchain reports that the platform does not support
# traditional shared libraries. godot-cpp applies a workaround inside its own
# subdirectory, but the OpenVic GDExtension target is created in this parent
# scope. Without the same override here, CMake silently degrades
# add_library(openvic SHARED ...) into a static ar archive even if we give the
# file a .wasm suffix.
shared_marker = "# VIC2-WEB: enable real Emscripten SIDE_MODULE shared libraries"
project_line = "project(openvic LANGUAGES CXX)\n"
shared_block = """project(openvic LANGUAGES CXX)

# VIC2-WEB: enable real Emscripten SIDE_MODULE shared libraries
if(CMAKE_SYSTEM_NAME STREQUAL "Emscripten")
    set_property(GLOBAL PROPERTY TARGET_SUPPORTS_SHARED_LIBS TRUE)
    set(CMAKE_SHARED_LIBRARY_CREATE_C_FLAGS "-sSIDE_MODULE=1")
    set(CMAKE_SHARED_LIBRARY_CREATE_CXX_FLAGS "-sSIDE_MODULE=1")
    set(CMAKE_SHARED_LIBRARY_SUFFIX "")
    set(CMAKE_STRIP FALSE)
    set(CMAKE_SYSTEM_PROCESSOR "wasm32")
endif()
"""
if shared_marker not in text:
    if project_line not in text:
        raise SystemExit("OpenVic project() declaration changed upstream.")
    text = text.replace(project_line, shared_block, 1)


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


# ---------------------------------------------------------------------------
# Single-thread WebAssembly runtime patches
# ---------------------------------------------------------------------------
# Emscripten builds without -pthread can compile std::thread declarations, but
# they cannot spawn workers at runtime. Keep the simulation deterministic by
# executing the same work bundles serially in the browser.

sim = OPENVIC / "extension" / "deps" / "openvic-simulation"

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
#ifdef __EMSCRIPTEN__
\t// The Web target intentionally has no pthreads. An empty worker vector makes
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

#ifdef __EMSCRIPTEN__
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

process_new = """#ifdef __EMSCRIPTEN__
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
#ifdef __EMSCRIPTEN__
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

spawn_replacement = """#ifdef __EMSCRIPTEN__
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
