// Entry point: top bar, footer, client router, page transitions, prefetch, service worker.
import { t, setLang, getLang, loadLocales, LANGS } from "./i18n.js";
import { appIconSvg } from "./icons.js";

// Find / Tracker / About, in visual order. Used for slide direction.
const NAV_LINKS = [
  { path: "/", key: "nav.find" },
  { path: "/tracker", key: "nav.tracker" },
  { path: "/about", key: "nav.about" },
];
const NAV_ORDER = NAV_LINKS.map((link) => link.path);
const LANG_NAMES = { en: "English", te: "తెలుగు", hi: "हिन्दी" };
const PAGE_CLASSES = ["page-enter-forward", "page-enter-back", "page-exit-forward", "page-exit-back"];

// Constant markup only; no user input is ever placed in this string.
const WORDMARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 96" role="img" aria-label="Prapti">
  <rect x="3" y="3" width="294" height="90" rx="44" fill="#ffffff" stroke="#1e3a5f" stroke-width="3"/>
  <path d="M40 22 L52 36 L64 24 M96 74 L104 60 L118 70 M230 20 L220 34 L236 42 M262 70 L252 82 M22 62 L34 56" fill="none" stroke="#e8eff8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="150" y="60" text-anchor="middle" font-family="'Anek Latin', system-ui, sans-serif" font-weight="700" font-size="36" fill="#1e3a5f">Prapti</text>
