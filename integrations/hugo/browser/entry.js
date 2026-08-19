// Entry asset for the Hugo module's live-editing bundle. This file is a Go
// template: editable-regions/resources.html renders it with the site's
// snapshot via resources.ExecuteAsTemplate, then bundles the result with
// js.Build. It is not valid JS until rendered — excluded from biome.
//
// The window.cc_hugo* assignments run before initHugoLiveEditing() in
// program order, so the runtime reads a fully populated snapshot.
window.cc_hugo = {{ .meta | jsonify }};
window.cc_hugo_files = {{ .files | jsonify }};

import { initHugoLiveEditing } from "./index.mjs";

initHugoLiveEditing();
