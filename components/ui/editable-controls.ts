export default class EditableControls extends HTMLElement {
	protected shadow?: ShadowRoot;

	private editButton?: HTMLButtonElement;

	render(shadow: ShadowRoot) {
		const style = document.createElement("style");
		style.textContent = `
	    :host {
				position: absolute;
        z-index: 99999999999;
        display: flex;
        background: #fff;
        gap: 12px;
        padding: 6px;
        margin: 4px;
        border-radius: var(--ccve-border-radius);
        top: var(--ccve-editable-outline-width);
        right: var(--ccve-editable-outline-width);
        width: fit-content;
        border: 1px solid #eee;
        box-shadow: 0 0 16px rgba(0, 0, 0, 0.1);
      }
  		button {
  		  background-color: transparent;
        border: 0;
        padding: 0;
        width: 36px;
        height: 36px;
        border-radius: var(--ccve-border-radius);
        cursor: pointer;

        &[draggable] {
          cursor: grab;
        }

        &:hover {
          background-color: var(--ccve-color-cc-blue);

          & cc-icon {
            --cc-icon-fill: var(--ccve-color-cloud)
          }
        }
  		}
    `;
		shadow.appendChild(style);

		this.editButton = document.createElement("button");
		this.editButton.innerHTML = '<cc-icon name="edit"></cc-icon>';
		this.editButton.onclick = () => {
			this.dispatchEvent(new CustomEvent("edit", { detail: this }));
		};
		shadow.append(this.editButton);
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
