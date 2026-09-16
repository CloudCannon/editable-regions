import RawTemplate from "../components/RawTemplate";
import { getPage } from "../utils/content";

const page = getPage("array");

/**
 * Blueprints for "Add item", authored as HTML strings — see RawTemplate.tsx for
 * why they can't be JSX. Each mirrors its live row exactly: same regions, same
 * relative paths, empty values, and a real <img> for the image region to
 * target.
 *
 * Blueprints live on this page only. Every other array in the harness is
 * non-empty at build time, so the runtime clones its first row instead — and
 * keeping the blueprint path on one page means a regression here shows up on
 * one page rather than all eight.
 */
const FEATURE_BLUEPRINT = `
	<div class="card" data-editable="array-item">
		<editable-image data-prop-src="icon"><img src="" alt="" width="240" height="160"></editable-image>
		<h3 data-editable="text" data-prop="title"></h3>
		<p data-editable="text" data-prop="description"></p>
	</div>
`;

const STRING_BLUEPRINT = `
	<li data-editable="array-item"><editable-text data-prop=""></editable-text></li>
`;

export const metadata = {
	title: `${page.data.title} — Next.js harness`,
};

export default function ArrayPage() {
	return (
		<div>
			<h1 data-editable="text" data-type="span" data-prop="title">
				{page.data.title}
			</h1>

			<section className="test-section">
				<h2>Array of objects</h2>
				<p className="note">
					Container carries data-prop; every row carries array-item; every
					visible field inside a row has its own region with a relative path.
				</p>

				<div className="grid" data-editable="array" data-prop="features">
					{page.data.features.map((feature: any) => (
						<div
							key={feature.title}
							className="card"
							data-editable="array-item"
						>
							{feature.icon ? (
								<editable-image data-prop-src="icon">
									<img
										src={feature.icon}
										alt={feature.title}
										width="240"
										height="160"
									/>
								</editable-image>
							) : null}
							<h3 data-editable="text" data-prop="title">{feature.title}</h3>
							<p data-editable="text" data-prop="description">
								{feature.description}
							</p>
						</div>
					))}

					<RawTemplate html={FEATURE_BLUEPRINT} />
				</div>
			</section>

			<section className="test-section">
				<h2>Array of plain strings</h2>
				<p className="note">
					Rows are strings, not objects, so the inner region uses data-prop="" to
					take the current scope as its value.
				</p>

				<ul data-editable="array" data-prop="tags">
					{page.data.tags.map((tag: string) => (
						<li key={tag} data-editable="array-item">
							<editable-text data-prop="">{tag}</editable-text>
						</li>
					))}

					<RawTemplate html={STRING_BLUEPRINT} />
				</ul>
			</section>

			<section className="test-section">
				<h2>Empty array — blueprint is the only way to add a row</h2>
				<p className="note">
					empty_list is [] in frontmatter, so there is no first row for the
					runtime to clone. This is the case &lt;template&gt; blueprints exist
					for, and the only section here that genuinely depends on one.
				</p>

				<ul data-editable="array" data-prop="empty_list">
					{page.data.empty_list.map((entry: string) => (
						<li key={entry} data-editable="array-item">
							<editable-text data-prop="">{entry}</editable-text>
						</li>
					))}

					<RawTemplate html={STRING_BLUEPRINT} />
				</ul>
			</section>
		</div>
	);
}
