/**
 * Registered as `feature-grid`.
 *
 * The deepest nesting in the harness: component → array (items) → array
 * (bullets) → text, with an image region on each row as well. Relative paths
 * chain the whole way down — the component's `data-prop` scope is the only
 * absolute part.
 */
interface FeatureGridProps {
	heading?: string;
	items?: {
		title?: string;
		description?: string;
		icon?: string;
		bullets?: string[];
	}[];
}

export default function FeatureGrid({
	heading = "",
	items = [],
}: FeatureGridProps) {
	return (
		<section className="section">
			<h2 data-editable="text" data-prop="heading">
				{heading}
			</h2>

			<div className="grid" data-editable="array" data-prop="items">
				{items.map((item) => (
					<div key={item.title} className="card" data-editable="array-item">
						{item.icon ? (
							<editable-image data-prop-src="icon">
								<img src={item.icon} alt={item.title} width="240" height="160" />
							</editable-image>
						) : null}

						<h3 data-editable="text" data-prop="title">
							{item.title}
						</h3>
						<p data-editable="text" data-prop="description">{item.description}</p>

						{/* Array inside an array item — paths stay relative to this row. */}
						<ul data-editable="array" data-prop="bullets">
							{item.bullets?.map((bullet) => (
								<li key={bullet} data-editable="array-item">
									<editable-text data-prop="">{bullet}</editable-text>
								</li>
							))}
						</ul>
					</div>
				))}
			</div>
		</section>
	);
}