</svg>`;

const topbar = document.getElementById("topbar");
const app = document.getElementById("app");
const footer = document.getElementById("footer");
const live = document.getElementById("live");

const prefetched = new Set();
let currentPath = normalizePath(location.pathname);
let renderToken = 0;

function el(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function normalizePath(path) {
  const clean = path.replace(/\/+$/, "");
  return clean || "/";
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch (err) {
    return value;
  }
}

// ---- Page stubs (real pages replace these via registerRoute) ----

function homeStub(container) {
  container.append(el("h1", t("home.headline")), el("p", t("page.loading")));
}

function stubFor(titleKey) {
  return (container) => {
    container.append(el("h1", t(titleKey)), el("p", t("page.loading")));
  };
}

// ---- Route registry ----

const routes = {
  "/": homeStub,
  "/results": stubFor("page.title.results"),
  "/scheme/:id": stubFor("page.title.scheme"),
  "/mee-seva": stubFor("page.title.meeseva"),
  "/tracker": stubFor("page.title.tracker"),
  "/about": stubFor("page.title.about"),
  "/rules-check": stubFor("page.title.rulesCheck"),
  "/helper": stubFor("page.title.helper"),
  "/editor": stubFor("page.title.editor"),
  "/demo": stubFor("page.title.demo"),
};

// Translation key for each route's document title (null = app name only).
const routeTitles = {
  "/": null,
  "/results": "page.title.results",
  "/scheme/:id": "page.title.scheme",
  "/mee-seva": "page.title.meeseva",
  "/tracker": "page.title.tracker",
  "/about": "page.title.about",
  "/rules-check": "page.title.rulesCheck",
  "/helper": "page.title.helper",
  "/editor": "page.title.editor",
  "/demo": "page.title.demo",
};

export function registerRoute(pattern, renderFn, titleKey = null) {
  routes[pattern] = renderFn;
  routeTitles[pattern] = titleKey;
}

function matchRoute(path) {
  const parts = path.split("/").filter(Boolean);
  for (const pattern of Object.keys(routes)) {
    const segments = pattern.split("/").filter(Boolean);
    if (segments.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < segments.length && ok; i += 1) {
      if (segments[i].startsWith(":")) {
        params[segments[i].slice(1)] = safeDecode(parts[i]);
      } else if (segments[i] !== parts[i]) {
        ok = false;
      }
    }
    if (ok) return { pattern, params };
  }
  return null;
}

// ---- Rendering ----

function clearPageClasses() {
  app.classList.remove(...PAGE_CLASSES);
}

function onAppAnimationEnd(event) {
  if (event.target === app) clearPageClasses();
}

function pageDirection(from, to) {
  const a = NAV_ORDER.indexOf(from);
  const b = NAV_ORDER.indexOf(to);
  if (a < 0 || b < 0 || a === b) return null;
  return b > a ? "page-enter-forward" : "page-enter-back";
}

function updateNavCurrent() {
  const links = topbar.querySelectorAll(".nav-menu a");
  links.forEach((link, i) => {
    if (NAV_LINKS[i] && NAV_LINKS[i].path === currentPath) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function updatePill() {
  const menu = topbar.querySelector(".nav-menu");
  if (!menu) return;
  const current = menu.querySelector('a[aria-current="page"]');
  if (!current) {
    menu.style.setProperty("--pill-w", "0px");
    return;
  }
  menu.style.setProperty("--pill-x", `${current.offsetLeft}px`);
  menu.style.setProperty("--pill-w", `${current.offsetWidth}px`);
}

async function renderRoute(path, { focus = true, direction = null } = {}) {
  const token = ++renderToken;
  currentPath = path;
  const match = matchRoute(path);

  app.textContent = "";
  clearPageClasses();
  if (direction) {
    // Reflow so the animation restarts even when the same class is set again.
    void app.offsetWidth;
    app.classList.add(direction);
  }

  let title = `${t("page.notFound")} · ${t("app.name")}`;
  if (match) {
    const titleKey = routeTitles[match.pattern];
    title = titleKey ? `${t(titleKey)} · ${t("app.name")}` : t("app.name");
    try {
      await routes[match.pattern](app, match.params);
    } catch (err) {
      if (token !== renderToken) return;
      app.textContent = "";
      app.append(el("h1", t("page.notFound")));
      title = `${t("page.notFound")} · ${t("app.name")}`;
    }
  } else {
    app.append(el("h1", t("page.notFound")));
  }
  if (token !== renderToken) return;

  const heading = app.querySelector("h1");
  if (heading) {
    heading.tabIndex = -1;
    if (focus) heading.focus();
  }
  document.title = title;
  if (focus) live.textContent = title;
  updateNavCurrent();
  updatePill();
}

function navigateTo(href, push = true) {
  const url = new URL(href, location.href);
  const path = normalizePath(url.pathname);
  const target = path + url.search + url.hash;
  const from = currentPath;
  if (push) {
    if (target !== location.pathname + location.search + location.hash) {
      history.pushState(null, "", target);
    }
    window.scrollTo(0, 0);
  }
  renderRoute(path, { focus: true, direction: pageDirection(from, path) });
}

// ---- Top bar and footer ----

function renderTopbar() {
  topbar.textContent = "";

  const brand = document.createElement("a");
  brand.className = "brand";
  brand.href = "/";
  brand.innerHTML = appIconSvg(32);
  brand.append(el("span", t("app.name")));

  const nav = document.createElement("nav");
  const menu = document.createElement("div");
  menu.className = "nav-menu";
  const pill = document.createElement("span");
  pill.className = "nav-pill";
  pill.setAttribute("aria-hidden", "true");
  menu.appendChild(pill);
  for (const item of NAV_LINKS) {
    const link = el("a", t(item.key));
    link.href = item.path;
    if (item.path === currentPath) link.setAttribute("aria-current", "page");
    menu.appendChild(link);
  }
  nav.appendChild(menu);

  const langGroup = document.createElement("div");
  langGroup.className = "lang-switch";
  langGroup.setAttribute("role", "group");
  langGroup.setAttribute("aria-label", t("lang.label"));
  const active = getLang();
  for (const code of LANGS) {
    const button = el("button", t(`lang.${code}`));
    button.type = "button";
    button.lang = code;
    button.setAttribute("aria-label", `${t("lang.label")}: ${LANG_NAMES[code]}`);
    button.setAttribute("aria-pressed", String(code === active));
    button.addEventListener("click", () => setLang(code));
    langGroup.appendChild(button);
  }

  topbar.append(brand, nav, langGroup);
  updatePill();
}

function renderFooter() {
  footer.textContent = "";
  const inner = document.createElement("div");
  inner.className = "footer-inner";

  const holder = document.createElement("div");
  holder.innerHTML = WORDMARK_SVG;
  const mark = holder.firstElementChild;
  mark.setAttribute("class", "wordmark");

  const text = el("p", t("footer.text"));

  const nav = document.createElement("nav");
  nav.className = "footer-nav";
  const list = document.createElement("ul");
  const links = [
    ["/about", "nav.about"],
    ["/rules-check", "page.title.rulesCheck"],
  ];
  for (const [href, key] of links) {
    const item = document.createElement("li");
    const link = el("a", t(key));
    link.href = href;
    item.appendChild(link);
    list.appendChild(item);
  }
  nav.appendChild(list);

  inner.append(mark, text, nav);
  footer.appendChild(inner);
}

// ---- Language change ----

async function onLangChange() {
  try {
    await loadLocales();
  } catch (err) {
    // Keep whatever is already loaded; t() falls back to English, then the key.
  }
  renderTopbar();
  renderFooter();
  await renderRoute(currentPath, { focus: false });
  const button = topbar.querySelector(`.lang-switch button[lang="${getLang()}"]`);
  if (button) button.focus();
}

// ---- Links, history, prefetch ----

function internalHref(anchor) {
  if (!anchor || !anchor.hasAttribute("href")) return null;
  const href = anchor.getAttribute("href");
  if (!href.startsWith("/") || href.startsWith("//") || anchor.hasAttribute("target")) return null;
  return href;
}

function closestAnchor(target) {
  return target instanceof Element ? target.closest("a[href]") : null;
}

function onDocumentClick(event) {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const href = internalHref(closestAnchor(event.target));
  if (!href) return;
  event.preventDefault();
  navigateTo(href, true);
}

function onPrefetchIntent(event) {
  const href = internalHref(closestAnchor(event.target));
  if (!href || prefetched.has(href)) return;
  prefetched.add(href);
  const link = document.createElement("link");
  link.rel = "prefetch";
  link.href = href;
  document.head.appendChild(link);
}

function onPopState() {
  navigateTo(location.href, false);
}

// ---- Start ----

async function init() {
  try {
    await loadLocales();
  } catch (err) {
    // t() falls back to English, then to the key itself.
  }
  document.documentElement.lang = getLang();
  renderTopbar();
  renderFooter();
  await renderRoute(currentPath, { focus: false });

  document.addEventListener("click", onDocumentClick);
  document.addEventListener("pointerenter", onPrefetchIntent, true);
  document.addEventListener("focusin", onPrefetchIntent);
  window.addEventListener("popstate", onPopState);
  window.addEventListener("prapti:lang", onLangChange);
  window.addEventListener("resize", updatePill);
  app.addEventListener("animationend", onAppAnimationEnd);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(updatePill).catch(() => {});
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}

init();
