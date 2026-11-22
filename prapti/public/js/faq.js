// FAQ with pill tabs and sliding panels. Plain DOM; all text set via textContent.

const SLIDE_FALLBACK_MS = 800;

export function mountFaq(container, items) {
  if (!container || !Array.isArray(items) || items.length === 0) return () => {};

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const tabs = [];
  const panels = [];
  const closeTimers = new Map();
  let active = 0;

  container.textContent = "";

  const tablist = document.createElement("div");
  tablist.className = "pill-tabs";
  tablist.setAttribute("role", "tablist");

  function finishClose(index) {
    clearTimeout(closeTimers.get(index));
    closeTimers.delete(index);
    if (index !== active) panels[index].hidden = true;
  }

  function openPanel(index) {
    const panel = panels[index];
    clearTimeout(closeTimers.get(index));
    closeTimers.delete(index);
    panel.hidden = false;
    if (!reduceMotion.matches) {
      // Force a layout so the browser sees the closed state before the class changes.
      void panel.offsetHeight;
    }
    panel.classList.add("is-open");
  }

  function closePanel(index) {
    const panel = panels[index];
    panel.classList.remove("is-open");
    if (reduceMotion.matches) {
      finishClose(index);
      return;
    }
    const onEnd = (event) => {
      if (event.target !== panel || event.propertyName !== "grid-template-rows") return;
      panel.removeEventListener("transitionend", onEnd);
      finishClose(index);
    };
    panel.addEventListener("transitionend", onEnd);
    closeTimers.set(index, setTimeout(() => {
      panel.removeEventListener("transitionend", onEnd);
      finishClose(index);
    }, SLIDE_FALLBACK_MS));
  }

  function activate(index, moveFocus) {
    if (index < 0 || index >= items.length) return;
    const previous = active;
    active = index;
    tabs.forEach((tab, i) => {
      const selected = i === index;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    if (moveFocus) tabs[index].focus();
    if (previous !== index) {
      closePanel(previous);
      openPanel(index);
    }
  }

  function onTabKeydown(event, index) {
    let next = null;
    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    if (next === null) return;
    event.preventDefault();
    activate(next, true);
  }

  items.forEach((item, index) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "pill-tab";
    tab.id = `faq-tab-${item.id}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `faq-panel-${item.id}`);
    tab.setAttribute("aria-selected", "false");
    tab.tabIndex = -1;
    tab.textContent = item.tab;
    tab.addEventListener("click", () => activate(index, false));
    tab.addEventListener("keydown", (event) => onTabKeydown(event, index));
    tabs.push(tab);
    tablist.appendChild(tab);
  });

  container.appendChild(tablist);

  items.forEach((item, index) => {
    const panel = document.createElement("div");
    panel.className = "faq-panel";
    panel.id = `faq-panel-${item.id}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", `faq-tab-${item.id}`);

    const inner = document.createElement("div");
    const body = document.createElement("div");
    body.className = "faq-body";

    const question = document.createElement("h3");
    question.textContent = item.question;
    const answer = document.createElement("p");
    answer.textContent = item.answer;

    body.append(question, answer);
    inner.appendChild(body);
    panel.appendChild(inner);
    panel.hidden = index !== 0;
    panels.push(panel);
    container.appendChild(panel);
  });

  tabs[0].setAttribute("aria-selected", "true");
  tabs[0].tabIndex = 0;
  panels[0].classList.add("is-open");

  return function unmountFaq() {
    closeTimers.forEach((timer) => clearTimeout(timer));
    closeTimers.clear();
    container.textContent = "";
  };
}
