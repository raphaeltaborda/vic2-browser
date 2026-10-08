extends Node

const ROOT := "/vic2"
const READY_MARKER := "[Stage3] OPENVIC_FILESYSTEM_READY"
const FAILURE_MARKER := "[Stage3] OPENVIC_FILESYSTEM_FAILED"

const EXPECTED := {
	"common/defines.lua": "STAGE3_DEFINES_SENTINEL",
	"map/definition.csv": "STAGE3_MAP_SENTINEL",
}

func fail_stage3(message: String) -> void:
	push_error(FAILURE_MARKER + " " + message)
	JavaScriptBridge.eval("globalThis.__OPENVIC_STAGE3_FAILURE__ = true;", true)

func _ready() -> void:
	if not Engine.has_singleton("GameSingleton"):
		fail_stage3("GameSingleton is not registered")
		return

	var game := Engine.get_singleton("GameSingleton")
	var root_status: int = game.set_compatibility_mode_roots(ROOT)
	if root_status != OK:
		fail_stage3("OpenVic rejected /vic2 as a dataloader root")
		return
	print("[Stage3] ROOTS_OK root=", ROOT)

	for relative_path in EXPECTED:
		var resolved: String = game.lookup_file_path(relative_path)
		if resolved.is_empty():
			fail_stage3("OpenVic could not resolve " + relative_path)
			return
		if not resolved.begins_with(ROOT + "/"):
			fail_stage3("OpenVic resolved outside /vic2: " + resolved)
			return

		print("[Stage3] LOOKUP_OK relative=", relative_path, " resolved=", resolved)

		var file := FileAccess.open(resolved, FileAccess.READ)
		if file == null:
			fail_stage3("Godot could not open OpenVic-resolved path " + resolved)
			return
		var contents := file.get_as_text()
		if not contents.contains(EXPECTED[relative_path]):
			fail_stage3("Fixture bytes did not match for " + relative_path)
			return
		print("[Stage3] READ_OK relative=", relative_path, " bytes=", contents.to_utf8_buffer().size())

	var missing: String = game.lookup_file_path("common/stage3-file-that-does-not-exist.txt")
	if not missing.is_empty():
		fail_stage3("OpenVic resolved a deliberately absent file: " + missing)
		return
	print("[Stage3] NEGATIVE_LOOKUP_OK")

	print(READY_MARKER)
	JavaScriptBridge.eval("globalThis.__OPENVIC_STAGE3_READY__ = true;", true)
