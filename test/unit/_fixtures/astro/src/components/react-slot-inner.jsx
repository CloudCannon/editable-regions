/**
 * @param {{ title?: string, children?: any }} props
 */
export default function ReactSlotInner(props) {
	const { title = "React Slotted", children } = props;
	return (
		<div className="react-slotted">
			<h2>{title}</h2>
			{children}
		</div>
	);
}
