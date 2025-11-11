"use strict";

/**
 * MIKESX — main.js (random-first + fill-to-120% + simple infinite scroll)
 * VERSIÓN MEJORADA con optimizaciones de rendimiento y seguridad
 * -----------------------------------------------------------------------
 * - Carga manifest.json y pinta TODOS los CDs una vez, en orden aleatorio.
 * - Si no hay suficiente contenido, rellena hasta cubrir ~FILL_FACTOR * 100% del viewport
 *   añadiendo lotes (con posibles repeticiones) tomados de un pool circular re-barajable.
 * - Scroll infinito simple: cuando el usuario se acerca al final, añade otro lote.
 * - Eliminado el menú de ordenación y cualquier lógica asociada.
 * 
 * MEJORAS IMPLEMENTADAS:
 * - Debouncing en resize para evitar renderizados innecesarios
 * - Throttling en scroll con requestAnimationFrame
 * - Límite más robusto en ensureMinFill() para evitar bucles excesivos
 * - Mejor manejo de errores con feedback al usuario
 * - Pool triple para reducir frecuencia de re-barajado
 * - Documentación JSDoc completa
 */

/* ===================== DOM refs ============================= */
const stack = document.getElementById("cdStack");
const host  = document.getElementById("scrollHost");
const tpl   = document.getElementById("cdTemplate");

/* ===================== Config (tweakables) ================== */
/** Tamaño del lote para rellenar / infinito */
const BATCH_SIZE  = 8;
/** Umbral "cerca del final". 0.2 = al pasar el 80% del scroll */
const THRESHOLD   = 0.2;
/** Factor de relleno mínimo del alto de ventana (1.2 = 120% de dvh) */
const FILL_FACTOR = 1.2;
/** Tiempo de debounce para resize (ms) */
const RESIZE_DEBOUNCE = 150;

/* ===================== Estado =============================== */
/** @type {Array<CDItem>} */
let manifest = [];
/** Pool barajado (se recorre en bucle para crear lotes extra) */
let pool = [];
/** Puntero dentro del pool circular */
let poolPtr = 0;
/** Control de listeners para no duplicarlos accidentalmente */
let _scrollBound = false;
/** Timer para debouncing de resize */
let resizeTimer = null;
/** Flag para throttling de scroll */
let scrollTicking = false;

/* ===================== Bootstrap ============================ */
init().catch((err) => {
  console.error("Fallo al inicializar:", err);
  if (stack) {
    stack.innerHTML = `
      <div class="cd-error">
        <p>No se pudieron cargar los proyectos.</p>
        <p>Por favor, recarga la página o verifica tu conexión.</p>
      </div>`;
  }
});

/**
 * Punto de entrada.
 * 1) Carga manifest y lo normaliza.
 * 2) Pinta TODOS los ítems 1 vez en orden aleatorio.
 * 3) Rellena hasta ~FILL_FACTOR * 100% del viewport si no hay overflow.
 * 4) Activa scroll infinito simple.
 */
async function init() {
  const perfStart = performance.now();
  
  const m = await fetchJSON("manifest.json");
  manifest = (m.items || []).map((it, idx) => normalizeItem(it, idx));

  if (manifest.length === 0) {
    console.warn("El manifiesto está vacío");
    if (stack) {
      stack.innerHTML = '<div class="cd-error">No hay proyectos disponibles.</div>';
    }
    return;
  }

  // 1) Respetar el orden del manifest en la primera pasada
  const orderedOnce = [...manifest];

  // 2) Render: primera pasada (todos una vez, orden del manifest)
  renderInitial(orderedOnce);

  // 3) Preparar pool circular para rellenos (triple pool para reducir re-barajados)
  pool = shuffle([...manifest, ...manifest, ...manifest]);
  poolPtr = 0;

  // 4) Asegurar overflow mínimo (~FILL_FACTOR * viewport)
  ensureMinFill();

  // 5) Activar scroll infinito
  enableInfiniteScroll();
  
  const perfEnd = performance.now();
  console.log(`✓ Inicialización completada en ${(perfEnd - perfStart).toFixed(2)}ms`);
  console.log(`✓ Total de CDs renderizados: ${stack.children.length}`);
  console.log(`✓ Proyectos en catálogo: ${manifest.length}`);
}

/* ===================== Normalización ======================== */
/**
 * Normaliza un item del manifest a nuestra estructura interna.
 * @param {Partial<CDItem>} it - Item crudo del manifest
 * @param {number} idx - Índice del item
 * @returns {CDItem} Item normalizado
 */
function normalizeItem(it, idx) {
  return {
    id: it.id ?? String(idx),
    title: it.title || "",
    label: it.label || "",
    src: it.src || "",
    artist: it.artist || "",
    cover: it.cover || it.coverLink || it.cover_url || "",
  };
}

/* ===================== Render =============================== */
/**
 * Pinta una pasada completa (todos los ítems) en el orden dado.
 * Usa DocumentFragment para optimizar la inserción en el DOM.
 * @param {Array<CDItem>} list - Lista de items a renderizar
 */
function renderInitial(list) {
  if (!stack) return;
  stack.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const item of list) {
    frag.appendChild(makeCD(item));
  }
  stack.appendChild(frag);
}

/**
 * Asegura que el contenedor tenga al menos ~FILL_FACTOR * 100% del alto de ventana.
 * Rellena en tandas de BATCH_SIZE (con posibles repeticiones) hasta alcanzar la meta.
 * Incluye límite de seguridad basado en elementos, no iteraciones arbitrarias.
 */
