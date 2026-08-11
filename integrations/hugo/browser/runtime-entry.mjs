// Entry point for the prebuilt IIFE runtime the Hugo module ships
// (assets/cc-editable-regions/runtime.js). In the published bundle it is
// concatenated after the snapshot prelude, so the `window.cc_hugo*` globals
// it reads are already set when this runs.
import { initHugoLiveEditing } from "./index.mjs";

initHugoLiveEditing();
