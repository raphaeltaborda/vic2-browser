extends Node

const EXTENSION_PATH := "res://bin/openvic/openvic.gdextension"
const READY_MARKER := "[Stage2] OPENVIC_GDEXTENSION_READY"
const FAILURE_MARKER := "[Stage2] OPENVIC_GDEXTENSION_FAILED"

func _ready() -> void:
	var status := GDExtensionManager.load_extension(EXTENSION_PATH)
	var loaded := GDExtensionManager.is_extension_loaded(EXTENSION_PATH)
	var ovgame_registered := Engine.has_singleton("OVGame")

	print("[Stage2] load_status=", status, " loaded=", loaded, " ovgame=", ovgame_registered)

	if loaded and ovgame_registered:
		print(READY_MARKER)
		JavaScriptBridge.eval("globalThis.__OPENVIC_STAGE2_READY__ = true;", true)
		return

	push_error(FAILURE_MARKER)
	JavaScriptBridge.eval("globalThis.__OPENVIC_STAGE2_FAILURE__ = true;", true)
