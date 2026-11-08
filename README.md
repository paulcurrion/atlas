# An Atlas of Haunted Houses

A hyperlinked companion to the poem *An Atlas of Haunted Houses*: the poem floating in
black space, with every highlighted phrase leading to a reference node, and every
reference leading back to the exact stanza it came from.

Built with [Quartz 4](https://quartz.jzhao.xyz/) and deployed to GitHub Pages.

## How the content is organised

```
content/
  index.md            landing page: the whole poem (it embeds the six sections)
  poem/               one page per section: 1-haint-blue.md … 6-decolonising-the-mind.md
  refs/               one page per reference
```

Open the `content/` folder as an **Obsidian vault** and write there. In Obsidian’s
settings (*Files and links*), turn on **Use [[Wikilinks]]** and set
**New link format** to **Shortest path when possible**.

### Linking a phrase in the poem

```markdown
Sea lifts to sky like [[blue-screen-of-death|the blue screen of death]] -
```

The part before `|` is the reference page’s filename; the part after is the text that
shows in the poem. A link cannot span two lines. If a phrase runs over a line break,
link each line separately to the same reference.

### Stanza anchors

Every stanza ends with a block anchor such as `^first-3`. These let reference pages link
back to the exact stanza, and let “Return to the poem” put the reader where they left off.
If you add a stanza, give it a new anchor (any unique name, letters, digits and hyphens).

### Adding a reference

Create `content/refs/<name>.md`:

```markdown
---
title: "Blue screen of death"
tags:
  - technology
---

One-line identification.

Your expansion…

See also: [[hamsa|Hamsa]]
```

The **“In the poem”** card at the top of each reference page is generated automatically
from the links in the poem, so you never have to write it yourself. Links between
references (“See also”) are what turn the graph from a star into an archipelago.

Types used so far, as tags: `literature`, `folklore`, `religion`, `history`, `nature`,
`technology`, `music`, `culture`, `language`, `climate`, `politics`. Each tag gets its own
listing page automatically (e.g. `/tags/folklore`).

`REFERENCES.md` (in the repository root, not published) is the working list of references
still to add, with a suggested one-line identification for each.

## The editor

For linking phrases and writing references there is a small editor that runs on your
computer:

```bash
npm run editor
```

Then open **http://localhost:4000**. It also starts the site preview on
http://localhost:8080, which updates every time you save. Stop both with Ctrl+C.

- **Link a phrase:** select words within one line of the poem. Choose an existing
  reference, a suggestion from your to-do list, or **＋ New reference**.
- **Change or remove a link:** click a highlighted phrase.
- **Edit a reference:** choose it from the list on the left. Save with the button or
  Ctrl/Cmd+S. “See also” adds a link to another reference. Each reference shows where
  it appears in the poem (click a line to jump to it) and which references link to it.
- **To-do:** the second tab lists the references in `REFERENCES.md` not yet created.
  Clicking one opens it with its one-line identification filled in and, when its phrase
  can be found in the poem, links it as soon as you create it.
- **Publish…** shows what you’ve changed, then commits and pushes it; the live site
  updates a minute or two later.

The editor can add, change and remove links in the poem, but it refuses any change to the
words themselves. Edit the text of the poem in Obsidian or a text editor. Both work on the
same files, and the editor reloads when you switch back to it.

## Previewing locally

You need [Node.js](https://nodejs.org/) 22 or newer.

```bash
npm ci                      # once, to install
npx quartz build --serve    # then open http://localhost:8080
```

The preview rebuilds whenever you save a file.

## Publishing

Every push to `main` is built and published by `.github/workflows/deploy.yaml`.

One-time setup:

1. On GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Still in **Settings → Pages**, set **Custom domain** to `atlas.currion.net` and tick
   **Enforce HTTPS** once the certificate is ready.
3. At your DNS provider, add a `CNAME` record: `atlas` → `paulcurrion.github.io`.

## What’s custom here (vs. stock Quartz)

| File | What it does |
|---|---|
| `quartz/plugins/transformers/poemLines.ts` | Records, for every link in the poem, the line and stanza it sits in |
| `quartz/components/InThePoem.tsx` | The “In the poem” card on reference pages |
| `quartz/components/PoemNav.tsx` + `scripts/poemnav.inline.ts` | “Return to the poem” (back to the exact stanza) and the reader’s trail |
| `quartz/styles/custom.scss` | Black space, haint-blue links, verse typography, mobile tweaks |
| `quartz.config.ts`, `quartz.layout.ts` | Site settings and page layout |
| `editor/` | The local editor (`npm run editor`) |
| `quartz/components/scripts/explorer.inline.ts` | One-line fix so the sidebar doesn’t scroll the page on load |
