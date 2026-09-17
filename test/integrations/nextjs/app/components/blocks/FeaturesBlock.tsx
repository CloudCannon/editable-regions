/**
 * Page-builder block registered as `features`. Contains a sub-array, which
 * needs its own array/array-item/nested-text layers on top of the block's own.
 */
interface FeaturesBlockProps {
	heading?: string;
	items?: { title?: string; description?: string }[];
}

export default function FeaturesBlock({
	heading = "",
	items = [],
}: FeaturesBlockProps) {
	return (
		<div className="block block--features">
			<h2>
				<editable-text data-prop="heading">{heading}</editable-text>
			</h2>

			<div className="grid" data-editable="array" data-prop="items">
				{items.map((item) => (
					<div key={item.title} className="card" data-editable="array-item">
						<h3 data-editable="text" data-prop="title">{item.title}</h3>
						<p data-editable="text" data-prop="description">{item.description}</p>
					</div>
				))}
			</div>
		</div>
	);
}
