import styleContent from "../../styles/ui/editable-controls.css?inline";

export default class EditableControls extends HTMLElement {
	protected shadow?: ShadowRoot;
	protected contextMenu?: HTMLUListElement;
	protected buttonRow?: HTMLDivElement;

	private editButton?: HTMLButtonElement;

	render(shadow: ShadowRoot): void {
		const style = document.createElement("style");
		style.textContent = styleContent;
		shadow.appendChild(style);

		this.buttonRow = document.createElement("div");
		this.buttonRow.classList.add("button-row");
		shadow.appendChild(this.buttonRow);

		this.contextMenu = document.createElement("ul");
		this.contextMenu.classList.add("context-menu");
		shadow.appendChild(this.contextMenu);

		this.editButton = document.createElement("button");
		this.editButton.innerHTML = '<cc-icon name="edit"></cc-icon>';
		this.editButton.onclick = () => {
			this.dispatchEvent(new CustomEvent("edit", { detail: this }));
		};
		this.buttonRow.append(this.editButton);

		this.onclick = () => {
			this.contextMenu?.classList.remove("open");
			this.removeAttribute("open");
		};

		this.onblur = () => {
			this.contextMenu?.classList.remove("open");
			this.removeAttribute("open");
		};
	}

	connectedCallback() {
		if (this.shadow) {
			return;
		}

		this.shadow = this.attachShadow({ mode: "open" });
		this.render(this.shadow);
	}
}

customElements.define("editable-controls", EditableControls);

declare global {
	interface HTMLElementTagNameMap {
		"editable-controls": EditableControls;
	}
}
