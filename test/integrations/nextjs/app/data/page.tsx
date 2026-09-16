import CallToAction from "../components/CallToAction";
import cta from "../../data/cta.json";
import footer from "../../data/footer.json";
import nav from "../../data/nav.json";
import { getPage } from "../utils/content";

const page = getPage("data");

export const metadata = {
	title: `${page.data.title} — Next.js harness`,
};

export default function DataPage() {
	return (
		<div>
			<h1 data-editable="text" data-type="span" data-prop="title">
				{page.data.title}
			</h1>

			<section className="test-section">
				<h2>@data[nav] — flat array</h2>
				<p className="note">
					The same array as the header nav, rendered a second time. Editing
					either copy writes to data/nav.json.
				</p>

				<ul data-editable="array" data-prop="@data[nav].items">
					{nav.items.map((item) => (
						<li key={item.href} data-editable="array-item">
							<editable-text data-prop="label">{item.label}</editable-text>
							<code>{item.href}</code>
						</li>
					))}
				</ul>
			</section>

			<section className="test-section">
				<h2>@data[footer].columns — nested arrays</h2>
				<p className="note">
					The @data prefix appears only on the outer wrapper. Inner arrays and
					fields chain with relative paths — an indexed path on a child resolves
					to undefined.
				</p>

				<div className="grid" data-editable="array" data-prop="@data[footer].columns">
					{footer.columns.map((column) => (
						<div key={column.heading} className="card" data-editable="array-item">
							<h3 data-editable="text" data-prop="heading">{column.heading}</h3>
							<ul data-editable="array" data-prop="links">
								{column.links.map((link) => (
									<li key={link.href} data-editable="array-item">
										<editable-text data-prop="label">{link.label}</editable-text>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
			</section>

			<section className="test-section">
				<h2>@data[cta] — component region</h2>
				<p className="note">
					A registered React component whose props are the whole data file.
					Toggling show_button or theme in the sidebar should re-render this
					live.
				</p>

				<editable-component data-component="call-to-action" data-prop="@data[cta]">
					<CallToAction {...cta} />
				</editable-component>
			</section>
		</div>
	);
}
