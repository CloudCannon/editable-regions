/**
 * Registered as `faq-list`.
 *
 * Uses <details>, so each row carries browser-managed open/closed state. Tests
 * whether a component re-render clobbers UI state the editor didn't touch.
 */
interface FaqListProps {
	heading?: string;
	items?: { question?: string; answer?: string }[];
}

export default function FaqList({
	heading = "",
	items = [],
}: FaqListProps) {
	return (
		<section className="section">
			<h2 data-editable="text" data-prop="heading">
				{heading}
			</h2>

			<div data-editable="array" data-prop="items">
				{items.map((item) => (
					<details key={item.question} className="card" data-editable="array-item">
						<summary>
							<editable-text data-prop="question">{item.question}</editable-text>
						</summary>
						<p data-editable="text" data-type="text" data-prop="answer">
							{item.answer}
						</p>
					</details>
				))}
			</div>
		</section>
	);
}