function ensureMinFill() {
  if (!host || manifest.length === 0) return;
  
  const targetPx = Math.ceil(window.innerHeight * FILL_FACTOR);
  
  // Límite conservador: máximo 10 repeticiones del catálogo completo
  const maxElements = Math.min(200, manifest.length * 10);
  let addedCount = 0;

  while (host.scrollHeight < targetPx && addedCount < maxElements) {
    appendBatch(BATCH_SIZE);
    addedCount += BATCH_SIZE;
  }
  
  if (addedCount >= maxElements) {
    console.warn(`⚠ Límite de relleno alcanzado: ${addedCount} elementos añadidos`);
  }
}

/**
 * Añade un lote de N elementos al final del stack.
 * Los elementos se toman del pool circular, que se re-baraja al agotarse.
 * Usa DocumentFragment para optimizar la inserción.
 * @param {number} n - Número de elementos a añadir
 */
function appendBatch(n) {
  if (!stack || pool.length === 0) return;

  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    if (poolPtr >= pool.length) {
      poolPtr = 0;
      // Re-barajar el pool para evitar patrones repetitivos
      pool = shuffle(pool);
    }
    const item = pool[poolPtr++];
    frag.appendChild(makeCD(item));
  }
  stack.appendChild(frag);
}

/**
 * Verifica si el usuario está cerca del final y carga más contenido si es necesario.
 * Separada de onHostScroll() para permitir throttling.
 */
function checkAndAppend() {
  if (!host) return;
  const { scrollTop, scrollHeight, clientHeight } = host;
  const nearBottom = (scrollTop + clientHeight) / scrollHeight >= (1 - THRESHOLD);
  if (nearBottom) {
    appendBatch(BATCH_SIZE);
  }
}

/**
 * Listener de scroll con throttling usando requestAnimationFrame.
 * Evita cálculos innecesarios en cada evento de scroll.
 */
function onHostScroll() {
  if (!scrollTicking) {
    window.requestAnimationFrame(() => {
      checkAndAppend();
      scrollTicking = false;
    });
    scrollTicking = true;
  }
}

/**
 * Listener de resize con debouncing.
 * Espera a que el usuario termine de redimensionar antes de recalcular.
 */
function onResize() {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    ensureMinFill();
    resizeTimer = null;
  }, RESIZE_DEBOUNCE);
}

/**
 * Activa los listeners de scroll infinito y resize.
 * Incluye flag de control para evitar duplicación de listeners.
 */
function enableInfiniteScroll() {
  if (!host || _scrollBound) return;
  host.addEventListener("scroll", onHostScroll, { passive: true });
  window.addEventListener("resize", onResize);
  _scrollBound = true;

  // Llamada inicial por si al render ya estamos "abajo" en pantallas muy altas
  checkAndAppend();
}

/**
 * Desactiva los listeners de scroll infinito.
 * Útil si se necesita limpiar recursos o cambiar de modo.
 */
function disableInfiniteScroll() {
  if (!host || !_scrollBound) return;
  host.removeEventListener("scroll", onHostScroll);
  window.removeEventListener("resize", onResize);
  _scrollBound = false;
}

/* ===================== Vistas =============================== */
/**
 * Genera el nodo DOM de un CD listo para insertar.
 * Clona el template y lo personaliza con los datos del item.
 * @param {CDItem} item - Datos del proyecto
 * @returns {HTMLAnchorElement} Nodo del CD
 */
function makeCD(item) {
  const node =
    tpl && tpl.content
      ? tpl.content.firstElementChild.cloneNode(true)
      : document.createElement("a");

  if (!node.classList.contains("cd")) node.classList.add("cd");
  node.dataset.type = "real";

  // Imagen lateral
  const img = node.querySelector ? node.querySelector(".label-img") : null;
  if (img && item.label) {
    img.src = item.label;
    img.alt = (item.artist ? item.artist + " — " : "") + (item.title || "");
    img.loading = "lazy";
    if (item.cover)  node.dataset.cover  = item.cover;
    if (item.artist) node.dataset.artist = item.artist;
  } else if (img) {
    img.remove();
  }

  // Enlace a la página de proyecto
  node.href = `proyecto.html?id=${encodeURIComponent(item.id)}`;
  node.setAttribute(
    "aria-label",
    (item.artist ? item.artist + " — " : "") + (item.title || item.id || "proyecto")
  );

  return node;
}

/* ===================== Utilidades =========================== */
/**
 * Fetch JSON con manejo de errores mejorado.
 * @template T
 * @param {string} url - URL del recurso JSON
 * @returns {Promise<T>} Datos parseados
 * @throws {Error} Si la petición falla
 */
async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Error ${res.status}: No se pudo cargar ${url}`);
    }
    return await res.json();
  } catch (err) {
    console.error(`Error al cargar ${url}:`, err);
    throw err;
  }
}

/**
 * Baraja un array usando el algoritmo Fisher-Yates.
 * Modifica el array in-place y lo retorna.
 * @template T
 * @param {Array<T>} arr - Array a barajar
 * @returns {Array<T>} El mismo array barajado
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ===================== Tipos JSDoc ========================== */
/**
 * @typedef {Object} CDItem
 * @property {string} id - Identificador único del proyecto
 * @property {string} title - Título del proyecto
 * @property {string} label - Ruta de la imagen lateral del CD
 * @property {string} src - Ruta al JSON de detalle del proyecto
 * @property {string} artist - Nombre del artista
 * @property {string} cover - Ruta de la imagen de portada
 */
