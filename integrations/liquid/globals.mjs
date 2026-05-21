/**
 * Proxies exposed as `collections` and `page` globals on the shared Liquid
 * engine. Both lazily resolve their properties against the CloudCannon
 * Visual Editor API; LiquidJS awaits the returned thenables as part of
 * normal expression evaluation.
 */

import { apiLoadedPromise, CloudCannon } from "../../helpers/cloudcannon.mjs";
import { getPageMap, normalizeInputPath } from "./page-map.mjs";

/**
 * Snapshot of Eleventy build-time data registered by the host (currently
 * just the Eleventy integration). Read lazily by the page proxy when
 * deriving values that need it — most notably `page.outputPath`, which
 * needs `directories.output`.
 *
 * @type {{ directories?: { output?: string } } | null}
 */
let eleventyData = null;

/**
 * Setter called by the host wiring (`registerEleventyData` in
 * `liquid/index.mjs`) to expose the build-time `eleventy` payload to this
 * module. Keeps `globals.mjs` decoupled from the engine module — one-way
 * data flow, no circular import.
 *
 * @param {{ directories?: { output?: string } } | null} data
 */
export function setEleventyData(data) {
  eleventyData = data;
}

/** Strips the file extension from a path. */
function stripExtension(/** @type {string} */ p) {
  return p.replace(/\.[^./]+$/, "");
}

/**
 * 11ty's default folder-style permalink: every input path becomes a URL with
 * a trailing slash, with `index` files mapping to the parent directory.
 * Used as the fallback when no front matter `permalink` is set.
 */
