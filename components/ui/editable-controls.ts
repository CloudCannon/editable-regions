export default class EditableControls extends HTMLElement {
	protected shadow?: ShadowRoot;
	protected contextMenu?: HTMLUListElement;
	protected buttonRow?: HTMLDivElement;

	private editButton?: HTMLButtonElement;

	render(shadow: ShadowRoot): void {
		const style = document.createElement("style");
		style.textContent = `
	    :host {
				position: absolute;
        z-index: 99999999999;
        top: var(--ccve-editable-outline-width);
        right: var(--ccve-editable-outline-width);
        text-rendering: geometricprecision;
        -webkit-font-smoothing: antialiased;
        display: flex;
        flex-direction: column;
        align-items: end;
      }

      .button-row {
        display: flex;
        background: #fff;
        gap: 12px;
        padding: 6px;
        margin: 4px;
        border-radius: var(--ccve-border-radius);
        width: fit-content;
        border: 1px solid #eee;
        box-shadow: 0 0 16px rgba(0, 0, 0, 0.1);

        & button {
          width: 36px;
          height: 36px;

          &:hover {
            background-color: var(--ccve-color-cc-blue);
            --cc-icon-fill: var(--ccve-color-cloud);
          }
        }
      }

      .context-menu {
        animation: fade-in-up ease 0.2s;
        border-radius: var(--ccve-border-radius);
        background: #fff;
        gap: 12px;
        padding: 10px 6px;
        margin: 4px;
        width: 154px;
        border: 1px solid #eee;
        box-shadow: 0 0 16px rgba(0, 0, 0, 0.1);
        border: 2px solid #cfcfcf;
        display: none;
        pointer-events: none;

        & li {
          list-style: none;
        }

        & button {
          line-height: 24px;
          padding: 10px;
          gap: 10px;
          max-width: 100%;
          display: flex;
          align-items: center;
          font-family: "TT Norms Pro", helvetica, arial, sans-serif;
          font-size: 16px;
        }

        &.open {
          display: block;
          pointer-events: auto;
        }
      }

  		button {
  		  background-color: transparent;
        border: 0;
        padding: 0;

        border-radius: var(--ccve-border-radius);
        cursor: pointer;


        &[draggable=true] {
          cursor: grab;
        }

        &:disabled {
          color: #979797;
          --cc-icon-fill: #979797;
          cursor: not-allowed;

          &:hover {
            background-color: transparent;
            --cc-icon-fill: #979797;
          }
        }
  		}

    @keyframes fade-in-up {
      from {
        opacity: 0.5;
        transform: scale(0.9);
      }

      to {
        opacity: 1;
        transform: scale(1);
      }
    }`;
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
