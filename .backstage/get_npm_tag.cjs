const version = process.env.GIT_VERSION;

if (!version) {
	console.error('Script expected a GIT_VERSION environment variable');
	process.exit(1);
}

// Only allow latest tag if we are releasing a major/minor/patch
if (/^\d+\.\d+\.\d+$/.test(version)) {
	console.log('latest');
	process.exit(0);
}

// Use the suffix as the tag. i.e. `0.11.0-rc.5` -> `rc`
const suffix = version.match(/^\d+\.\d+\.\d+-([a-z]+)\.\d+$/i)?.[1];
if (suffix) {
	console.log(suffix.toLowerCase());
	process.exit(0);
}

console.error(`No release tag found for ${version} — exiting`);
process.exit(1);
