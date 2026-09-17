import { join } from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// Fully static output (out/) — plain HTML/CSS/JS, no server runtime needed.
	output: "export",
	turbopack: {
		root: join(__dirname, "../../.."),
	},
};

export default nextConfig;
