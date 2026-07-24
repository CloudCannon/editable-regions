import type { FC, ReactNode } from "react";
import { useState } from "react";

interface CounterProps {
	count?: number;
}

interface SlotProps {
	children?: ReactNode;
}

/** Minimal React component with no props. */
export const StaticComponent: FC = () => <p>hello from react</p>;

/** React component with a `count` prop. */
export const CounterComponent: FC<CounterProps> = ({ count = 0 }) => (
	<p>count: {count}</p>
);

/** Interactive React component with internal state. */
export const InteractiveCounter: FC = () => {
	const [count, setCount] = useState(0);
	return (
		<div className="interactive-counter">
			<button
				type="button"
				className="increment"
				onClick={() => setCount((c) => c + 1)}
			>
				+1
			</button>
			<span className="count">{count}</span>
		</div>
	);
};

/** React component that renders its children inside a shell. */
export const SlotShell: FC<SlotProps> = ({ children }) => (
	<div className="slot-shell">{children}</div>
);

/** React component that composes with SlotShell, passing children to the child. */
export const SlotParent: FC = () => (
	<div className="slot-parent">
		<SlotShell>
			<p className="slotted">slotted from parent</p>
		</SlotShell>
	</div>
);
