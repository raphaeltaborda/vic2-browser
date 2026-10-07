const checksContainer = document.getElementById("checks");
const nextStep = document.getElementById("next-step");
const runtimeLink = document.getElementById("runtime-link");

function supportsWasm() {
    try {
        const bytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
        return typeof WebAssembly === "object" && WebAssembly.validate(bytes);
    } catch {
        return false;
    }
}

function supportsWebGL2() {
    try {
        const canvas = document.createElement("canvas");
        return Boolean(canvas.getContext("webgl2"));
    } catch {
        return false;
    }
}

function addCheck(name, ok, detail, warning = false) {
    const row = document.createElement("div");
    row.className = `check ${ok ? "pass" : warning ? "warn" : "fail"}`;

    const label = document.createElement("span");
    label.className = "check-name";
    label.textContent = name;

    const result = document.createElement("span");
    result.className = "check-result";
    result.textContent = detail;

    row.append(label, result);
    checksContainer.appendChild(row);
}

async function runDiagnostics() {
    checksContainer.innerHTML = "";

    const isBrave = Boolean(navigator.brave);
    const wasm = supportsWasm();
    const webgl2 = supportsWebGL2();
    const indexedDBOk = "indexedDB" in window;
    const secure = window.isSecureContext;
    const serviceWorkerOk = "serviceWorker" in navigator;
    const isolated = window.crossOriginIsolated === true;
    const sab = typeof SharedArrayBuffer !== "undefined";

    addCheck("Navegador", true, isBrave ? "Brave" : "Chromium compatível");
    addCheck("WebAssembly", wasm, wasm ? "OK" : "indisponível");
    addCheck("WebGL 2", webgl2, webgl2 ? "OK" : "indisponível");
    addCheck("IndexedDB", indexedDBOk, indexedDBOk ? "OK" : "indisponível");
    addCheck("HTTPS / contexto seguro", secure, secure ? "OK" : "necessário");
    addCheck("Service Worker", serviceWorkerOk, serviceWorkerOk ? "disponível" : "indisponível");

    if (isBrave) {
        addCheck(
            "Isolamento por threads",
            true,
            "ignorado no modo Brave",
            false
        );
    } else {
        addCheck(
            "Cross-origin isolation",
            isolated,
            isolated ? "OK" : "ainda não ativo",
            !isolated
        );
        addCheck(
            "SharedArrayBuffer",
            sab,
            sab ? "OK" : "ainda não disponível",
            !sab
        );
    }

    let storageText = "não disponível";
    if (navigator.storage?.estimate) {
        try {
            const estimate = await navigator.storage.estimate();
            if (estimate.quota) {
                storageText = `${(estimate.quota / 1024 / 1024 / 1024).toFixed(1)} GB de quota`;
            }
        } catch {
            storageText = "não foi possível medir";
        }
    }
    addCheck("Armazenamento do navegador", true, storageText);

    const essentials = wasm && webgl2 && indexedDBOk && secure;

    if (!essentials) {
        nextStep.textContent =
            "Há um requisito básico faltando. O teste do BoxedWine foi bloqueado para evitar uma falha confusa.";
        return;
    }

    runtimeLink.classList.remove("hidden");

    if (isBrave) {
        nextStep.textContent =
            "Brave detectado. Vamos usar o runtime single-thread, sem depender de SharedArrayBuffer ou do isolamento que o Brave pode bloquear.";
        return;
    }

    if (!isolated || !sab) {
        nextStep.textContent =
            "O runtime single-thread já pode ser testado. O isolamento para versões multi-thread ainda não está ativo.";
        return;
    }

    nextStep.textContent =
        "Ambiente completo. Você já pode abrir a próxima tela e iniciar o teste do BoxedWine.";
}

runDiagnostics();
