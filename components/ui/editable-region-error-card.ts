import styleContent from "../../styles/ui/editable-region-error-card.css?inline";

export default class EditableRegionErrorCard extends HTMLElement {
	private _error?: unknown;
	private shadow?: ShadowRoot;

	set error(err: unknown) {
		this._error = err;
		if (this.shadow) {
			this.render(this.shadow, this._error);
		}
	}

	connectedCallback() {
		if (this.shadow) {
			return;
		}

		this.shadow = this.attachShadow({ mode: "open" });

		this.render(this.shadow, this._error);
	}

	render(shadow: ShadowRoot, error: unknown) {
		const style = document.createElement("style");
		style.textContent = styleContent;
		shadow.appendChild(style);

		const container = document.createElement("div");
		container.className = "container";
		shadow.appendChild(container);

		const icon = document.createElement("cc-icon");
		icon.setAttribute("name", "warning");
		container.appendChild(icon);

		const body = document.createElement("div");
		container.appendChild(body);

		const heading = document.createElement("p");
		heading.className = "heading";
		heading.innerHTML = this.getAttribute("heading") ?? "Error";

		body.appendChild(heading);

		if (this.hasAttribute("message")) {
			const message = document.createElement("p");
			message.innerHTML = this.getAttribute("message") ?? "";

			body.appendChild(message);
		} else if (error instanceof Error) {
			const message = document.createElement("p");
			message.innerHTML = error.message;

			body.appendChild(message);

			if (error.stack) {
				const stack = document.createElement("pre");
				stack.innerHTML = error.stack
					.replace(new RegExp(window.location.origin, "g"), "")
					.split("\n")
					.slice(0, 5)
					.join("\n");

				body.appendChild(stack);
			}
		}
	}
}

customElements.define("editable-region-error-card", EditableRegionErrorCard);

declare global {
	interface HTMLElementTagNameMap {
		"editable-region-error-card": EditableRegionErrorCard;
	}
}
