/**
 * Registered as `call-to-action`. Props are spread from the value of the
 * wrapping `data-prop` (`@data[cta]`), never a single named wrapper prop.
 *
 * `show_button` and `theme` are why this is a component region rather than
 * loose text editables: both drive markup the primitives can't re-render.
 */
interface CallToActionProps {
	heading?: string;
	description?: string;
	button_label?: string;
	button_url?: string;
	show_button?: boolean;
	theme?: string;
}

export default function CallToAction({
	heading = "",
	description = "",
	button_label = "",
	button_url = "",
	show_button = false,
	theme = "dark",
}: CallToActionProps) {
	return (
		<div className={`cta cta--${theme}`}>
			{heading ? (
				<h2>
					<editable-text data-prop="heading">{heading}</editable-text>
				</h2>
			) : null}

			{description ? (
				<p>
					<editable-text data-prop="description" data-type="text">
						{description}
					</editable-text>
				</p>
			) : null}

			{show_button && button_label?.trim() ? (
				<a className="cta__button" href={button_url}>
					<editable-text data-prop="button_label">{button_label}</editable-text>
				</a>
			) : null}
		</div>
	);
}
