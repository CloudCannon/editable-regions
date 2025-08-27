import {
	areEqualEditables,
	areEqualNodes,
	hasEditable,
	hasTextEditable,
	isEditableElement,
	isTextEditable,
} from "../helpers/checks.js";
import type { WindowType } from "../types/window.js";
import Editable from "./editable.js";
import "../components/ui/error-card.js";
import "../components/ui/editable-controls.js";
import type EditableControls from "../components/ui/editable-controls.js";

declare const window: WindowType;

export default class ComponentEditable extends Editable {
	protected controlsElement?: EditableControls;

	getComponents() {
		return window.cc_components;
	}

	validateConfiguration(): boolean {
		const key = this.element.dataset.component;
		if (!key) {
			this.element.classList.add("errored");
			const error = document.createElement("error-card");
			error.setAttribute("heading", "Failed to render component");
			error.setAttribute(
				"message",
				"Component key(data-component) not provided",
			);
			this.element.replaceChildren(error);
			return false;
		}

		const component = this.getComponents()?.[key];
		if (!component) {
			this.element.classList.add("errored");
			const error = document.createElement("error-card");
			error.setAttribute("heading", "Failed to render component");
			error.setAttribute("message", `Couldn't find component '${key}'`);
			this.element.replaceChildren(error);
			return false;
		}

		return true;
	}

	async update(): Promise<void> {
		this.element.classList.remove("errored");

		const key = this.element.dataset.component;
		if (!key) {
			return super.update();
		}
		const component = this.getComponents()?.[key];
		if (!component) {
			return super.update();
		}

		let rootEl: HTMLElement;
		try {
			rootEl = await component(this.value);
		} catch (err: unknown) {
			this.element.classList.add("errored");
			const error = document.createElement("error-card");
			error.setAttribute("heading", `Failed to render component: ${key}`);
			error.error = err;
			this.element.replaceChildren(error);
			return;
		}
		window.hydrateDataEditables?.(rootEl);

		const child = rootEl.firstElementChild;
		if (
			child instanceof HTMLElement &&
			"editable" in child &&
			child.editable instanceof ComponentEditable &&
			child.dataset.component === key
		) {
			rootEl = child;
		}

		if (this.controlsElement) {
			this.controlsElement.remove();
		}
		this.updateTree(this.element, rootEl);
		if (this.controlsElement) {
			this.element.appendChild(this.controlsElement);
		}
	}

	updateTree(
		targetNode?: ChildNode | null,
		renderNode?: ChildNode | null,
	): void {
		let targetChild: ChildNode | null | undefined =
			targetNode?.firstChild ?? undefined;
		let renderChild: ChildNode | null | undefined =
			renderNode?.firstChild ?? undefined;
		while (renderChild || targetChild) {
			const nextTargetChild: ChildNode | null | undefined =
				targetChild?.nextSibling ?? undefined;
			const nextRenderChild: ChildNode | null | undefined =
				renderChild?.nextSibling ?? undefined;

			if (
				targetChild instanceof Element &&
				renderChild &&
				!(renderChild instanceof Element)
			) {
				targetChild.before(renderChild);
				renderChild = nextRenderChild;
				continue;
			}

			if (
				renderChild instanceof Element &&
				targetChild &&
				!(targetChild instanceof Element)
			) {
				targetChild.remove();
				targetChild = nextTargetChild;
				continue;
			}

			if (
				renderChild &&
				targetChild &&
				!(renderChild instanceof Element) &&
				!(targetChild instanceof Element)
			) {
				targetChild.nodeValue = renderChild.nodeValue;
			} else if (
				isEditableElement(renderChild) &&
				isEditableElement(targetChild)
			) {
				if (!areEqualEditables(renderChild, targetChild)) {
					targetChild.replaceWith(renderChild);
				} else if (isTextEditable(renderChild) && isTextEditable(targetChild)) {
					if (
						hasTextEditable(targetChild) &&
						!targetChild.editable.focused &&
						!targetChild?.isEqualNode(renderChild) &&
						hasEditable(renderChild)
					) {
						for (let i = 0; i < this.listeners.length; i++) {
							targetChild.replaceWith(renderChild);
							const listener = this.listeners[i];
							if (listener.editable.element === targetChild) {
								listener.editable.element = renderChild;
								renderChild.editable.pushValue(this.value, listener);
							}
						}
					} else if (hasEditable(targetChild)) {
						for (let i = 0; i < this.listeners.length; i++) {
							const listener = this.listeners[i];
							if (listener.editable.element === targetChild) {
								targetChild.editable.pushValue(this.value, listener);
							}
						}
					}
				} else if (hasEditable(targetChild)) {
					for (let i = 0; i < this.listeners.length; i++) {
						const listener = this.listeners[i];
						if (listener.editable.element === targetChild) {
							targetChild.editable.pushValue(this.value, listener);
						}
					}
				}
			} else if (renderChild && targetChild) {
				if (
					!areEqualNodes(targetChild, renderChild) ||
					isEditableElement(renderChild) ||
					isEditableElement(targetChild)
				) {
					targetChild.replaceWith(renderChild);
				} else {
					this.updateTree(targetChild, renderChild);
				}
			} else if (renderChild) {
				targetNode?.appendChild(renderChild);
			} else if (targetChild) {
				targetNode?.removeChild(targetChild);
			}

			targetChild = nextTargetChild;
			renderChild = nextRenderChild;
		}
	}

	dispatchEdit(source?: string) {
		this.element.dispatchEvent(
			new CustomEvent("cloudcannon-api", {
				bubbles: true,
				detail: { action: "edit", source },
			}),
		);
	}

	mount(): void {
		if (!this.controlsElement) {
			let editPath: string | undefined;
			Object.entries(this.element.dataset).forEach(([propName, propPath]) => {
				if (!propName.startsWith("prop")) {
					return;
				}

				if (typeof editPath !== "string") {
					editPath = propPath;
					return;
				}

				while (!propPath?.startsWith(editPath)) {
					editPath = editPath?.replace(/(\.|^)[^.]*$/, "");
				}
			});

			editPath ||= this.element.dataset.prop;
			editPath ||= Object.entries(this.element.dataset).find(([propName]) =>
				propName.startsWith("prop"),
			)?.[1];

			if (editPath) {
				this.controlsElement = document.createElement("editable-controls");
				this.controlsElement.addEventListener("edit", (e: any) => {
					this.dispatchEdit(editPath);
				});
				this.element.append(this.controlsElement);
			}
		}
	}
}
