/**
 * Registered as `testimonial`.
 *
 * Small on purpose: it sits directly between two much larger component regions,
 * so it tests whether adjacent re-render scopes stay in their own lane.
 * `featured` drives both a class binding and a conditional element.
 */
interface TestimonialCardProps {
	quote?: string;
	author?: string;
	role?: string;
	avatar?: string;
	featured?: boolean;
}

export default function TestimonialCard({
	quote = "",
	author = "",
	role = "",
	avatar = "",
	featured = false,
}: TestimonialCardProps) {
	return (
		<section className="section">
			<figure className={`card${featured ? " card--featured" : ""}`}>
				{featured ? <p className="pill">Customer story</p> : null}

				<blockquote>
					<editable-text data-prop="quote" data-type="text">
						{quote}
					</editable-text>
				</blockquote>

				<figcaption>
					{avatar ? (
						<editable-image data-prop-src="avatar">
							<img src={avatar} alt={author} width="48" height="48" />
						</editable-image>
					) : null}
					<strong data-editable="text" data-prop="author">{author}</strong>
					<span data-editable="text" data-prop="role">{role}</span>
				</figcaption>
			</figure>
		</section>
	);
}
