let cp = require("child_process");

let output = cp
  .execSync("git describe --tags | sed 's/^v\\(.*\\)$/\\1/'")
  .toString()
  .trim();

let ver_regex = /^\d+\.\d+\.\d+(-[a-z]+\.\d+)?$/i;

if (!ver_regex.test(output)) {
  console.error(`Version ${output} doesn't match our versioning spec.`);
  console.error(
    `Valid version samples: 0.1.0 / 1.2.3 / 1.5.0-alpha.0 / 1.1.1-rc.8`
  );
  process.exit(1);
}

console.log(output);
