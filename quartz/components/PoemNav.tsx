import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { resolveRelative, FullSlug } from "../util/path"
import { classNames } from "../util/lang"
// @ts-ignore
import script from "./scripts/poemnav.inline"

/**
 * "Return to the poem" (back to the exact stanza the reader left from)
 * plus the reader's recent trail through the atlas.
 */
export default (() => {
  const PoemNav: QuartzComponent = ({ fileData, displayClass }: QuartzComponentProps) => {
    const isRef = fileData.slug?.startsWith("refs/")
    return (
      <nav class={classNames(displayClass, "poem-nav")}>
        {isRef && (
          <a class="return-to-poem internal" href={resolveRelative(fileData.slug!, "index" as FullSlug)}>
            ↩ Return to the poem
          </a>
        )}
        <ol class="reading-trail" aria-label="Your path through the atlas"></ol>
      </nav>
    )
  }

  PoemNav.afterDOMLoaded = script
  PoemNav.css = `
.poem-nav { margin: 1rem 0 0.5rem; font-size: 0.85rem; }
.poem-nav .return-to-poem {
  display: inline-block; padding: 0.35rem 0.8rem; margin-bottom: 0.6rem;
  border: 1px solid var(--secondary); border-radius: 999px; background: none;
  color: var(--secondary); font-weight: normal;
}
.poem-nav .return-to-poem:hover { background: var(--highlight); }
.poem-nav .reading-trail {
  list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 0.2rem 0;
  color: var(--gray);
}
.poem-nav .reading-trail:empty { display: none; }
.poem-nav .reading-trail li + li::before { content: "→"; margin: 0 0.4rem; }
.poem-nav .reading-trail li:last-child { color: var(--darkgray); }
.poem-nav .reading-trail a { background: none; padding: 0; color: var(--gray); font-weight: normal; }
.poem-nav .reading-trail a:hover { color: var(--secondary); }
`
  return PoemNav
}) satisfies QuartzComponentConstructor
