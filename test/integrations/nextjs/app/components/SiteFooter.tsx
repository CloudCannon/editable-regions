import Link from "next/link";

import CallToAction from "./CallToAction";
import cta from "../../data/cta.json";
import footer from "../../data/footer.json";

export default function SiteFooter() {
	return (
		<footer className="site-footer">
			<div className="site-footer__inner">
				<p>
					<editable-text data-prop="@data[footer].tagline">
						{footer.tagline}
					</editable-text>
				</p>

				{/*
					The tagline above and the CTA below sit outside the array wrapper — an
					array container must hold only its own rows and blueprints.
				*/}
				<div
					className="site-footer__columns"
					data-editable="array"
					data-prop="@data[footer].columns"
				>
					{footer.columns.map((column) => (
						<div key={column.heading} data-editable="array-item">
							{/* Relative paths from here down: the @data[...] prefix never repeats. */}
							<h3 data-editable="text" data-prop="heading">
								{column.heading}
							</h3>

							<ul data-editable="array" data-prop="links">
								{column.links.map((link) => (
									<li key={link.href} data-editable="array-item">
										<Link href={link.href}>
											<editable-text data-prop="label">{link.label}</editable-text>
										</Link>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>

				<editable-component data-component="call-to-action" data-prop="@data[cta]">
					<CallToAction {...cta} />
				</editable-component>
			</div>
		</footer>
	);
}
