import styleContent from "../../styles/ui/editable-component-controls.css?inline";

export default class EditableComponentControls extends HTMLElement {
	protected shadow?: ShadowRoot;
	protected contextMenu?: HTMLUListElement;
	protected buttonRow?: HTMLDivElement;

	private editButton?: HTMLButtonElement;
	protected usePopoverAPI = false;
	protected contextMenuId =
		`context-menu-popover-${Math.random().toString(36).substring(2, 11)}`;
	protected anchorName = `--${this.contextMenuId}`;
	protected hostAnchorName =
		`--cc-editable-host-${Math.random().toString(36).substring(2, 11)}`;

	toggleContextMenu() {
		if (!this.contextMenu || this.contextMenu.childElementCount === 0) {
			return;
		}

		if (this.usePopoverAPI) {
			this.contextMenu.togglePopover();
			return;
		}

		if (this.contextMenu.classList.contains("open")) {
			this.contextMenu.classList.remove("open");
			this.removeAttribute("open");
		} else {
			this.contextMenu.classList.add("open");
			this.setAttribute("open", "true");
		}
	}

	render(shadow: ShadowRoot): void {
		const style = document.createElement("style");
		style.textContent = styleContent;
		shadow.appendChild(style);

		this.buttonRow = document.createElement("div");
		this.buttonRow.classList.add("button-row");
		shadow.appendChild(this.buttonRow);

		this.contextMenu = document.createElement("ul");
		this.contextMenu.classList.add("context-menu");

		if (this.usePopoverAPI) {
			this.contextMenu.setAttribute("popover", "auto");
			//@ts-expect-error: Typescript doesn't yet support the popover API
			this.contextMenu.style.positionAnchor = this.anchorName;
		}

		shadow.appendChild(this.contextMenu);

		this.editButton = document.createElement("button");
		this.editButton.type = "button";
		this.editButton.innerHTML = '<cc-icon name="edit"></cc-icon>';
		this.editButton.onclick = () => {
			this.dispatchEvent(new CustomEvent("edit", { detail: this }));
		};
		this.buttonRow.append(this.editButton);

		this.onclick = (e) => {
			e.preventDefault();
			this.removeAttribute("open");

			if (this.usePopoverAPI) {
				this.contextMenu?.hidePopover();
			} else {
				this.contextMenu?.classList.remove("open");
			}
		};

		if (this.usePopoverAPI && this.contextMenu) {
			this.contextMenu.ontoggle = (e: ToggleEvent) => {
				if (e.newState === "open") {
					this.setAttribute("open", "true");
				} else {
					this.removeAttribute("open");
				}
			};
		} else {
			this.onblur = (e) => {
				if ((e.relatedTarget as HTMLElement)?.tagName === "A") {
					return;
				}
				this.removeAttribute("open");
				this.contextMenu?.classList.remove("open");
			};
		}
	}

	connectedCallback() {
		if (this.shadow) {
			return;
		}

		this.usePopoverAPI =
			"popover" in HTMLElement.prototype && CSS.supports("anchor-name", "--a");

		this.shadow = this.attachShadow({ mode: "open" });
		this.render(this.shadow);

		if (this.usePopoverAPI && this.parentElement) {
			const existing = getComputedStyle(this.parentElement)
				.getPropertyValue("anchor-name")
				.trim();

			if (existing && existing !== "none") {
				this.hostAnchorName = existing.split(",")[0].trim();
			} else {
				// @ts-expect-error
				this.parentElement.style.anchorName = this.hostAnchorName;
			}

			// @ts-expect-error
			this.style.positionAnchor = this.hostAnchorName;
		}
	}
}

customElements.define("editable-component-controls", EditableComponentControls);

declare global {
	interface HTMLElementTagNameMap {
		"editable-component-controls": EditableComponentControls;
	}
}
