{{- /*
  Emits /register-components.js during the normal Hugo build: the template
  snapshot, data files, site config, and page map the live-editing runtime
  boots the in-browser Hugo renderer from. Enabled by adding
  "editable-regions" to the home page's output formats.
*/ -}}
{{- $cfg := site.Params.editable_regions | default dict -}}
{{- $templateDirs := $cfg.template_dirs | default (slice "layouts/partials") -}}
{{- $dataDirs := $cfg.data_dirs | default (slice "data") -}}
{{- $templateExts := $cfg.template_extensions | default (slice ".html" ".htm") -}}
{{- $dataExts := slice ".json" ".yaml" ".yml" ".toml" ".csv" -}}
{{- $runtimeUrl := $cfg.runtime_url | default ("cc-editable-regions/runtime.js" | relURL) -}}
{{- $wasmUrl := $cfg.wasm_url | default ("cc-editable-regions/hugo_renderer.wasm.gz" | relURL) -}}
window.cc_hugo = {{ (dict
  "generator" (printf "Hugo %s" hugo.Version)
  "wasmUrl" $wasmUrl
  "verbose" ($cfg.verbose | default false)
) | jsonify }};
window.cc_hugo_files = {{ partial "cc/walk-files.html" (dict "dirs" $templateDirs "exts" $templateExts) | jsonify }};
window.cc_hugo_data = {{ partial "cc/walk-files.html" (dict "dirs" $dataDirs "exts" $dataExts) | jsonify }};
window.cc_hugo_config = {{ partial "cc/site-config.html" . | jsonify }};
window.cc_hugo_pages = {{ partial "cc/page-map.html" . | jsonify }};
(function () {
	var script = document.createElement("script");
	script.src = {{ $runtimeUrl | jsonify }};
	script.defer = true;
	document.head.appendChild(script);
})();
