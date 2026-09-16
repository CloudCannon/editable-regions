import Link from "next/link";

import nav from "../data/nav.json";

/**
 * Deliberately has no editable regions and no content file. Its only job is
 * to give the prerenderer links to crawl, and to give a human a way into
 * each test page.
 */
const tests = nav.items.filter((item) => item.href !== "/");

export const metadata = {
	title: "Editable regions — Next.js harness",
};

export default function IndexPage() {
	return (
		<div>
			<h1>Editable regions — Next.js harness</h1>
			<p>
				One page per region type. Open each in the CloudCannon Visual Editor and
				record the result in <code>README.md</code>.
			</p>

			<ul>
				{tests.map((test) => (
					<li key={test.href}>
						<Link href={test.href}>{test.label}</Link>
					</li>
				))}
			</ul>
		</div>
	);
}
