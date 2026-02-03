// @ts-nocheck
import fs from "node:fs"
import path from "node:path"
import slugify from "slugify"
import esbuild from "esbuild";
import { Tokenizer, evalToken, toPromise } from "liquidjs";
import { createSpreadIncludeTag } from "@cloudcannon/editable-regions/liquid";

/* pluginOptions 
{
  output?: string;
  verbose: boolean;
  liquid?: {
    components_dirs: string[];
    components: string[]; Change this to auto-discover
    extensions?: string[] = ['.liquid'];

    filters?: {key: string, path: string}[];
    shortcodes?: {key: string, path: string}[];
    customTags?: {key: string, path: string}[];
  }

  nunjucks?: {}
}
*/

export default function (eleventyConfig, pluginOptions) {
  console.log({ eleventyConfig })
  
  if(pluginOptions.liquid){
    const spreadIncludeTag = createSpreadIncludeTag({ Tokenizer, evalToken, toPromise });
    eleventyConfig.addLiquidTag('spreadInclude', spreadIncludeTag);
  }

  console.log({ eleventyConfig })

  eleventyConfig.on("eleventy.before", async () => {
    const liveEditingSource = createLiveEditingSource(pluginOptions);

    await esbuild.build({
      stdin: {
        contents: await liveEditingSource,
        resolveDir: process.cwd()
      },
      loader: { '.liquid': 'text', '.html': 'text' },
      bundle: true,
      outfile:
        pluginOptions.output ??
        `${eleventypluginOptions.dir.output}/live-editing.js`,
    });
  });
}

const createLiveEditingSource = async (pluginOptions) => {
  let source = "";

  if (pluginOptions.liquid) {
    const componentsDir = pluginOptions.liquid.components_dir || 'src/_includes/';
    
    source += `		
      import { registerLiquidComponent, registerCustomFilter, registerCustomShortcode, registerCustomPairedShortcode, registerCustomTag, setVerbose, configureLiquid } from '@cloudcannon/editable-regions/liquid';

      setVerbose(${Boolean(pluginOptions.verbose)});
      
      
      // Configure the Liquid engine with the base includes directory
      configureLiquid({
        baseIncludesDir: '${componentsDir}'
      });
      
      window.cc_files = {};
    `;

    // Add files we'll need to window.cc_files - 
    // Then in our liquid file system we can grab them from window.cc_files during readFile
    // Important for nested components
    let i = 0;
    const allLiquidFiles = await findAllLiquidFiles(pluginOptions.liquid);
    allLiquidFiles?.forEach((path) => {
      const id = `liquid_file_${i++}`; // TODO: Could probably make this a nicer id
      source += `import ${id} from './${path}'

      window.cc_files["${path}"] =  ${id};
      `
    })

    // Register custom filters
    const customFilters = pluginOptions.liquid.filters;
    if (customFilters?.length > 0) {
      for (const { name, file } of customFilters) {
        const slugifiedFilterName = `${slugify(name, {
          replacement: '_',
          strict: true
        })}_filter`
        source += `  
          import ${slugifiedFilterName} from './${file}';
          registerCustomFilter('${name}', ${slugifiedFilterName});
        `
      }
    }

    // Register custom shortcodes
    const customShortcodes = pluginOptions.liquid.shortcodes;
    if (customShortcodes?.length > 0) {
      for (const { name, file } of customShortcodes) {
        const slugifiedShortcodeName = `${slugify(name, {
          replacement: "_",
          strict: true,
        })}_shortcode`
        source += `  
          import ${slugifiedShortcodeName} from './${file}';
          registerCustomShortcode('${name}', ${slugifiedShortcodeName});
        `
      }
    }

    // Register custom paired shortcodes
    const customPairedShortcodes = pluginOptions.liquid.pairedShortcodes;
    if (customPairedShortcodes?.length > 0) {
      for (const { name, file } of customPairedShortcodes) {
        const slugifiedShortcodeName = `${slugify(name, {
          replacement: '_',
          strict: true
        })}_paired_shortcode`
        source += `  
          import ${slugifiedShortcodeName} from './${file}';
          registerCustomPairedShortcode('${name}', ${slugifiedShortcodeName});
        `
      }
    }

    // Register custom tags
    const customTags = pluginOptions.liquid.customTags;
    if (customTags?.length > 0) {
      for (const { name, file } of customTags) {
        const slugifiedTagName = `${slugify(name, {
          replacement: '_',
          strict: true
        })}_custom_tag`
        source += `  
          import ${slugifiedTagName} from './${file}';
          registerCustomTag('${name}', ${slugifiedTagName});
        `
      }
    }

    // Register components
    pluginOptions.liquid.components?.forEach(({name, file}) => {
      const slugifiedComponentName = slugify(name, {
        replacement: '_',
        strict: true
      })

      source += `
        import ${slugifiedComponentName} from './${file}';
        registerLiquidComponent("${name}", ${slugifiedComponentName});
      `
    });
  }
  return source.toString();
};

/** Recursively find all component files in the includes directory */
async function findAllLiquidFiles({
  components_dir = "src/_includes/",
  extensions = [".liquid", ".html"],
  ignoreDirectories = [],
  baseIncludesDir = null,
}) {
  if (baseIncludesDir === null) {
    baseIncludesDir = components_dir.endsWith("/")
      ? components_dir
      : `${components_dir}/`;
  }

  const components = [];
  const normalizedExtensions = extensions.map((ext) =>
    ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`,
  );
  const normalizedIgnoreDirs = ignoreDirectories.map((dir) =>
    dir.toLowerCase(),
  );

  try {
    const entries = await fs.promises.readdir(components_dir, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const fullPath = path.join(components_dir, entry.name);

      if (entry.isDirectory()) {
        if (normalizedIgnoreDirs.includes(entry.name.toLowerCase())) {
          continue;
        }
        const subComponents = await findAllLiquidFiles({
          components_dir: fullPath,
          extensions,
          ignoreDirectories,
          baseIncludesDir,
        });
        components.push(...subComponents);
      } else if (entry.isFile()) {
        const fileExt = getFileExtension(entry.name);
        if (normalizedExtensions.includes(fileExt)) {
          // Remove base includes prefix to get the include path (e.g., "liquid/a-component.liquid")
          // const includePath = fullPath.replace(baseIncludesDir, "").replace(/\\/g, "/");
          components.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.error("ERROR reading directory:", components_dir, error);
    throw error;
  }

  return components;
}

function getFileExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}
