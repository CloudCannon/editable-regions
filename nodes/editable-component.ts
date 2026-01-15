import {
	areEqualEditables,
	hasEditable,
	hasEditableText,
	isEditableElement,
	isEditableText,
} from "../helpers/checks.js";
import Editable from "./editable.js";
import "../components/ui/editable-region-error-card.js";
import "../components/ui/editable-component-controls.js";
import type EditableComponentControls from "../components/ui/editable-component-controls.js";
import {
	getEditableComponentRenderers,
	realizeAPIValue,
} from "../helpers/cloudcannon.mjs";

export default class EditableComponent extends Editable {
	protected controlsElement?: EditableComponentControls;

	private updatePromise: Promise<void> | undefined;
	private needsReupdate = false;

	getComponents() {
		return getEditableComponentRenderers();
	}

	shouldMount(): boolean {
		if (super.shouldMount()) {
			return true;
		}

		return !Object.keys(this.element.dataset).some((key) =>
			key.startsWith("prop"),
		);
	}

	validateConfiguration(): boolean {
		const key = this.element.dataset.component;
		if (!key) {
			this.element.classList.add("errored");
			const error = document.createElement("editable-region-error-card");
			error.setAttribute("heading", "Failed to render component");
			error.setAttribute(
				"message",
				"Component editable regions require a 'data-component' HTML attribute but none was provided. Please check that this element has a valid 'data-component' attribute.",
			);
			this.element.replaceChildren(error);
			return false;
		}

		return true;
	}

	update(): Promise<void> {
		if (this.updatePromise) {
			this.needsReupdate = true;
			return this.updatePromise;
		}
		this.updatePromise = this._update().then(() => {
			this.updatePromise = undefined;
			if (this.needsReupdate) {
				this.needsReupdate = false;
				return this.update();
			}
		});
		return this.updatePromise;
	}

