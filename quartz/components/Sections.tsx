import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { resolveRelative } from "../util/path"
import { classNames } from "../util/lang"

/**
 * The left-hand menu: the sections of the poem, in order, and nothing else.
 */
export default (() => {
  const Sections: QuartzComponent = ({ fileData, allFiles, displayClass }: QuartzComponentProps) => {
    const sections = allFiles
      .filter((f) => f.slug?.startsWith("poem/") && f.slug !== "poem/index")
      .sort((a, b) => a.slug!.localeCompare(b.slug!, undefined, { numeric: true }))

    return (
      <nav class={classNames(displayClass, "poem-sections")} aria-label="Sections of the poem">
        <ol>
          {sections.map((f) => (
            <li>
              <a
                href={resolveRelative(fileData.slug!, f.slug!)}
                class={f.slug === fileData.slug ? "internal active" : "internal"}
                aria-current={f.slug === fileData.slug ? "page" : undefined}
              >
                {f.frontmatter?.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    )
  }

  Sections.css = `
.poem-sections ol { list-style: none; margin: 0.5rem 0 0; padding: 0; }
.poem-sections li { margin: 0 0 0.55rem; line-height: 1.3; }
.poem-sections a.internal {
  background: none; padding: 0; font-weight: normal; font-size: 1rem;
  color: var(--darkgray);
}
.poem-sections a.internal:hover { color: var(--secondary); }
.poem-sections a.internal.active { color: var(--secondary); }
@media all and (max-width: 800px) {
  .poem-sections ol { display: flex; flex-wrap: wrap; gap: 0.3rem 1rem; }
  .poem-sections li { margin: 0; }
  .poem-sections a.internal { font-size: 0.9rem; }
}
`
  return Sections
}) satisfies QuartzComponentConstructor
