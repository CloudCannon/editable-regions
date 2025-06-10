import LiveComponent from "../nodes/live-component.js";

class LiveComponentComponent extends HTMLElement {
	editable: LiveComponent;

	constructor() {
		super();
		this.editable = new LiveComponent(this);
	}

	connectedCallback(): void {
		this.editable.connect();
	}

	disconnectedCallback(): void {
		this.editable.disconnect();
	}
}

customElements.define("live-component", LiveComponentComponent);

declare global {
	interface HTMLElementTagNameMap {
		"live-component": LiveComponentComponent;
	}
}
