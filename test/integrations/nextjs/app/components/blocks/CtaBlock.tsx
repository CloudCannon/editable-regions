/**
 * Page-builder block registered as `cta`. Its conditional button is what proves
 * a block re-renders rather than just swapping text.
 */
interface CtaBlockProps {
	heading?: string;
	button_label?: string;
	button_url?: string;
	theme?: string;
}

export default function CtaBlock({
	heading = "",
	button_label = "",
	button_url = "",
	theme = "light",
}: CtaBlockProps) {
	return (
		<div className="block block--cta">
			<div className={`cta cta--${theme}`}>
				<h2>
					<editable-text data-prop="heading">{heading}</editable-text>
				</h2>
				{button_label?.trim() ? (
					<a className="cta__button" href={button_url}>
						<editable-text data-prop="button_label">{button_label}</editable-text>
					</a>
				) : null}
			</div>
		</div>
	);
}
