const checksContainer = document.getElementById("checks");
const nextStep = document.getElementById("next-step");

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

    const wasm = supportsWasm();
    const webgl2 = supportsWebGL2();
    const indexedDBOk = "indexedDB" in window;
    const secure = window.isSecureContext;
    const serviceWorkerOk = "serviceWorker" in navigator;
    const isolated = window.crossOriginIsolated === true;
    const sab = typeof SharedArrayBuffer !== "undefined";

    addCheck("WebAssembly", wasm, wasm ? "OK" : "indisponível");
    addCheck("WebGL 2", webgl2, webgl2 ? "OK" : "indisponível");
    addCheck("IndexedDB", indexedDBOk, indexedDBOk ? "OK" : "indisponível");
    addCheck("HTTPS / contexto seguro", secure, secure ? "OK" : "necessário");
    addCheck("Service Worker", serviceWorkerOk, serviceWorkerOk ? "OK" : "indisponível");
    addCheck("Cross-origin isolation", isolated, isolated ? "OK" : "ainda não ativo", !isolated);
    addCheck("SharedArrayBuffer", sab, sab ? "OK" : "ainda não disponível", !sab);

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

    const essentials = wasm && webgl2 && indexedDBOk && secure && serviceWorkerOk;

    if (!essentials) {
        nextStep.textContent =
            "Há um requisito básico faltando. Não vamos carregar o BoxedWine até corrigirmos isso.";
        return;
    }

    if (!isolated || !sab) {
        nextStep.textContent =
            "Os requisitos básicos estão presentes. O isolamento para threads ainda está sendo preparado pelo service worker; recarregar a página pode concluir esta etapa.";
        return;
    }

    nextStep.textContent =
        "Ambiente pronto. O próximo commit poderá carregar o runtime BoxedWine/WebAssembly e iniciar nosso primeiro executável de teste.";
}

runDiagnostics();
