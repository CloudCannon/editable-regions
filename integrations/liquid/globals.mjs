/**
 * Proxies exposed as `collections` and `page` globals on the shared Liquid
 * engine. Both lazily resolve their properties against the CloudCannon
 * Visual Editor API; LiquidJS awaits the returned thenables as part of
 * normal expression evaluation.
 */

import { apiLoadedPromise, CloudCannon } from "../../helpers/cloudcannon.mjs";

/**
 * Strips the file extension from a path.
 * @param {string} p
 * @returns {string}
 */
function stripExtension(p) {
  return p.replace(/\.[^./]+$/, "");
}

/**
 * 11ty's default folder-style permalink: every input path becomes a URL with a
 * trailing slash, with `index` files mapping to the parent directory. Used as
 * the fallback when no front matter `permalink` is set.
 *
 * @param {string} inputPath
 * @returns {string}
 */
function deriveDefaultUrl(inputPath) {
  const stem = stripExtension(inputPath).replace(/^\.?\//, "/");
  const withLeadingSlash = stem.startsWith("/") ? stem : `/${stem}`;
  const withoutIndex = withLeadingSlash.replace(/\/index$/, "/");
  return withoutIndex.endsWith("/") ? withoutIndex : `${withoutIndex}/`;
}

/**
 * Lazily resolves a CloudCannon collection by key into an array of items
 * suitable for Liquid templates. Each item is realized to plain data so
 * Liquid filters/iteration work without further awaiting nested fields.
 *
 * Item shape is best-effort 11ty-ish (`url`, `inputPath`, `data`); the CC
 * collection layout is not guaranteed to match what Eleventy would have
 * produced.
 *
 * @param {string} key
 * @returns {Promise<Array<{url: any, inputPath: string, data: any}>>}
 */
async function resolveCollection(key) {
  await apiLoadedPromise;
  const collection = CloudCannon.collection(key);
  const files = await collection.items();
  return Promise.all(
    files.map(async (file) => {
      const data = await file.data.get();
      return {
        url: file.url ?? file.path,
        inputPath: file.path,
        data,
      };
    }),
  );
}

/**
 * Resolves a single property of the `page` global against the currently
 * edited file in the Visual Editor. Returns undefined for properties we
 * can't reliably reconstruct without Eleventy build-time state
 * (`outputPath`, `templateSyntax`, `lang`).
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
    case "fileSlug": {
      const base = inputPath.split("/").pop() ?? "";
      return stripExtension(base);
    }
    case "filePathStem": {
      const stem = stripExtension(inputPath).replace(/^\.?\//, "/");
      return stem.startsWith("/") ? stem : `/${stem}`;
    }
    case "outputFileExtension":
      return "html";
    case "date": {
      const data = (await file.data.get()) ?? {};
      const raw = /** @type {any} */ (data).date;
      if (!raw) return undefined;
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? undefined : d;
    }
    case "url": {
      const data = (await file.data.get()) ?? {};
      const permalink = /** @type {any} */ (data).permalink;
      if (typeof permalink === "string") return permalink;
      return deriveDefaultUrl(inputPath);
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
// we can't derive from `currentFile()` resolve to `undefined`. Like
// `collectionsProxy`, property reads return Promises that liquidjs awaits.
export const pageProxy = new Proxy(
  {},
  {
    get(_target, key) {
      // Guard against accidental thenable detection: if liquidjs (or any
      // awaiting code) inspects `page.then`, returning a Promise here would
      // make the proxy itself look like a thenable and trigger recursive
      // resolution.
      if (key === "then") return undefined;
      if (typeof key !== "string") return undefined;
      return resolvePageProperty(key);
    },
  },
);
