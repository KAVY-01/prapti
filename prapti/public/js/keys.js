// Number-key shortcuts: pressing 1-9 picks the matching option button,
// unless the user is typing in a field or a modifier key is held.

const EDITABLE_SELECTOR = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

function isTyping() {
  const el = document.activeElement;
  if (!el) return false;
  if (el.isContentEditable) return true;
  return el.matches(EDITABLE_SELECTOR);
}

export function bindNumberKeys(getOptionButtons, onPick) {
  function onKeydown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.defaultPrevented || isTyping()) return;
    if (!/^[1-9]$/.test(event.key)) return;

    const buttons = getOptionButtons() || [];
    const index = Number(event.key) - 1;
    if (index >= buttons.length) return;

    event.preventDefault();
    onPick(index);
  }

  document.addEventListener("keydown", onKeydown);
  return function unbindNumberKeys() {
    document.removeEventListener("keydown", onKeydown);
  };
}
