export default class ErrorCard extends HTMLElement {
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
		style.textContent = `
  		:host {
        display: flex;
  		  background-color: #ffe7ea;
        border-radius: var(--ccve-border-radius);
        padding: var(--ccrt-gap);
        margin: 2px;
        border: 2px solid var(--ccve-color-ruby);
        gap: var(--ccrt-gap);
  		}

      .heading {
        font-size: 1.15em;
        margin-top: 0px;
      }

      pre {
        margin-bottom: 0;
      }

      cc-icon {
        --cc-icon-fill: var(--ccve-color-ruby);
      }
    `;
		shadow.appendChild(style);

		const icon = document.createElement("cc-icon");
		icon.setAttribute("name", "warning");
		shadow.appendChild(icon);

		const body = document.createElement("div");
		shadow.appendChild(body);

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
					.replaceAll(window.location.origin, "")
					.split("\n")
					.slice(0, 5)
					.join("\n");

				body.appendChild(stack);
			}
		}
	}
}

customElements.define("error-card", ErrorCard);

declare global {
	interface HTMLElementTagNameMap {
		"error-card": ErrorCard;
	}
}
