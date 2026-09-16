/**
 * Registered as `static-panel`. The simplest possible component region: no
 * conditionals, no state — it exists to isolate "does registerReactComponent
 * re-render at all" from every other variable.
 */
interface StaticPanelProps {
	heading?: string;
	body?: string;
}

export default function StaticPanel({
	heading = "",
	body = "",
}: StaticPanelProps) {
	return (
		<div className="card">
			<h3>
				<editable-text data-prop="heading">{heading}</editable-text>
			</h3>
			<p>
				<editable-text data-prop="body">{body}</editable-text>
			</p>
		</div>
	);
}
