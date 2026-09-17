---
title: Text editable regions
standfirst: Inline rich text — **bold** and [links](https://cloudcannon.com) are allowed here, but block elements are not.
intro: |
  Block rich text supports multiple paragraphs, lists and headings.

  This second paragraph exists to prove the block editor keeps paragraph structure intact.
---

This is the markdown body of `content/pages/text.md`, bound with
`data-prop="@content"`. It is the only path to the body — frontmatter fields use
normal field paths, the body has no path other than the reserved token.

- Editing here should write back to the body of this file
- Lists and other block-level markdown should survive a round trip
