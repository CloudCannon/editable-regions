---
title: Ship content changes without waiting on a deploy
hero:
  heading: Your marketing team edits the page, not the codebase
  subheading: Point CloudCannon at your repo and every heading, image and list becomes editable in place — with the same build you already ship.
  image: /uploads/one.svg
  image_alt: A dashboard showing an editable page
  actions:
    - label: Start free
      href: https://app.cloudcannon.com/signup
      variant: primary
    - label: Read the docs
      href: https://cloudcannon.com/documentation/
      variant: secondary
feature_grid:
  heading: Built for the people who actually write the copy
  items:
    - title: Edit in place
      description: Click any heading or paragraph on the page and type. No sidebar hunting.
      icon: /uploads/one.svg
      bullets:
        - Inline rich text
        - Image picker on every image
        - Undo and redo
    - title: Structured where it matters
      description: Lists, cards and page sections get add, remove and reorder controls.
      icon: /uploads/two.svg
      bullets:
        - Drag to reorder
        - Add rows from a template
        - Nested lists supported
    - title: Live preview
      description: Registered components re-render as the data changes, so what you see is what ships.
      icon: /uploads/three.svg
      bullets:
        - Conditional sections update
        - Derived labels stay in sync
testimonial:
  quote: We moved our whole marketing site over in an afternoon. The writers stopped filing tickets for typos, which alone paid for it.
  author: Dana Whitfield
  role: Head of Content, Northwind
  avatar: /uploads/two.svg
  featured: true
pricing:
  heading: Straightforward pricing
  tiers:
    - name: Starter
      price: $0
      badge: ""
      highlighted: false
      perks:
        - One site
        - Community support
    - name: Team
      price: $49
      badge: Most popular
      highlighted: true
      perks:
        - Ten sites
        - Visual editing
        - Priority support
    - name: Enterprise
      price: Talk to us
      badge: ""
      highlighted: false
      perks:
        - Unlimited sites
        - SSO and audit logs
        - Dedicated support
faq:
  heading: Questions we get a lot
  items:
    - question: Does this replace our existing build?
      answer: No. CloudCannon runs the build you already have and edits the source files it produces from.
    - question: What happens to content when we change the template?
      answer: Content lives in your repo as markdown and data files, so it survives template changes the same way any other source file does.
---

Everything above this line is a separate component region. This paragraph is the
markdown body, bound with `@content`, sitting on the same page as five component
regions and four nested arrays — which is the point of this page.