function deriveDefaultUrl(/** @type {string} */ inputPath) {
  const stem = stripExtension(inputPath).replace(/^\.?\//, "/");
  const withLeadingSlash = stem.startsWith("/") ? stem : `/${stem}`;
  const withoutIndex = withLeadingSlash.replace(/\/index$/, "/");
  return withoutIndex.endsWith("/") ? withoutIndex : `${withoutIndex}/`;
}

/**
 * Resolves the URL for an Eleventy input file. Priority:
 *
 *   1. Live front-matter `permalink` — wins so editor-time edits show
 *      immediately, before the user re-builds.
 *   2. Build-time page map (`registerPageMap`) — captures permalinks
 *      computed by JS config or `eleventyComputed`, which front-matter
 *      can't see.
 *   3. 11ty's folder-style default — last-resort derivation.
 *
 * When `pageMap` is disabled in plugin options the map is empty, and step
 * 2 always misses; everything else still works.
 */
function resolveUrl(
  /** @type {Record<string, any> | null | undefined} */ data,
  /** @type {string} */ inputPath,
) {
  const permalink = data?.permalink;
  if (typeof permalink === "string") return permalink;
  const mapped = getPageMap()[normalizeInputPath(inputPath)];
  if (mapped?.url) return mapped.url;
  return deriveDefaultUrl(inputPath);
}

/**
 * Same priority layering as `resolveUrl` but for the output path: live
 * front-matter `permalink` → joined with the build's output dir;
 * build-time map → its exact `outputPath`; folder-style default → joined
 * with the output dir. Returns `undefined` if neither the map nor the
 * eleventy data have run yet and we can't compose a path.
 */
function resolveOutputPath(
  /** @type {Record<string, any> | null | undefined} */ data,
  /** @type {string} */ inputPath,
) {
  const outputDir = eleventyData?.directories?.output;
  const permalink = data?.permalink;
  if (typeof permalink === "string") {
    return outputDir ? joinOutputPath(outputDir, permalink) : undefined;
  }
  const mapped = getPageMap()[normalizeInputPath(inputPath)];
  if (mapped?.outputPath) return mapped.outputPath;
  if (!outputDir) return undefined;
  return joinOutputPath(outputDir, deriveDefaultUrl(inputPath));
}

/** Basename minus extension. Matches 11ty's `fileSlug` derivation. */
function deriveFileSlug(/** @type {string} */ inputPath) {
  const base = inputPath.split("/").pop() ?? "";
  return stripExtension(base);
}

/** Full path minus extension, with a leading slash. */
function deriveFilePathStem(/** @type {string} */ inputPath) {
  const stem = stripExtension(inputPath).replace(/^\.?\//, "/");
  return stem.startsWith("/") ? stem : `/${stem}`;
}

/**
 * Coerces a raw front-matter date value into a Date. Returns `undefined`
 * for absent or unparseable input.
 */
function toDate(/** @type {unknown} */ raw) {
  if (!raw) return undefined;
  const d = new Date(/** @type {any} */ (raw));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Joins an output directory and URL into an output path the way 11ty does:
 * URLs ending in `/` become `<dir><url>index.html`; non-slash URLs are
 * appended as-is.
 */
function joinOutputPath(
  /** @type {string} */ outputDir,
  /** @type {string} */ url,
) {
  const dir = outputDir.replace(/\/+$/, "");
  const tail = url.endsWith("/") ? `${url}index.html` : url;
  return `${dir}${tail}`;
}

/**
 * Resolves the built URL of the file the editor is currently rendering
 * against. We can't read `location.pathname` — inside the CloudCannon
 * Visual Editor that returns the editor-shell URL, not the site URL — so
 * we use the live-permalink / build-map / folder-default hierarchy
 * documented on `resolveUrl`.
 */
async function resolvePageUrl(/** @type {any} */ file) {
  const data = (await file.data.get()) ?? {};
  return resolveUrl(data, file.path);
}

/**
 * Lazily resolves a CloudCannon collection by key into an array of items
 * suitable for Liquid templates. Each item is realized to plain data so
 * Liquid filters/iteration work without further awaiting nested fields.
 *
 * Items mirror 11ty's collection-item shape: `url`, `outputPath`,
 * `inputPath`, `fileSlug`, `filePathStem`, `date`, `data`. URLs and
 * output paths follow the priority hierarchy on `resolveUrl` /
 * `resolveOutputPath`, so computed permalinks become visible whenever the
 * build-time page map has run (it's emitted by the Eleventy plugin unless
 * `pageMap` is opted out).
 *
 * @param {string} key
 * @returns {Promise<Array<{ url: string, outputPath: string | undefined, inputPath: string, fileSlug: string, filePathStem: string, date: Date | undefined, data: any }>>}
 */
async function resolveCollection(key) {
  await apiLoadedPromise;
  const collection = CloudCannon?.collection?.(key);
  if (!collection) return [];
  const files = await collection.items();
  return Promise.all(
    files.map(async (file) => {
      const data = (await file.data.get()) ?? {};
      return {
        url: resolveUrl(data, file.path),
        outputPath: resolveOutputPath(data, file.path),
        inputPath: file.path,
        fileSlug: deriveFileSlug(file.path),
        filePathStem: deriveFilePathStem(file.path),
        date: toDate(/** @type {any} */ (data).date),
        data,
      };
    }),
  );
}

/**
 * Resolves a single property of the `page` global against the currently
 * edited file in the Visual Editor. Returns undefined for properties we
 * can't reliably reconstruct without Eleventy build-time state
 * (`templateSyntax`, `lang`).
 *
 * @param {string} key
 * @returns {Promise<any>}
 */
async function resolvePageProperty(key) {
  await apiLoadedPromise;
  const file = CloudCannon?.currentFile?.();
  if (!file) return undefined;

  const inputPath = file.path;

  switch (key) {
    case "inputPath":
      return inputPath;
    case "fileSlug":
      return deriveFileSlug(inputPath);
    case "filePathStem":
      return deriveFilePathStem(inputPath);
    case "outputFileExtension":
      return "html";
    case "date": {
      const data = (await file.data.get()) ?? {};
      return toDate(/** @type {any} */ (data).date);
    }
    case "url":
      return resolvePageUrl(file);
    case "outputPath": {
      const data = (await file.data.get()) ?? {};
      return resolveOutputPath(data, file.path);
    }
    default:
      return undefined;
  }
}

// Proxy exposed as the `collections` global on the Liquid engine. Property
// reads kick off an async fetch via the CloudCannon live-editing API; Liquid
// awaits the returned thenable wherever the value is consumed (for-loops,
// filter args, output expressions).
export const collectionsProxy = new Proxy(
  {},
  {
    get(_target, key) {
      if (typeof key !== "string") return undefined;
      return resolveCollection(key);
    },
  },
);

// Proxy exposed as the `page` global on the Liquid engine. Mirrors 11ty's
// `page` object as closely as we can from the Visual Editor API; properties
// we can't derive from `currentFile()` resolve to `undefined`. Property
// reads return Promises that liquidjs awaits as part of normal expression
// evaluation.
export const pageProxy = new Proxy(
  {},
  {
    get(_target, key) {
      if (typeof key !== "string") return undefined;
      return resolvePageProperty(key);
    },
  },
);
