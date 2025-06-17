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

		listener.editable.pushValue(this.value, listener, true);

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

		const rootEl = await component(this.value);
		window.hydrateDataEditables?.(rootEl);

		const child = rootEl.firstElementChild;
		if (
			child instanceof HTMLElement &&
			"editable" in child &&
			child.editable instanceof LiveComponent &&
			child.dataset.component === key
		) {
			child.editable.value = this.value;
			this.element.replaceWith(child);
		} else {
			let targetChild: ChildNode | null | undefined =
				this.element.firstChild ?? undefined;
			let renderChild: ChildNode | null | undefined =
				rootEl.firstChild ?? undefined;
			while (renderChild || targetChild) {
				const nextTargetChild: ChildNode | null | undefined =
					targetChild?.nextSibling ?? undefined;
				const nextRenderChild: ChildNode | null | undefined =
					renderChild?.nextSibling ?? undefined;

				if (renderChild && targetChild) {
					targetChild.replaceWith(renderChild);
				} else if (renderChild) {
					this.element.appendChild(renderChild);
				} else if (targetChild) {
					this.element.removeChild(targetChild);
				}

				targetChild = nextTargetChild;
				renderChild = nextRenderChild;
			}
		}

		this.controlsElement = document.createElement("editable-controls");
		this.controlsElement.addEventListener("edit", (e: any) => {
			console.log(this.resolveSource());
			window.CloudCannon.edit(this.resolveSource(), undefined, e);
		});
		this.element.append(this.controlsElement);
	}

	mount(): void {
		if (!this.controlsElement) {
			this.controlsElement = document.createElement("editable-controls");
			this.controlsElement.addEventListener("edit", (e: any) => {
				console.log(this.resolveSource());
				window.CloudCannon.edit(this.resolveSource(), undefined, e);
			});
			this.element.append(this.controlsElement);
		}
	}
}
