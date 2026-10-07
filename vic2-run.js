(() => {
    "use strict";

    const RUNTIME = "boxedwine/";
    const APP_ZIP = "userapp.zip";

    const folderInput = document.getElementById("vic2-folder");
    const folderSummary = document.getElementById("folder-summary");
    const launchPanel = document.getElementById("launch-panel");
    const launchButton = document.getElementById("launch-button");
    const launchProgress = document.getElementById("launch-progress");
    const launchStatus = document.getElementById("launch-status");
    const launchLog = document.getElementById("launch-log");
    const screenPanel = document.getElementById("screen-panel");
    const output = document.getElementById("output");
    const showConsole = document.getElementById("showConsole");

    let selectedFiles = [];
    let totalBytes = 0;
    let appZipBlob = null;
    let appZipUrl = null;
    let xhrPatched = false;
    let booting = false;

    function log(message) {
        const time = new Date().toLocaleTimeString();
        launchLog.textContent += `[${time}] ${message}\n`;
        launchLog.scrollTop = launchLog.scrollHeight;
    }

    function setStatus(message) {
        launchStatus.textContent = message;
        log(message);
    }

    function formatBytes(bytes) {
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
        if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
        return (bytes / 1024 / 1024 / 1024).toFixed(2) + " GB";
    }

    function normalizeRelativePath(file) {
        const raw = (file.webkitRelativePath || file.name).replaceAll("\\", "/");
        const firstSlash = raw.indexOf("/");
        return firstSlash >= 0 ? raw.slice(firstSlash + 1) : raw;
    }

    function addSummary(name, ok, detail, warning = false) {
        const row = document.createElement("div");
        row.className = `check ${ok ? "pass" : warning ? "warn" : "fail"}`;

        const label = document.createElement("span");
        label.className = "check-name";
        label.textContent = name;

        const value = document.createElement("span");
        value.className = "check-result";
        value.textContent = detail;

        row.append(label, value);
        folderSummary.appendChild(row);
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = src;
            script.async = false;
            script.onload = resolve;
            script.onerror = () => reject(new Error("Falha ao carregar " + src));
            document.head.appendChild(script);
        });
    }

    async function loadText(src) {
        const response = await fetch(src);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ao carregar ${src}`);
        }
        return response.text();
    }

    function runInlineScript(source) {
        const script = document.createElement("script");
        script.textContent = source;
        document.head.appendChild(script);
    }

    function patchXhr() {
        if (xhrPatched) return;
        xhrPatched = true;

        const NativeXHR = window.XMLHttpRequest;
        const originalOpen = NativeXHR.prototype.open;

        NativeXHR.prototype.open = function(method, url, async, user, password) {
            let nextUrl = String(url);

            if (nextUrl === "boxedwine.zip") {
                nextUrl = RUNTIME + "boxedwine.zip";
            }

            if (
                appZipUrl &&
                (nextUrl === APP_ZIP || nextUrl.endsWith("/" + APP_ZIP))
            ) {
                nextUrl = appZipUrl;
            }

            return originalOpen.call(
                this,
                method,
                nextUrl,
                async !== false,
                user,
                password
            );
        };
    }

    async function buildAppZip() {
        setStatus("Carregando JSZip...");
        launchProgress.value = 3;

        if (typeof window.JSZip === "undefined") {
            await loadScript(RUNTIME + "jszip.min.js");
        }

        const zip = new JSZip();
        let processed = 0;

        setStatus("Lendo os arquivos da instalação...");

        for (const file of selectedFiles) {
            const rel = normalizeRelativePath(file);
            if (!rel) continue;

            const bytes = new Uint8Array(await file.arrayBuffer());
            zip.file("userapp/" + rel, bytes, { binary: true });

            processed += file.size;
            launchProgress.value = 5 + Math.round((processed / totalBytes) * 55);
        }

        setStatus("Montando o disco virtual do Victoria II...");
        launchProgress.value = 65;

        const zipBytes = zip.generate({
            type: "uint8array",
            compression: "STORE"
        });

        appZipBlob = new Blob([zipBytes], { type: "application/zip" });

        if (appZipUrl) URL.revokeObjectURL(appZipUrl);
        appZipUrl = URL.createObjectURL(appZipBlob);

        launchProgress.value = 72;
        log(
            `Pacote virtual pronto: ${formatBytes(appZipBlob.size)}. ` +
            "Os dados continuam somente neste navegador."
        );
    }

    async function configureBoxedWine() {
        setStatus("Carregando BrowserFS...");
        if (typeof window.BrowserFS === "undefined") {
            await loadScript(RUNTIME + "browserfs.min.js");
        }

        patchXhr();

        setStatus("Configurando Wine 32-bit...");
        launchProgress.value = 78;

        const shellSource = await loadText(RUNTIME + "boxedwine-shell.js");

        const config = `
            ;Config.isRunningInline = false;
            Config.storageMode = STORAGE_MEMORY;
            Config.showUploadDownload = false;
            Config.urlParams =
                "root=boxedwine&app=userapp&p=v2game.exe&auto=true&sound=false&bpp=32";

            Module.canvas = document.getElementById("canvas");

            var __vic2Print = Module.print;
            var __vic2PrintErr = Module.printErr;

            Module.print = function(text) {
                try { __vic2Print(text); } catch (_) {}
                window.__vic2Log(String(text));
            };

            Module.printErr = function(text) {
                try { __vic2PrintErr(text); } catch (_) {}
                window.__vic2Log("[stderr] " + String(text));
            };

            Module.locateFile = function(path) {
                return "boxedwine/" + path;
            };

            window.__vic2BoxedwineModule = Module;
            window.__vic2BoxedwineConfig = Config;
        `;

        window.__vic2Log = message => {
            output.value += message + "\n";
            output.scrollTop = output.scrollHeight;
        };

        runInlineScript(shellSource + "\n" + config);

        if (!window.__vic2BoxedwineModule) {
            throw new Error("O shell do BoxedWine não foi configurado.");
        }
    }

    async function startRuntime() {
        setStatus("Iniciando BoxedWine/WebAssembly...");
        launchProgress.value = 86;

        screenPanel.classList.remove("hidden");
        await loadScript(RUNTIME + "boxedwine.js");

        launchProgress.value = 100;
        setStatus(
            "v2game.exe foi entregue ao Wine. Agora estamos observando até onde o Victoria II consegue iniciar."
        );
    }

    folderInput.addEventListener("change", () => {
        selectedFiles = Array.from(folderInput.files || []);
        folderSummary.innerHTML = "";
        launchPanel.classList.add("hidden");

        if (!selectedFiles.length) {
            addSummary("Pasta", false, "nenhum arquivo");
            return;
        }

        totalBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);

        const paths = selectedFiles.map(file => normalizeRelativePath(file).toLowerCase());
        const hasExe = paths.some(path => path === "v2game.exe");
        const hasMap = paths.some(path => path === "map/provinces.bmp");
        const hasCommon = paths.some(path => path === "common/countries.txt");

        addSummary("Arquivos", true, selectedFiles.length.toLocaleString("pt-BR"));
        addSummary("Tamanho", true, formatBytes(totalBytes));
        addSummary("v2game.exe", hasExe, hasExe ? "OK" : "ausente");
        addSummary("Mapa", hasMap, hasMap ? "OK" : "ausente");
        addSummary("Common", hasCommon, hasCommon ? "OK" : "ausente");

        if (hasExe && hasMap && hasCommon) {
            launchPanel.classList.remove("hidden");
            launchStatus.textContent = "Pronto para montar os arquivos.";
            launchProgress.value = 0;
            log(
                "Instalação selecionada. O próximo clique fará a leitura local dos arquivos e tentará iniciar v2game.exe."
            );
        }
    });

    launchButton.addEventListener("click", async () => {
        if (booting) return;
        booting = true;
        launchButton.disabled = true;
        launchLog.textContent = "";
        output.value = "";

        try {
            await buildAppZip();
            await configureBoxedWine();
            await startRuntime();
        } catch (error) {
            console.error(error);
            setStatus("Falha no primeiro boot: " + error.message);
            launchButton.disabled = false;
            booting = false;
        }
    });

    showConsole.addEventListener("change", () => {
        output.style.display = showConsole.checked ? "" : "none";
    });
})();