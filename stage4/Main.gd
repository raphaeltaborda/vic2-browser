extends Node

const ROOT := "/vic2"
const READY_MARKER := "[Stage4] OPENVIC_DEFINITIONS_READY"
const FAILURE_MARKER := "[Stage4] OPENVIC_DEFINITIONS_FAILED"

func set_js_state(state: String, detail: String = "") -> void:
	var script := "globalThis.__OPENVIC_STAGE4_STATE__ = " + JSON.stringify(state) + ";"
	script += "globalThis.__OPENVIC_STAGE4_DETAIL__ = " + JSON.stringify(detail) + ";"
	JavaScriptBridge.eval(script, true)

func fail_stage4(message: String) -> void:
	push_error(FAILURE_MARKER + " " + message)
	set_js_state("failed", message)
	JavaScriptBridge.eval("globalThis.__OPENVIC_STAGE4_FAILURE__ = true;", true)

func _ready() -> void:
	print("[Stage4] ENTRY")
	set_js_state("starting")

	if not Engine.has_singleton("GameSingleton"):
		fail_stage4("GameSingleton is not registered")
		return

	var game := Engine.get_singleton("GameSingleton")

	# setup_logger is a static OpenVic binding. Dynamic invocation keeps this
	# minimal project parseable even when the native extension is unavailable
	# to the host-side Godot editor used only for export.
	if game.has_method("setup_logger"):
		game.call("setup_logger")
		print("[Stage4] LOGGER_READY")
	else:
		print("[Stage4] LOGGER_DEFAULT")

	set_js_state("setting-root", ROOT)
	var root_status: int = game.call("set_compatibility_mode_roots", ROOT)
	if root_status != OK:
		fail_stage4("OpenVic rejected /vic2 as its compatibility root")
		return

	var defines_path: String = game.call("lookup_file_path", "common/defines.lua")
	if defines_path.is_empty():
		fail_stage4("common/defines.lua is not visible through OpenVic's Dataloader")
		return

	print("[Stage4] ROOTS_OK root=", ROOT)
	print("[Stage4] PREFLIGHT_OK defines=", defines_path)

	var start_usec := Time.get_ticks_usec()
	print("[Stage4] LOAD_BEGIN")
	set_js_state("loading-definitions", "OpenVic compatibility loader running")

	var load_status: int = game.call("load_defines_compatibility_mode", PackedStringArray())
	var elapsed := float(Time.get_ticks_usec() - start_usec) / 1_000_000.0

	print("[Stage4] LOAD_RETURN status=", load_status, " elapsed=", elapsed)

	if load_status != OK:
		fail_stage4("Compatibility loader returned status %d after %.3f seconds" % [load_status, elapsed])
		return

	print(READY_MARKER, " elapsed=", elapsed)
	set_js_state("ready", "%.3f" % elapsed)
	JavaScriptBridge.eval("globalThis.__OPENVIC_STAGE4_READY__ = true;", true)
