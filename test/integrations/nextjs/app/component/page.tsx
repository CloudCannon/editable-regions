import FeatureCard from "../components/FeatureCard";
import StatefulCounter from "../components/StatefulCounter";
import StaticPanel from "../components/StaticPanel";
import { getPage } from "../utils/content";

const page = getPage("component");

export const metadata = {
	title: `${page.data.title} — Next.js harness`,
};

export default function ComponentPage() {
	return (
		<div>
			<h1 data-editable="text" data-type="span" data-prop="title">
				{page.data.title}
			</h1>

			<section className="test-section">
				<h2>Static component</h2>
				<p className="note">
					Baseline: registerReactComponent("static-panel"). Editing heading or
					body should update both inline and from the sidebar.
				</p>

				<editable-component data-component="static-panel" data-prop="panel">
					<StaticPanel {...page.data.panel} />
				</editable-component>
			</section>

			<section className="test-section">
				<h2>Conditional / derived component</h2>
				<p className="note">
					Badge visibility, border styling and the item count are all computed
					from data. Only a component re-render can keep them in sync.
				</p>

				<editable-component data-component="feature-card" data-prop="card">
					<FeatureCard {...page.data.card} />
				</editable-component>
			</section>

			<section className="test-section">
				<h2>Stateful component</h2>
				<p className="note">
					Click the button, then edit the label. A fresh createRoot per
					re-render means the count is expected to reset — this section is here
					to confirm that behaviour in a real editor, not to assert it is
					correct.
				</p>

				<editable-component data-component="stateful-counter" data-prop="counter">
					<StatefulCounter {...page.data.counter} />
				</editable-component>
			</section>
		</div>
	);
}
