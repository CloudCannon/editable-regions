/**
 * Registered as `hero-section`.
 *
 * Nesting under test: component → array (actions) → text, with a `variant`
 * field driving a class binding on each row.
 */
interface HeroSectionProps {
	heading?: string;
	subheading?: string;
	image?: string;
	image_alt?: string;
	actions?: { label?: string; href?: string; variant?: string }[];
}

export default function HeroSection({
	heading = "",
	subheading = "",
	image = "",
	image_alt = "",
	actions = [],
}: HeroSectionProps) {
	return (
		<section className="hero">
			<div className="hero__copy">
				<h2 data-editable="text" data-prop="heading">
					{heading}
				</h2>
				<p data-editable="text" data-type="text" data-prop="subheading">
					{subheading}
				</p>

				<div className="hero__actions" data-editable="array" data-prop="actions">
					{actions.map((action) => (
						<span key={action.href} data-editable="array-item">
							{action.label?.trim() ? (
								<a
									className={`btn btn--${action.variant || "primary"}`}
									href={action.href}
								>
									<editable-text data-prop="label">{action.label}</editable-text>
								</a>
							) : null}
						</span>
					))}
				</div>
			</div>

			{image ? (
				<editable-image className="hero__media" data-prop-src="image" data-prop-alt="image_alt">
					<img src={image} alt={image_alt} width="480" height="320" />
				</editable-image>
			) : null}
		</section>
	);
}
