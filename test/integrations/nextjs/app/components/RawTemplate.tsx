/**
 * Emits a real `<template>` element carrying an array blueprint.
 *
 * One React constraint forces the content to be passed through
 * `dangerouslySetInnerHTML`: React only bypasses child reconciliation for a
 * prop-set innerHTML, never for declarative children. The content of a parsed
 * `<template>` is redirected by the HTML parser into its `.content` fragment, while
 * `appendChild`/React children do not go there — EditableArray looks in
 * `.content`, so React-rendered children would leave it empty while the
 * blueprint stayed visible to `querySelectorAll`. That inverts both
 * assumptions at once and floods the page with "array item has no parent
 * editable region" errors.
 *
 * Cost: blueprints are authored as HTML strings rather than JSX. Keep them next
 * to the rows they mirror so the two stay in sync.
 */
export default function RawTemplate({ html }: { html: string }) {
	return <template dangerouslySetInnerHTML={{ __html: html }} />;
}
