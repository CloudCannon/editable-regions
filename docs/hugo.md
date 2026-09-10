# Hugo integration

The Hugo integration is a Hugo module. At build time it discovers your templates, partials, and config files, bundles them with a copy of the renderer, and publishes the bundle as a site resource. When a page loads in CloudCannon, the renderer reconstructs your templates in the browser and re-renders editable regions as you edit.

## Table of contents

- [Adding the plugin to your config](#adding-the-plugin-to-your-config)
- [Including the editable regions in your layout](#including-the-editable-regions-in-your-layout)
- [Resolving component names](#resolving-component-names)
- [Adding the markup](#adding-the-markup)
- [Collections and datasets in components](#collections-and-datasets-in-components)
- [Options](#options)
- [Vendoring modules](#vendoring-modules)
- [Bundling additional files](#bundling-additional-files)
- [Overriding templates with editor-friendly versions](#overriding-templates-with-editor-friendly-versions)
- [Visual editor fallbacks with `ENV_CLIENT`](#visual-editor-fallbacks-with-env_client)

## Adding the plugin to your config

Add the module to `hugo.toml`:

```toml
[module]
  [[module.imports]]
    path = "github.com/CloudCannon/editable-regions"
```

## Including the editable regions in your layout

Include the partial in your site `<head>`:

```html
{{ partial "editable-regions" . }}
```

## Resolving component names

There's no registration step: the editor resolves component names as partial names against your layouts. A component name renders from `layouts/partials/`, with or without the file extension, so`data-component="card.html"` and `data-component="card"` both resolve the partial at `layouts/partials/card.html`.

## Adding the markup

Wrap the partial in an editable component region:

```html
<div data-editable="component" data-component="card.html" data-prop="card">
  {{- partial "card.html" .Params.card -}}
</div>
```

## Collections and datasets in components

Partials re-render in the editor against live content. This means templating that reads collections reflects the editor's current state, including unsaved changes:

```html
<ul>
  {{ range site.RegularPages }}
    <li><a href="{{ .RelPermalink }}">{{ .Title }}</a></li>
  {{ end }}
</ul>
```

Data folders configured as datasets are bundled as well: the editor mirrors their files into the renderer's data directory and live updates them on edit, so `site.Data` reflects dataset changes as they happen.

To point a region's props at a collection or dataset directly, use an `@` reference:

```html
<ul data-editable="array" data-prop="@collections[blog]">
  <li data-editable="array-item">
    <h4 data-editable="text" data-prop="title" />
  </li>
</ul>
```

## Options

All options live under `params.editable_regions` in your Hugo configuration.

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `template_extensions` | `[]string` |  | Template file extensions to discover. Defaults to `[".html", ".htm"]`. |
| `template_dirs` | `[]string` |  | Directories to walk for templates. By default, templates are discovered from your module graph (project, theme, and module templates) plus vendored module files. |
| `ignore_directories` | `[]string` |  | Directory names to skip when walking. Defaults to `[".git", "node_modules", "public", "resources"]`. |
| `config_paths` | `[]string` |  | Config files to bundle for the renderer. By default, Hugo's standard config files are discovered automatically. |
| `config_dirs` | `[]string` |  | Config directories to bundle. Discovered files are merged with `config_paths`. |
| `i18n_dirs` | `[]string` |  | Directories to walk for i18n files. Defaults to `["i18n"]`. |
| `additional_paths` | `[]string` |  | Extra files to bundle verbatim, for data the renderer needs that isn't auto-detected. |
| `additional_dirs` | `map[string][]string` |  | Extra directories to bundle, mapping a directory to a list of file extensions to include (walked recursively). |
| `templates_overrides` | `map[string]string` |  | Map of template key path → source path. The contents at the source path replace what discovery captured at the key path. |
| `wasm_url` | `string` |  | Direct URL to the renderer WASM asset. Skips release resolution entirely. |
| `wasm_base_url` | `string` |  | Base URL for release downloads. Defaults to the GitHub releases of `CloudCannon/editable-regions`. |
| `_version` | `string` |  | Overrides the resolved module version used to locate a WASM release asset. |
| `verbose` | `boolean` |  | Enable verbose logging in the renderer. |

## Vendoring modules

The editor rebuilds your site from the files bundled at build time, so module imports resolve only against files inside your project. Themes in `themes/` are covered automatically; modules from the module cache aren't. Vendor them first:

```sh
hugo mod vendor
```

Vendored templates are discovered like your own, and the module graph file (`_vendor/modules.txt`) is bundled so the editor can resolve your module imports.

## Bundling additional files

The editor rebuilds your templates from the files bundled at build time. Templates, config files, and i18n files are discovered automatically; content and datasets come from the editor's live state. Anything else your templates read isn't captured — bundle it explicitly with `additional_paths` for individual files and `additional_dirs` for directories:

```toml
[params.editable_regions]
  additional_paths = ["lookups/pricing.json"]

  [params.editable_regions.additional_dirs]
    "lookups" = ["json", "csv"]
```

Directories are walked recursively for files with the listed extensions.

## Overriding templates with editor-friendly versions

Use `templates_overrides` to replace a template with an editor-friendly version. The key is the path of the template as discovered; the value is the path whose contents replace it in the editor, rendered through Hugo's normal partial lookup:

```toml
[params.editable_regions.templates_overrides]
  "layouts/partials/card.html" = "overrides/card.html"
```

The built site keeps the original template; only the editor renders the replacement. This is useful when a template depends on build-time state that isn't available in the editor, or you want a simplified editing experience for a complex template.

Relative replacement targets resolve against the project root.

## Visual editor fallbacks with `ENV_CLIENT`

The module defines `ENV_CLIENT` as a site parameter: `false` in a normal build, `true` in the editor's renderer. Use it to render an editing fallback for anything that can't run in the editor:

```html
{{ if site.Params.ENV_CLIENT }}
  <p>Weather widget preview unavailable in the editor.</p>
{{ else }}
  {{ partial "weather-widget" . }}
{{ end }}
```
