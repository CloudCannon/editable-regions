export default function ReactStaticInner({ title = "React Static" }) {
	return (
		<div className="react-static">
			<h2>{title}</h2>
			<p>Static React component inside Astro</p>
		</div>
	);
}
