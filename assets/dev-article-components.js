/* dev-article-components.js
   Copy buttons on the component library page. Two kinds:
     [data-copy="<id>"]      copies the text of the element with that id (a whole example)
     [data-copy-text="…"]    copies the attribute's own text (one icon shortcode)
   The button's [data-copy-label] reads "Copied" for 1.5s as confirmation. Text only, via
   textContent — nothing is ever written back as HTML. */
(function () {
  const RESET_MS = 1500;

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-components]').forEach((root) => init(root));
  });

  function init(root) {
    root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-copy], [data-copy-text]');
      if (!button || !root.contains(button)) return;

      let text = button.getAttribute('data-copy-text');
      if (text === null) {
        const source = document.getElementById(button.getAttribute('data-copy'));
        if (!source) return;
        text = source.textContent;
      }

      copy(text).then(() => confirm(button), () => {});
    });
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback for non-secure contexts (e.g. the theme preview over plain http).
    return new Promise((resolve, reject) => {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      if (ok) resolve();
      else reject();
    });
  }

  function confirm(button) {
    const label = button.querySelector('[data-copy-label]');
    if (!label) return;
    if (!button.dataset.label) button.dataset.label = label.textContent;
    label.textContent = 'Copied';
    button.setAttribute('data-copied', '');
    clearTimeout(button._copyTimer);
    button._copyTimer = setTimeout(() => {
      label.textContent = button.dataset.label;
      button.removeAttribute('data-copied');
    }, RESET_MS);
  }
})();
