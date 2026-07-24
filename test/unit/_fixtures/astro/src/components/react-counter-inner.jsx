import { useState } from "react";

export default function ReactCounterInner({ label = "React Counter" }) {
	const [count, setCount] = useState(0);
	return (
		<div className="react-counter">
			<h2>{label}</h2>
			<p className="count">Count: {count}</p>
			<button
				type="button"
				className="increment"
				onClick={() => setCount((c) => c + 1)}
			>
				Increment
			</button>
		</div>
	);
}
