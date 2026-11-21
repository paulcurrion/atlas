import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
// @ts-ignore
import script from "./scripts/referencepanel.inline"

/**
 * On poem pages, clicking a reference opens it here, under the graph,
 * instead of navigating away from the poem.
 */
export default (() => {
  const ReferencePanel: QuartzComponent = ({ displayClass }: QuartzComponentProps) => (
    <aside class={classNames(displayClass, "reference-panel", "empty")} aria-live="polite" aria-label="Reference">
      <p class="reference-hint">Choose a highlighted phrase to read its reference here.</p>
    </aside>
  )

  ReferencePanel.afterDOMLoaded = script
  ReferencePanel.css = `
.reference-panel {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 0.25rem;
}
.reference-panel .reference-hint { color: var(--gray); font-size: 0.9rem; font-style: italic; margin: 0; }
.reference-panel.loading { opacity: 0.5; transition: opacity 0.2s; }

.reference-panel .ref-head { display: flex; align-items: flex-start; gap: 0.5rem; }
.reference-panel .ref-label {
  font-size: 0.7rem; letter-spacing: 0.15em; text-transform: uppercase; color: var(--gray);
}
.reference-panel h2 {
  flex: 1; margin: 0.15rem 0 0.4rem; font-size: 1.35rem; font-weight: 500; color: var(--dark); line-height: 1.2;
}
.reference-panel h2:focus { outline: none; }
.reference-panel .ref-close {
  background: none; border: 1px solid var(--lightgray); border-radius: 999px; color: var(--gray);
  width: 1.9rem; height: 1.9rem; line-height: 1; font-size: 1.1rem; cursor: pointer; flex: none;
}
.reference-panel .ref-close:hover, .reference-panel .ref-close:focus-visible {
  color: var(--secondary); border-color: var(--secondary); outline: none;
}
.reference-panel .tags { margin: 0 0 0.5rem; padding: 0; }
.reference-panel .in-the-poem { margin: 0.75rem 0 1rem; }
.reference-panel .in-the-poem .poem-line { font-size: 0.95rem; }
.reference-panel .ref-body { font-size: 1rem; line-height: 1.6; color: var(--darkgray); }
.reference-panel .ref-body p { margin: 0 0 0.8rem; }
.reference-panel .ref-body a.internal {
  background: none; padding: 0; font-weight: normal; color: var(--secondary);
  border-bottom: 1px solid rgba(143, 211, 220, 0.35);
}
.reference-panel .ref-page {
  display: inline-block; margin-top: 0.5rem; font-size: 0.85rem; background: none; padding: 0;
  color: var(--gray); font-weight: normal;
}
.reference-panel .ref-page:hover { color: var(--secondary); }

/* the phrase whose reference is open */
article a.internal.ref-active {
  text-shadow: 0 0 12px rgba(143, 211, 220, 0.7);
  border-bottom-color: var(--secondary);
  background-color: var(--highlight);
}

/* tablet and phone: the right column drops below the poem, so the panel
   slides up from the bottom of the screen instead */
@media all and (max-width: 1200px) {
  .reference-panel.empty { display: none; }
  .reference-panel {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 100;
    max-height: 62vh; padding: 1rem 1.25rem 1.5rem;
    background: var(--light); border-top: 1px solid var(--secondary);
    border-radius: 14px 14px 0 0; box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.7);
    flex: none;
  }
}
`
  return ReferencePanel
}) satisfies QuartzComponentConstructor
