// Entry point for the prebuilt IIFE runtime the Hugo module ships
// (static/cc-editable-regions/runtime.js). The emitted register-components.js
// sets the `window.cc_hugo*` globals and then loads this script.
import { initHugoLiveEditing } from "./index.mjs";

initHugoLiveEditing();
