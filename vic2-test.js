const folderInput = document.getElementById("vic2-folder");
const resultsPanel = document.getElementById("results-panel");
const results = document.getElementById("vic2-results");
const exePanel = document.getElementById("exe-panel");
const exeInfo = document.getElementById("exe-info");
const nextPanel = document.getElementById("next-panel");
const nextInfo = document.getElementById("next-info");
const runVic2Button = document.getElementById("run-vic2-button");

function normalizePath(file) {
    return file.webkitRelativePath.replaceAll("\\", "/");
}

function basename(path) {
    return path.split("/").pop().toLowerCase();
}

function formatBytes(bytes) {
    if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(1) + " KB";
    }
    if (bytes < 1024 * 1024 * 1024) {
        return (bytes / 1024 / 1024).toFixed(1) + " MB";
    }
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + " GB";
}

function addResult(name, ok, detail, warning = false) {
    const row = document.createElement("div");
    row.className = `check ${ok ? "pass" : warning ? "warn" : "fail"}`;

    const label = document.createElement("span");
    label.className = "check-name";
    label.textContent = name;

    const value = document.createElement("span");
    value.className = "check-result";
    value.textContent = detail;

    row.append(label, value);
    results.appendChild(row);
}

async function inspectPortableExecutable(file) {
    const firstChunk = await file.slice(0, 1024 * 1024).arrayBuffer();
    const view = new DataView(firstChunk);

    if (view.byteLength < 64 || view.getUint16(0, true) !== 0x5a4d) {
        return { valid: false, reason: "assinatura MZ ausente" };
    }

    const peOffset = view.getUint32(0x3c, true);

    if (peOffset + 26 >= view.byteLength) {
        return { valid: false, reason: "cabeçalho PE fora do trecho lido" };
    }

    if (view.getUint32(peOffset, true) !== 0x00004550) {
        return { valid: false, reason: "assinatura PE ausente" };
    }

    const machine = view.getUint16(peOffset + 4, true);
    const optionalMagic = view.getUint16(peOffset + 24, true);

    const machineName =
        machine === 0x014c ? "x86 (32-bit)" :
        machine === 0x8664 ? "x86-64 (64-bit)" :
        "arquitetura 0x" + machine.toString(16);

    const peType =
        optionalMagic === 0x010b ? "PE32" :
        optionalMagic === 0x020b ? "PE32+" :
        "formato desconhecido";

    return {
        valid: true,
        machine,
        machineName,
        peType
    };
}

folderInput.addEventListener("change", async () => {
    const files = Array.from(folderInput.files);

    results.innerHTML = "";
    resultsPanel.classList.remove("hidden");
    exePanel.classList.add("hidden");
    nextPanel.classList.add("hidden");
    runVic2Button.classList.add("hidden");

    if (!files.length) {
        addResult("Pasta", false, "nenhum arquivo encontrado");
        return;
    }

    const entries = files.map(file => ({
        file,
        path: normalizePath(file),
        lower: normalizePath(file).toLowerCase()
    }));

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

    const findEnding = suffix =>
        entries.find(entry => entry.lower.endsWith(suffix.toLowerCase()));

    const hasPart = part =>
        entries.some(entry => entry.lower.includes(part.toLowerCase()));

    const v2game = entries.find(entry => basename(entry.path) === "v2game.exe");
    const launcher = entries.find(entry => basename(entry.path) === "victoria2.exe");

    const provinces = findEnding("/map/provinces.bmp");
    const definitions = findEnding("/map/definition.csv");
    const countries = findEnding("/common/countries.txt");
    const localisation = hasPart("/localisation/");
    const history = hasPart("/history/");
    const gfx = hasPart("/gfx/");

    addResult("Arquivos", true, files.length.toLocaleString("pt-BR"));
    addResult("Tamanho total", true, formatBytes(totalBytes));
    addResult("v2game.exe", Boolean(v2game), v2game ? "encontrado" : "não encontrado");
    addResult(
        "victoria2.exe",
        Boolean(launcher),
        launcher ? "launcher encontrado" : "não encontrado",
        !launcher
    );
    addResult("Mapa de províncias", Boolean(provinces), provinces ? "OK" : "ausente");
    addResult("definition.csv", Boolean(definitions), definitions ? "OK" : "ausente");
    addResult("countries.txt", Boolean(countries), countries ? "OK" : "ausente");
    addResult("Localisation", localisation, localisation ? "OK" : "ausente");
    addResult("History", history, history ? "OK" : "ausente");
    addResult("GFX", gfx, gfx ? "OK" : "ausente");

    if (v2game) {
        const pe = await inspectPortableExecutable(v2game.file);

        exePanel.classList.remove("hidden");

        if (!pe.valid) {
            exeInfo.textContent =
                "Encontramos v2game.exe, mas não conseguimos validar o cabeçalho: " +
                pe.reason + ".";
        } else {
            exeInfo.textContent =
                `v2game.exe é um executável Windows ${pe.machineName}, formato ${pe.peType}, ` +
                `com ${formatBytes(v2game.file.size)}.`;
        }
    }

    const coreReady =
        Boolean(v2game) &&
        Boolean(provinces) &&
        Boolean(definitions) &&
        Boolean(countries) &&
        localisation &&
        history &&
        gfx;

    nextPanel.classList.remove("hidden");

    if (coreReady) {
        nextInfo.textContent =
            "A instalação parece completa. Podemos montar um pacote local em memória e tentar iniciar diretamente o v2game.exe pelo BoxedWine.";
        runVic2Button.classList.remove("hidden");
    } else {
        nextInfo.textContent =
            "A pasta selecionada parece incompleta ou não é a raiz da instalação do Victoria II. Verifique os itens marcados como ausentes.";
    }
});
