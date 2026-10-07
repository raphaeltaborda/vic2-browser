const folderInput = document.getElementById("game-folder");
const status = document.getElementById("status");

folderInput.addEventListener("change", () => {
    const files = Array.from(folderInput.files);

    if (files.length === 0) {
        status.textContent = "Nenhuma pasta selecionada.";
        return;
    }

    const paths = files.map(file =>
        file.webkitRelativePath.replaceAll("\\", "/")
    );

    const provincesFound = paths.some(path =>
        path.endsWith("/map/provinces.bmp")
    );

    const definitionFound = paths.some(path =>
        path.endsWith("/map/definition.csv")
    );

    status.innerHTML = [
        `Arquivos encontrados: <strong>${files.length}</strong>`,
        `map/provinces.bmp: <strong>${provincesFound ? "OK" : "não encontrado"}</strong>`,
        `map/definition.csv: <strong>${definitionFound ? "OK" : "não encontrado"}</strong>`
    ].join("<br>");
});
