// Go template: rendered by editable-regions/resources.html then bundled with js.Build.
window.cc_hugo = {{ .meta | jsonify }};
window.cc_hugo_files = {{ .files | jsonify }};

import { initHugoLiveEditing } from "./index.js";

initHugoLiveEditing();
