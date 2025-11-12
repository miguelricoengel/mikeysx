init();
async function init() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const m = await (await fetch("manifest.json")).json();
  const items = m.items || [];
  let item = items.find((it) => String(it.id ?? "") === String(id));
  
  if (!item) {
    // Si no se encuentra, redirigir a la home o usar el primer elemento
    window.location.href = 'index.html';
    return;
  }
  
  // Cargar el JSON de detalle del proyecto
  let data = {};
  if (item.src) {
    try {
      data = await (await fetch(item.src)).json();
    } catch (e) {
      console.warn(e);
      // Si falla la carga del JSON de detalle, usamos los datos del manifest como fallback
      data = item;
    }
  } else {
    data = item;
  }

// Stage + fondo blur con la 1ª imagen de la galería (fallback: data.bg)
const stage = document.getElementById("projectStage");

// Normalizamos la lista de imágenes (quitamos falsy/strings vacíos)
const images = (Array.isArray(data.images) ? data.images : [])
  .map(s => typeof s === "string" ? s.trim() : s)
  .filter(Boolean);

const coverSrc = images[0] || data.bg || null;
if (coverSrc) {
  stage.style.setProperty('--stage-bg', `url("${coverSrc}")`);
}

document.getElementById("pTitle").textContent = data.title || "Sin título";
document.getElementById("pArtist").textContent = data.artist || "";
document.getElementById("pYear").textContent = data.year || "";
document.getElementById("pDesc").textContent = data.description || "";
document.title = (data.title || "PROYECTO").toUpperCase();

// Inserta el enlace pequeño cuando el proyecto es "mikesx"
if ((id || "").toLowerCase() === "mikesx") {
  const card = document.querySelector(".project-card");
  const backBtn = card?.querySelector(".back-btn");
  if (card) {
    const footnote = document.createElement("p");
    footnote.className = "project-footnote";
    footnote.innerHTML = `web: <a href="https://meowrhino.github.io/becasDigMeow/" target="_blank" rel="noopener noreferrer">meowrhino</a>`;
    if (backBtn) {
      card.insertBefore(footnote, backBtn);
    } else {
      card.appendChild(footnote);
    }
  }
}

// Lógica para la galería de imágenes con scroll lateral
const gallery = document.getElementById("imageGallery");

if (images.length > 0) {
  images.forEach((src, index) => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = `${data.title || 'Proyecto'} - Imagen ${index + 1}`;
    img.classList.add('gallery-image');
    if (index === 0) {
      img.classList.add('cover-image'); // Para centrar la primera imagen
    }
    gallery.appendChild(img);
  });
} else {
  // Ocultamos el contenedor si no hay imágenes
  gallery.style.display = "none";
}

// --- Lightbox simple (sin dependencias) -----------------------
// Crear contenedor único
const lb = document.createElement('div');
lb.className = 'lightbox';
lb.setAttribute('aria-hidden', 'true');
lb.style.display = 'none';
lb.innerHTML = `
  <button class="lightbox-close" aria-label="Cerrar">×</button>
  <img class="lightbox-img" alt="" />
`;
document.body.appendChild(lb);

const lbImg = lb.querySelector('.lightbox-img');
const lbClose = lb.querySelector('.lightbox-close');
let scrollLockY = 0;

function lockScroll() {
  scrollLockY = window.scrollY || window.pageYOffset || 0;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollLockY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
}
function unlockScroll() {
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  window.scrollTo(0, scrollLockY);
}

function openLightbox(src, alt) {
  lbImg.src = src;
  lbImg.alt = alt || '';
  lb.style.display = 'flex';
  lb.setAttribute('aria-hidden', 'false');
  document.documentElement.classList.add('has-lightbox');
  lockScroll();
  document.addEventListener('keydown', onKeyDown);
}
function closeLightbox() {
  lb.style.display = 'none';
  lb.setAttribute('aria-hidden', 'true');
  document.documentElement.classList.remove('has-lightbox');
  document.removeEventListener('keydown', onKeyDown);
  // limpiar src para liberar memoria en móviles
  lbImg.removeAttribute('src');
  unlockScroll();
}
function onKeyDown(ev) {
  if (ev.key === 'Escape') closeLightbox();
}

// Cierre por botón y por clic en fondo (no sobre la imagen)
lbClose.addEventListener('click', closeLightbox);
lb.addEventListener('click', (ev) => {
  if (ev.target === lb) closeLightbox();
});

// Delegación: abrir al clicar cualquier imagen de la galería
gallery.addEventListener('click', (ev) => {
  const img = ev.target.closest('.gallery-image');
  if (!img) return;
  openLightbox(img.src, img.alt);
});
}
