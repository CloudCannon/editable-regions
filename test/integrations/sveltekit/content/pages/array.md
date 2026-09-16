---
title: Array editable regions
features:
  - title: Add, remove, reorder
    description: Array items get CRUD controls automatically once the container is a region.
    icon: /uploads/one.svg
  - title: Nested editables
    description: Without nested text and image regions, rows are only editable from the sidebar.
    icon: /uploads/two.svg
  - title: Relative paths
    description: Paths inside an array item resolve against that item, never the page root.
    icon: /uploads/three.svg
tags:
  - primitives
  - crud
  - drag-and-drop
# Deliberately empty: the runtime has no first row to clone here, so adding an
# item depends entirely on the <template> blueprint.
empty_list: []
---

Two arrays: one of objects with nested text and image regions per row, and one
of plain strings using the empty-path pass-through.
