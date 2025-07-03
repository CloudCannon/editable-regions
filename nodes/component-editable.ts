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

declare const window: WindowType;

export default class ComponentEditable extends Editable {
	protected controlsElement?: HTMLElement;

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

		const component = window.cc_components?.[key];
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
		const component = window.cc_components?.[key];
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

		if (!this.controlsElement) {
			throw new Error("Controls element not found");
		}

		this.element.removeChild(this.controlsElement);
		this.updateTree(this.element, rootEl);
		this.element.appendChild(this.controlsElement);
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

			if (isEditableElement(renderChild) && isEditableElement(targetChild)) {
				if (!areEqualEditables(renderChild, targetChild)) {
					targetChild.replaceWith(renderChild);
				} else if (isTextEditable(renderChild) && isTextEditable(targetChild)) {
					if (
						hasTextEditable(targetChild) &&
						!targetChild.editable.focused &&
						!targetChild?.isEqualNode(renderChild) &&
						hasEditable(renderChild)
					) {
						targetChild.replaceWith(renderChild);
						renderChild.editable.pushValue(this.value);
					} else if (hasEditable(targetChild)) {
						targetChild.editable.pushValue(this.value);
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

	mount(): void {
		if (!this.controlsElement) {
			this.controlsElement = document.createElement("editable-controls");
			this.controlsElement.addEventListener("edit", (e: any) => {
				const source = this.resolveSource();
				if (!source) {
					throw new Error("Source not found");
				}
				window.CloudCannon?.edit(source, undefined, e);
			});
			this.element.append(this.controlsElement);
		}
	}
}
