import {
	areEqualEditables,
	hasEditable,
	hasTextEditable,
	isEditableElement,
	isLiveComponent,
	isTextEditable,
} from "../helpers/checks.js";
import type { WindowType } from "../types/window.js";
import Editable, { type EditableListener } from "./editable.js";

declare const window: WindowType;

export default class LiveComponent extends Editable {
	private controlsElement?: HTMLElement;

	registerListener(listener: EditableListener): void {
		if (
			this.listeners.find(
				({ editable: other }) => listener.editable.element === other.element,
			)
		) {
			return;
		}

		listener.editable.pushValue(this.value, listener);

		this.listeners.push(listener);
	}

	async update(): Promise<void> {
		const key = this.element.dataset.component;
		if (!key) {
			throw new Error("Invalid Component: Component key not provided");
		}
		const component = window.cc_components?.[key];
		if (!component) {
			throw new Error(`Invalid Component: Component '${key}' not found`);
		}

		let rootEl: HTMLElement;
		try {
			rootEl = await component(this.value);
		} catch (err: unknown) {
			this.element.innerHTML = `
			<div class="error"><p>Failed to render component: ${key}</p>
			<p>${err instanceof Error ? err.message : "Unknown error"}</p>
			<p>${err instanceof Error ? err.stack : ""}</p>
			</div>`;
			return;
		}
		window.hydrateDataEditables?.(rootEl);

		const child = rootEl.firstElementChild;
		if (
			child instanceof HTMLElement &&
			"editable" in child &&
			child.editable instanceof LiveComponent &&
			child.dataset.component === key
		) {
			rootEl = child;
		}

		this.updateTree(this.element, rootEl);
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
						!targetChild?.isEqualNode(renderChild)
					) {
						targetChild.replaceWith(renderChild);
					}
				} else if (
					isLiveComponent(targetChild) &&
					isLiveComponent(renderChild)
				) {
					if (hasEditable(targetChild)) {
						targetChild.editable.pushValue(this.value);
					}
				}
			} else if (renderChild && targetChild) {
				if (
					!targetChild.isEqualNode(renderChild) ||
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
