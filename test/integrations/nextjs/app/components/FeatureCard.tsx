/**
 * Registered as `feature-card`. Carries all three signals that make a component
 * region necessary rather than optional:
 *
 * - conditional element  — the badge only renders when `badge` is set
 * - class binding        — `highlighted` swaps the card's styling
 * - derived content      — the footnote is computed from another field
 *
 * None of that can live-update through primitive regions alone.
 */
interface FeatureCardProps {
	title?: string;
	description?: string;
	badge?: string;
	highlighted?: boolean;
	items?: string[];
}

export default function FeatureCard({
	title = "",
	description = "",
	badge = "",
	highlighted = false,
	items = [],
}: FeatureCardProps) {
	const footnote =
		items.length === 1 ? "1 item" : `${items.length} items`;

	return (
		<div
			className="card"
			style={highlighted ? { borderColor: "var(--accent)", borderWidth: 2 } : undefined}
		>
			{badge?.trim() ? (
				<p>
					<em>
						<editable-text data-prop="badge">{badge}</editable-text>
					</em>
				</p>
			) : null}

			<h3>
				<editable-text data-prop="title">{title}</editable-text>
			</h3>

			<p>
				<editable-text data-prop="description">{description}</editable-text>
			</p>

			<ul data-editable="array" data-prop="items">
				{items.map((item) => (
					<li key={item} data-editable="array-item">
						<editable-text data-prop="">{item}</editable-text>
					</li>
				))}
			</ul>

			{/* Derived from items.length — only a component re-render can update this. */}
			<small>{footnote}</small>
		</div>
	);
}