	async _update(): Promise<void> {
		this.element.classList.remove("errored");

		const key = this.element.dataset.component;
		if (!key) {
			return super.update();
		}

		let component = this.getComponents()?.[key];
		for (let i = 0; !component && i < 20; i++) {
			await new Promise((resolve) => setTimeout(resolve, 200));
			component = this.getComponents()?.[key];
		}

		if (!component) {
			this.element.classList.add("errored");
			const error = document.createElement("editable-region-error-card");
			error.setAttribute("heading", "Failed to render component");
			error.setAttribute(
				"message",
				`Failed to find a registered component with the key "${key}". This may mean that the provided "data-component" attribute is incorrect or that the component hasn't been registered.`,
			);

			const caseMatch = Object.keys(this.getComponents()).find(
				(k) => k.toLowerCase() === key.toLowerCase(),
			);

			if (Object.keys(this.getComponents()).length === 0) {
				error.setAttribute(
					"hint",
					"There are no registered components currently available. Please check that you've included your registration script and that it's running correctly.",
				);
			} else if (caseMatch) {
				error.setAttribute(
					"hint",
					`The component key "${key}" is not case-sensitive. Did you mean "${caseMatch}"?`,
				);
			}

			this.element.replaceChildren(error);
			return;
		}

		const value = await realizeAPIValue(this.value);
		if (value && typeof value === "object" && !Array.isArray(value)) {
			for (const key of Object.keys(value)) {
				(value as any)[key] = await realizeAPIValue((value as any)[key]);
			}
		}

		let rootEl: HTMLElement;
		try {
			rootEl = await component(value);
		} catch (err: unknown) {
			this.element.classList.add("errored");
			const error = document.createElement("editable-region-error-card");
			error.setAttribute("heading", `Failed to render component: ${key}`);
			error.error = err;
			this.element.replaceChildren(error);
			return;
		}

		const child = rootEl.firstElementChild;
		if (
			child instanceof HTMLElement &&
			"editable" in child &&
			child.editable instanceof EditableComponent &&
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
				targetChild instanceof HTMLElement &&
				renderChild instanceof HTMLElement &&
				isEditableElement(renderChild) &&
				isEditableElement(targetChild)
			) {
				if (!areEqualEditables(renderChild, targetChild)) {
					targetChild.replaceWith(renderChild);
				} else if (isEditableText(renderChild) && isEditableText(targetChild)) {
					if (
						hasEditableText(targetChild) &&
						!targetChild.editable.focused &&
						!targetChild?.isEqualNode(renderChild) &&
						hasEditable(renderChild)
					) {
						targetChild.replaceWith(renderChild);
						for (let i = 0; i < this.listeners.length; i++) {
							const listener = this.listeners[i];
							if (listener.editable.element === targetChild) {
								listener.editable.element = renderChild;
								renderChild.editable.pushValue(
									this.value,
									this.specialProps,
									listener,
									{
										...this.contexts,
										__base_context: this.contextBase ?? {},
									},
								);
							}
						}
					} else if (hasEditable(targetChild)) {
						this.updateEditable(renderChild, targetChild);
					}
				} else if (hasEditable(targetChild)) {
					this.updateEditable(renderChild, targetChild);
				}
			} else if (renderChild && targetChild) {
				if (
					renderChild.nodeName !== targetChild.nodeName ||
					isEditableElement(renderChild) ||
					isEditableElement(targetChild)
				) {
					targetChild.replaceWith(renderChild);
				} else {
					this.updateNode(targetChild, renderChild);
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

	updateNode(targetChild: ChildNode, renderChild: ChildNode) {
		if (targetChild instanceof Element && renderChild instanceof Element) {
			for (const attribute of renderChild.attributes) {
				targetChild.setAttribute(attribute.name, attribute.value);
			}
			for (const attribute of targetChild.attributes) {
				if (!renderChild.hasAttribute(attribute.name)) {
					targetChild.removeAttribute(attribute.name);
				}
			}
		}
	}

	updateEditable(
		renderChild: HTMLElement,
		targetChild: HTMLElement & { editable: Editable },
	) {
		for (const attribute of renderChild.attributes) {
			if (attribute.name !== "class") {
				targetChild.setAttribute(attribute.name, attribute.value);
			}
		}
		for (const attribute of targetChild.attributes) {
			if (
				!renderChild.hasAttribute(attribute.name) &&
				attribute.name !== "class" &&
				attribute.name !== "contenteditable"
			) {
				targetChild.removeAttribute(attribute.name);
			}
		}

		for (const className of renderChild.classList) {
			targetChild.classList.add(className);
		}

		for (const className of targetChild.classList) {
			if (
				!renderChild.classList.contains(className) &&
				!className.includes("ProseMirror")
			) {
				targetChild.classList.remove(className);
			}
		}

		for (let i = 0; i < this.listeners.length; i++) {
			const listener = this.listeners[i];
			if (listener.editable.element === targetChild) {
				targetChild.editable.pushValue(
					this.value,
					this.specialProps,
					listener,
					{
						...this.contexts,
						__base_context: this.contextBase ?? {},
					},
				);
			}
		}
	}

	dispatchEdit(source?: string, originalEvent?: MouseEvent) {
		const rect = this.element.getBoundingClientRect();
		this.element.dispatchEvent(
			new CustomEvent("cloudcannon-api", {
				bubbles: true,
				detail: {
					action: "edit",
					source,
					position: {
						x: originalEvent?.clientX ?? 0,
						y: originalEvent?.clientY ?? 0,
						left: rect.left,
						width: rect.width,
						top: rect.top,
						height: rect.height,
					},
				},
			}),
		);
	}

	setupListeners(): void {
		super.setupListeners();
		const key = this.element.dataset.component;
		if (!key) {
			return;
		}

		const component = this.getComponents()?.[key];
		if (!component) {
			document.addEventListener(
				`editable-regions:registered-${key}`,
				() => this.update(),
				{ once: true },
			);
		}
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
				this.controlsElement = document.createElement(
					"editable-component-controls",
				);
				this.controlsElement.addEventListener("edit", (_e: any) => {
					this.dispatchEdit(editPath);
				});
				this.element.append(this.controlsElement);
			}

			this.update();
		}
	}
}
