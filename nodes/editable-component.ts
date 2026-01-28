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
	private pendingPartialSubtree?: ChildNode | null;

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

	update(partialSubtree?: ChildNode | null): Promise<void> {
		if (this.updatePromise) {
			this.needsReupdate = true;
			this.pendingPartialSubtree = partialSubtree;
			return this.updatePromise;
		}
		this.updatePromise = this._update(partialSubtree).then(() => {
			this.updatePromise = undefined;
			if (this.needsReupdate) {
				this.needsReupdate = false;
				const savedPartialSubtree = this.pendingPartialSubtree;
				this.pendingPartialSubtree = undefined;
				return this.update(savedPartialSubtree);
			}
		});
		return this.updatePromise;
	}

	santiseComponentOutput(el: HTMLElement): HTMLElement {
		el.querySelectorAll("noscript").forEach((el) => el.remove());
		return el;
	}

	async _update(partialSubtree?: ChildNode | null): Promise<void> {
		if (partialSubtree) {
			if (this.controlsElement) {
				this.controlsElement.remove();
			}
			this.updateTree(this.element, partialSubtree);
			if (this.controlsElement) {
				this.element.appendChild(this.controlsElement);
			}
			return;
		}

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
			rootEl = this.santiseComponentOutput(await component(value));
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
		let nextTargetChild: ChildNode | null | undefined =
			targetNode?.firstChild ?? undefined;
		let nextRenderChild: ChildNode | null | undefined =
			renderNode?.firstChild ?? undefined;

		while (nextRenderChild || nextTargetChild) {
			const targetChild: ChildNode | null | undefined = nextTargetChild;
			const renderChild: ChildNode | null | undefined = nextRenderChild;

			nextTargetChild = targetChild?.nextSibling ?? undefined;
			nextRenderChild = renderChild?.nextSibling ?? undefined;

			// There is an existing node in the DOM but no rendered node in it's place
			if (!renderChild && targetChild) {
				targetNode?.removeChild(targetChild);
				continue;
			}

			// There is a node to be rendered, but no existing node in the DOM in it's place
			if (renderChild && !targetChild) {
				targetNode?.appendChild(renderChild);
				continue;
			}

			if (!targetChild || !renderChild) {
				throw new Error("Illegal rendering state, both children should exist ");
			}

			// The existing child is an element and the rendered child is a node (i.e. some text)
			if (targetChild instanceof Element && !(renderChild instanceof Element)) {
				// Render the (text) node before the element and skip to the next rendered child
				targetChild.before(renderChild);
				nextTargetChild = targetChild;
				continue;
			}

			// The existing child is a node (i.e. some text) and the rendered child is an element
			if (renderChild instanceof Element && !(targetChild instanceof Element)) {
				// Delete the (text) node and skip to the next existing child
				targetChild.remove();
				nextRenderChild = renderChild;
				continue;
			}

			// Both existing and rendered children are nodes (i.e. some text)
			if (
				!(renderChild instanceof Element) &&
				!(targetChild instanceof Element)
			) {
				// Render the offscreen node's content into the existing node.
				targetChild.nodeValue = renderChild.nodeValue;
				continue;
			}

			// Both children are elements but are different types
			if (renderChild.nodeName !== targetChild.nodeName) {
				targetChild.replaceWith(renderChild);
				continue;
			}

			// Both existing and rendered children are the same kind of element, and neither is editable
			if (!isEditableElement(renderChild) && !isEditableElement(targetChild)) {
				// Update the existing element to match the rendered element and recurse their subtrees
				this.updateNode(targetChild, renderChild);
				this.updateTree(targetChild, renderChild);
				continue;
			}

			if (
				!(renderChild instanceof HTMLElement) ||
				!(targetChild instanceof HTMLElement)
			) {
				throw new Error("Illegal state, both children should be elements");
			}

			// The existing and rendered child either aren't both editable or are different kinds of editables
			if (!areEqualEditables(renderChild, targetChild)) {
				targetChild.replaceWith(renderChild);
				continue;
			}

			if (!isEditableElement(renderChild) || !isEditableElement(targetChild)) {
				throw new Error("Illegal state, both children should be editable");
			}

			// Both elements are editable but the existing element hasn't hydrated
			if (!hasEditable(targetChild)) {
				targetChild.replaceWith(renderChild);
				continue;
			}

			// The existing and rendered child are the same kind of non-text editable.
			if (!isEditableText(targetChild)) {
				this.updateEditable(renderChild, targetChild);
				continue;
			}

			// The existing element is currently focused or is already the same as the rendered element
			if (
				(hasEditableText(targetChild) && targetChild.editable.focused) ||
				targetChild?.isEqualNode(renderChild)
			) {
				this.updateEditable(renderChild, targetChild);
      } else {
        targetChild.replaceWith(renderChild);
			}

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
					renderChild,
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
