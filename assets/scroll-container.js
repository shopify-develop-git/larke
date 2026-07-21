const PAGE_WRAPPER_SELECTOR = '.page-wrapper';
const SQUEEZE_QUERY = window.matchMedia('(min-width: 990px)');

/**
 * Returns the current page scroll container.
 * In the squeeze layout (desktop ≥990px), `.page-wrapper` is the scroll container instead of
 * `document.scrollingElement`. On mobile, the document root scrolls natively so the address bar
 * can hide/show.
 *
 * @returns {Element} The scroll container element
 */
function getScrollContainer() {
  if (SQUEEZE_QUERY.matches) {
    return document.querySelector(PAGE_WRAPPER_SELECTOR) ?? document.scrollingElement ?? document.documentElement;
  }
  return document.scrollingElement ?? document.documentElement;
}

/**
 * Returns the current scroll position of the page scroll container.
 *
 * @returns {number} The scrollTop value
 */
function getScrollTop() {
  return getScrollContainer().scrollTop;
}

/**
 * Scrolls the page scroll container to the specified position.
 *
 * @param {ScrollToOptions} options - The scroll options (top, left, behavior)
 */
function scrollTo(options) {
  getScrollContainer().scrollTo(options);
}

/**
 * Manual scroll restoration for `.page-wrapper` as scroll container.
 *
 * On desktop (≥990px), the browser restores scroll on `document.scrollingElement`, which
 * has `overflow: hidden` in the squeeze layout and can never scroll. We disable native
 * restoration and handle it via `history.state` instead.
 *
 * On mobile (<990px), `document.scrollingElement` IS the scroll container, so native
 * restoration works perfectly — leave it enabled to avoid a one-frame flash from rAF.
 *
 * Save: `pagehide` — fires exactly once per navigation, captures the exact scroll position
 * at the moment the user leaves. More accurate than debounced scroll (which can be stale
 * if the user scrolls and immediately clicks a link).
 *
 * Restore: unconditional `pageshow` — Horizon uses cross-document view transitions, so
 * `pageshow` fires on every navigation (both bfcache and fresh loads). `popstate` is not
 * used because it doesn't fire for cross-document back navigation.
 */
if (SQUEEZE_QUERY.matches) {
  history.scrollRestoration = 'manual';
}

SQUEEZE_QUERY.addEventListener('change', () => {
  history.scrollRestoration = SQUEEZE_QUERY.matches ? 'manual' : 'auto';
});

/**
 * Saves the current scroll position into the current history entry.
 */
function saveScrollPosition() {
  try {
    const currentState = typeof history.state === 'object' && history.state !== null ? history.state : {};
    history.replaceState({ ...currentState, scrollTop: getScrollContainer().scrollTop }, '');
  } catch (_) {
    // replaceState can throw if the state object exceeds the browser's size limit
  }
}

window.addEventListener('pagehide', saveScrollPosition);

/**
 * Restores a saved scroll position onto the current scroll container.
 *
 * @param {number} savedScrollTop
 */
function restoreSavedScrollTop(savedScrollTop) {
  if (!Number.isFinite(savedScrollTop) || savedScrollTop < 0) return;

  const container = getScrollContainer();
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  const targetScrollTop = Math.min(savedScrollTop, maxScrollTop);

  // Use scrollTo with 'instant' to override CSS scroll-behavior: smooth on .page-wrapper
  container.scrollTo({ top: targetScrollTop, behavior: 'instant' });
}

/**
 * LARKE PATCH — restore only on a traversal, never on a fresh navigation.
 *
 * The handler below used to run on every `pageshow`, and the comment above still says why that
 * seemed safe: with cross-document view transitions `pageshow` fires on all navigations. The gap is
 * that it never asked WHICH navigation. `pagehide` writes `scrollTop` into the history entry you are
 * leaving; if that entry is shown again for any reason other than back/forward — a reload, a link to
 * the URL you are already on, a bfcache-adjacent restore — the position is replayed onto what the
 * visitor experiences as a fresh page, and they land wherever they last were.
 *
 * Clicking a link in the FOOTER is the case that surfaces it, because it is the one place where a
 * visitor is reliably scrolled to the bottom when they navigate. The footer also links to pages the
 * footer itself appears on, so "the URL you are already on" is a normal click, not an edge case.
 *
 * Restoring scroll is only ever correct when the visitor is returning to a page they had scrolled:
 * a bfcache restore (`event.persisted`) or a back/forward traversal (navigation type
 * `back_forward`). On a plain `navigate` or `reload` the right answer is always the top of the page,
 * so this guard can only remove wrong behaviour — the back button still restores exactly as before.
 */
window.addEventListener('pageshow', (event) => {
  const navigationType = performance.getEntriesByType('navigation')[0]?.type;
  const isTraversal = event.persisted === true || navigationType === 'back_forward';
  if (!isTraversal) return;

  const scrollTop = history.state?.scrollTop;
  if (scrollTop == null) return;

  requestAnimationFrame(() => {
    restoreSavedScrollTop(scrollTop);
  });
});

/**
 * Same-document scroll restoration for pushState navigation.
 *
 * `pagehide`/`pageshow` only fire for cross-document navigations. For same-document
 * pushState navigation (filters, pagination), we patch pushState to auto-save scroll
 * position before each new entry, and restore on popstate (back/forward).
 */
const originalPushState = history.pushState.bind(history);
history.pushState = function (state, title, url) {
  saveScrollPosition();
  originalPushState(state, title, url);
};

window.addEventListener('popstate', () => {
  const scrollTop = history.state?.scrollTop;
  if (scrollTop == null) return;

  requestAnimationFrame(() => {
    restoreSavedScrollTop(scrollTop);
  });
});

/**
 * Returns the appropriate target for listening to scroll events.
 * On desktop (≥990px), `.page-wrapper` emits scroll events directly.
 * On mobile, the document root scrolls natively and scroll events bubble to `document`.
 *
 * @returns {EventTarget} The target to call addEventListener('scroll', ...) on
 */
function getScrollEventTarget() {
  if (SQUEEZE_QUERY.matches) {
    return document.querySelector(PAGE_WRAPPER_SELECTOR) ?? document;
  }
  return document;
}

/**
 * Returns the appropriate root for an IntersectionObserver monitoring the scroll container.
 * On desktop (≥990px), `.page-wrapper` must be set as the explicit root.
 * On mobile, `null` uses the viewport root (the IntersectionObserver default).
 *
 * @returns {Element | null} The root option for IntersectionObserver
 */
function getIntersectionRoot() {
  if (SQUEEZE_QUERY.matches) {
    return document.querySelector(PAGE_WRAPPER_SELECTOR) ?? null;
  }
  return null;
}

export {
  getScrollContainer,
  getScrollTop,
  scrollTo,
  getScrollEventTarget,
  getIntersectionRoot,
  SQUEEZE_QUERY as scrollContainerMediaQuery,
};
