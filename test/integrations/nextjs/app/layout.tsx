import type { Metadata } from "next";
import type { ReactNode } from "react";

import { EditableRegions } from "@cloudcannon/editable-regions/react";

import CloudCannonEditor from "./components/CloudCannonEditor";
import SiteFooter from "./components/SiteFooter";
import SiteHeader from "./components/SiteHeader";
import "./site.css";

export const metadata: Metadata = {
	title: "Editable regions — Next.js harness",
};

/**
 * One EditableRegions root wraps every editable region on the page; regions
 * outside it connect as orphans at scan time and can mutate the DOM before
 * hydration. Pages stay server components, passed through as children.
 */
export default function RootLayout({
	children,
}: Readonly<{
	children: ReactNode;
}>) {
	return (
		<html lang="en">
			<body>
				<EditableRegions tag="div">
					<SiteHeader />
					<main>{children}</main>
					<SiteFooter />
				</EditableRegions>
				<CloudCannonEditor />
			</body>
		</html>
	);
}
