/** Page-builder block. Registered under the key `hero`, matching its `_type`. */
interface HeroBlockProps {
	heading?: string;
	subheading?: string;
	image?: string;
	image_alt?: string;
}

export default function HeroBlock({
	heading = "",
	subheading = "",
	image = "",
	image_alt = "",
}: HeroBlockProps) {
	return (
		<div className="block block--hero">
			<h2>
				<editable-text data-prop="heading">{heading}</editable-text>
			</h2>
			<p>
				<editable-text data-prop="subheading">{subheading}</editable-text>
			</p>
			{image ? (
				<editable-image data-prop-src="image" data-prop-alt="image_alt">
					<img src={image} alt={image_alt} width="480" height="320" />
				</editable-image>
			) : null}
		</div>
	);
}
