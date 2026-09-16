import Link from "next/link";

import nav from "../../data/nav.json";

export default function SiteHeader() {
	return (
		<header className="site-header">
			<div className="site-header__inner">
				<strong>
					<editable-text data-prop="@data[nav].brand">
						{nav.brand}
					</editable-text>
				</strong>

				<ul
					className="site-header__nav"
					data-editable="array"
					data-prop="@data[nav].items"
				>
					{nav.items.map((item) => (
						<li key={item.href} data-editable="array-item">
							<Link href={item.href}>
								<editable-text data-prop="label">{item.label}</editable-text>
							</Link>
						</li>
					))}
				</ul>
			</div>
		</header>
	);
}
