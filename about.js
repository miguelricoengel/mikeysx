init();
async function init() {
  try {
    const data = await (await fetch("data/about.json")).json();
    document.getElementById("aTitle").textContent = data.title || "About";
    document.getElementById("aBody").innerHTML =
      (data.html || "").trim() || `<p>${data.text || ""}</p>`;
  } catch (e) {
    document.getElementById("aBody").textContent =
      "Añade data/about.json para personalizar este texto.";
  }
}
