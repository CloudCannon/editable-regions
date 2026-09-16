import { blockMap } from "../cloudcannon/componentMap";
import { getPage } from "../utils/content";

const page = getPage("page-builder");

const blocks = (page.data.content_blocks ?? []).filter(
	(block: { _type?: string }) => block._type && blockMap[block._type],
);

export const metadata = {
	title: `${page.data.title} — Next.js harness`,
};

export default function PageBuilderPage() {
	return (
		<div>
			<h1 data-editable="text" data-type="span" data-prop="title">
				{page.data.title}
			</h1>

			<section className="test-section">
				<h2>content_blocks</h2>
				<p className="note">
					Three layers on every block: the array wrapper names the field that
					picks a component, each row is both an array-item and a component, and
					every visible field inside a block has its own region.
				</p>

				{/*
					data-id-key is omitted deliberately — it defaults to data-component-key,
					and _type is also what identifies each row here.
				*/}
				<div
					data-editable="array"
					data-prop="content_blocks"
					data-component-key="_type"
				>
					{blocks.map((block, index) => {
						const Block = blockMap[block._type];

						return (
							<div
								key={`${block._type}-${index}`}
								data-editable="array-item"
								data-component={block._type}
							>
								<Block {...block} />
							</div>
						);
					})}
				</div>
			</section>
		</div>
	);
}
