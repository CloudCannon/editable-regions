"use client";

import { useState } from "react";

/**
 * Registered as `stateful-counter`.
 *
 * `registerReactComponent` builds a *fresh* `createRoot` and mounts it into a
 * new div on every re-render, so component-local state resets each time
 * CloudCannon pushes new data. This component makes that observable in a real
 * editor: click the button a few times, then change `label` in the sidebar and
 * watch whether the count survives.
 */
interface StatefulCounterProps {
	label?: string;
	step?: number;
}

export default function StatefulCounter({
	label = "",
	step = 1,
}: StatefulCounterProps) {
	const [count, setCount] = useState(0);

	return (
		<div className="card">
			<h3>
				<editable-text data-prop="label">{label}</editable-text>
			</h3>
			<p>
				Count: <span className="count">{count}</span>
			</p>
			<button
				type="button"
				className="increment"
				onClick={() => setCount((current) => current + step)}
			>
				Add {step}
			</button>
		</div>
	);
}
