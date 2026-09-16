/**
 * Registered as `pricing-table`.
 *
 * Three things stacked in one region that primitives alone can't keep in sync:
 * a conditional badge per row, a class binding per row, and a derived count in
 * the footer. All inside an array whose rows contain their own array.
 */
interface PricingTableProps {
	heading?: string;
	tiers?: {
		name?: string;
		price?: string;
		badge?: string;
		highlighted?: boolean;
		perks?: string[];
	}[];
}

export default function PricingTable({
	heading = "",
	tiers = [],
}: PricingTableProps) {
	// Derived from the data — only a component re-render can keep this current.
	const featured = tiers.find((tier) => tier.highlighted)?.name;
	const summary = featured
		? `${tiers.length} plans — ${featured} is our most popular`
		: `${tiers.length} plans`;

	return (
		<section className="section">
			<h2 data-editable="text" data-prop="heading">
				{heading}
			</h2>

			<div className="grid" data-editable="array" data-prop="tiers">
				{tiers.map((tier) => (
					<div
						key={tier.name}
						className={`card${tier.highlighted ? " card--featured" : ""}`}
						data-editable="array-item"
					>
						{tier.badge?.trim() ? (
							<p className="pill">
								<editable-text data-prop="badge">{tier.badge}</editable-text>
							</p>
						) : null}

						<h3 data-editable="text" data-prop="name">{tier.name}</h3>
						<p className="price" data-editable="text" data-prop="price">
							{tier.price}
						</p>

						<ul data-editable="array" data-prop="perks">
							{tier.perks?.map((perk) => (
								<li key={perk} data-editable="array-item">
									<editable-text data-prop="">{perk}</editable-text>
								</li>
							))}
						</ul>
					</div>
				))}
			</div>

			<p className="note">{summary}</p>
		</section>
	);
}
