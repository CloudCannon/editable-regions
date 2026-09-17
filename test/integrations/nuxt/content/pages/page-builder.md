---
title: Page builder blocks
content_blocks:
  - _type: hero
    heading: Blocks come from an array
    subheading: The wrapper declares which field picks the component for each row.
    image: /uploads/one.svg
    image_alt: A blue placeholder labelled one
  - _type: features
    heading: A block with a sub-array
    items:
      - title: Array layer
        description: data-editable="array" plus data-prop on the container.
      - title: Item layer
        description: data-editable="array-item" plus data-component on every row.
      - title: Field layer
        description: A text or image region on every visible field inside the row.
  - _type: cta
    heading: Blocks need all three layers
    button_label: Back to the index
    button_url: /
    theme: light
---

Adding, deleting and reordering blocks in the sidebar should all work here, and
each block should re-render in place rather than needing a rebuild.
