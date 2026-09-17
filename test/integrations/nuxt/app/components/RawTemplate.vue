<script lang="ts">
import { createStaticVNode, defineComponent } from "vue";

/**
 * Emits a real `<template>` element carrying an array blueprint.
 *
 * Two Vue constraints force this shape, and neither is obvious:
 *
 * 1. A literal `<template>` tag in an SFC is consumed by the compiler as a
 *    fragment wrapper and never reaches the DOM, so the element has to come
 *    from a render function.
 *
 * 2. The content must be passed as an `innerHTML` **prop**, not as children.
 *    Only the HTML parser redirects a template's contents into its `.content`
 *    fragment — `appendChild` does not. So a parsed `<template>` always has
 *    `firstChild === null`, and Vue hydrating a vnode *with children* walks
 *    `el.firstChild`, finds nothing, and treats it as a hydration mismatch. It
 *    then client-renders the children into `childNodes`, leaving them visible
 *    to `querySelectorAll` while `.content` — where EditableArray looks — stays
 *    empty. That inverts both assumptions at once and floods the page with
 *    "array item has no parent editable region" errors.
 *
 *    Vue skips child hydration entirely when a vnode has an `innerHTML` prop
 *    (runtime-core `hydrateElement`: `shapeFlag & 16 && !(props.innerHTML ||
 *    props.textContent)`), so there are no children to mismatch on. Setting
 *    `.innerHTML` on a template element also routes content into `.content`,
 *    per the DOM spec.
 *
 * Cost: blueprints are authored as HTML strings rather than Vue markup. Keep
 * them next to the rows they mirror so the two stay in sync.
 */
export default defineComponent({
    name: "RawTemplate",
    props: {
        html: { type: String, required: true },
    },
    setup(props) {
        return () => createStaticVNode(`<template>${props.html}</template>`, 1);
    },
});
</script>
