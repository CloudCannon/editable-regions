export default function ReactSlotInner({ title = "React Slotted", children }) {
	return (
		<div className="react-slotted">
			<h2>{title}</h2>
			{children}
		</div>
	);
}
