import type {
	CloudCannonJavaScriptV1APICollection,
	CloudCannonJavaScriptV1APIDataset,
	CloudCannonJavaScriptV1APIFile,
} from "@cloudcannon/javascript-api";
import type EditableArrayItemComponent from "../components/editable-array-item-component.js";
import type EditableRegionButton from "../components/ui/editable-region-button.js";
import { isEditableElement } from "../helpers/checks.js";
import { CloudCannon } from "../helpers/cloudcannon.js";
import type EditableArrayItem from "./editable-array-item.js";
import Editable, { type EditableListener } from "./editable.js";
import "../components/ui/editable-region-button.js";

const arrayDirectionValues = [
	"row",
	"column",
	"row-reverse",
	"column-reverse",
] as const;

export type ArrayDirection = (typeof arrayDirectionValues)[number];

function isArrayDirection(value: unknown): value is ArrayDirection {
	return arrayDirectionValues.includes(value as ArrayDirection);
}

export default class EditableArray extends Editable {
	arrayDirection?: ArrayDirection;
	value:
		| CloudCannonJavaScriptV1APICollection
		| CloudCannonJavaScriptV1APIDataset
		| unknown[]
		| null
		| undefined = undefined;

	private updatePromise: Promise<void> | undefined;
	private needsReupdate = false;
	private addButton?: EditableRegionButton;

	async registerListener(listener: EditableListener): Promise<void> {
		if (!this.value) {
			return;
		}

		let value: unknown[] | CloudCannonJavaScriptV1APIFile[];
		if (CloudCannon.isAPICollection(this.value)) {
			value = await this.value.items();
		} else if (CloudCannon.isAPIDataset(this.value)) {
			const items = await this.value.items();
			if (Array.isArray(items)) {
				value = items;
			} else {
				const data = await items.data.get();
				value = Array.isArray(data) ? data : [];
			}
		} else if (Array.isArray(this.value)) {
			value = this.value;
		} else {
			value = [];
		}

		if (!listener.path) {
			let index = 0;
			for (const child of this.element.querySelectorAll(
				"editable-array-item,[data-editable='array-item']",
			)) {
				let parent = child.parentElement;
				while (parent instanceof HTMLElement && !isEditableElement(parent)) {
					parent = parent.parentElement;
				}

				if (parent !== this.element) {
					continue;
				}

				if (child === listener.editable.element) {
					listener.path = `${index}`;
					break;
				}

				index += 1;
			}
		}

		if (listener.path) {
			listener.editable.pushValue(value, listener, {
				__base_context: this.contextBase ?? {},
			});
		}
	}

	deregisterListener(_target: Editable): void {}

	validateConfiguration(): boolean {
		const prop = this.element.dataset.prop;
		if (typeof prop !== "string") {
			this.element.classList.add("errored");
			const error = document.createElement("editable-region-error-card");
			error.setAttribute("heading", "Failed to render array editable");
			error.setAttribute(
				"message",
				"Array editable regions require a 'data-prop' HTML attribute but none was provided. Please check that this element has a valid 'data-prop' attribute.",
			);
			this.element.replaceChildren(error);
			return false;
		}

		return true;
	}

	validateValue(value: unknown): this["value"] {
		if (
			!Array.isArray(value) &&
			value !== null &&
			!CloudCannon.isAPICollection(value) &&
			!CloudCannon.isAPIDataset(value)
		) {
			this.element.classList.add("errored");
			const error = document.createElement("editable-region-error-card");
			error.setAttribute("heading", "Failed to render array editable");
			error.setAttribute(
				"message",
				`Array editable regions expect to receive a value of type "array" but instead received a value of type '${typeof value}'.`,
			);
			if (this.contextBase?.fullPath) {
				error.setAttribute(
					"hint",
					`This may mean that the 'data-prop' attribute is incorrectly set for this element, the full 'data-prop' path was '${this.contextBase?.fullPath}'.`,
				);
			} else {
				error.setAttribute(
					"hint",
					`This may mean that the 'data-prop' attribute is incorrectly set for this element.`,
				);
			}
			this.element.replaceChildren(error);
			return;
		}
		return value;
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

	private async _update(): Promise<void> {
		let value: unknown[] | CloudCannonJavaScriptV1APIFile[];
		if (CloudCannon.isAPICollection(this.value)) {
			value = await this.value.items();
		} else if (CloudCannon.isAPIDataset(this.value)) {
			const items = await this.value.items();
			if (Array.isArray(items)) {
				value = items;
			} else {
				const data = await items.data.get();
				value = Array.isArray(data) ? data : [];
			}
		} else if (Array.isArray(this.value)) {
			value = this.value;
		} else {
			value = [];
		}

		const children: (HTMLElement & { editable?: EditableArrayItem })[] = [];

		for (const child of this.element.querySelectorAll(
			"editable-array-item,[data-editable='array-item'],array-placeholder",
		)) {
			let parent = child.parentElement;
			while (parent instanceof HTMLElement && !isEditableElement(parent)) {
				parent = parent.parentElement;
			}

			if (parent !== this.element) {
				continue;
			}

			children.push(child as any);
		}

		if (
			children.length === 0 &&
			!this.element.dataset.component &&
			!this.element.dataset.componentKey
		) {
			const error = document.createElement("editable-region-error-card");
			error.setAttribute("heading", "Failed to render array editable region");
			error.setAttribute(
				"message",
				"Array editable regions with no child array items must have either a 'data-component' attribute or a 'data-component-key' attribute. Please add an item to this array then save and rebuild to see your changes or add a 'data-component' or 'data-component-key' attribute to this element.",
			);
			this.element.replaceChildren(error);
			return;
		}

		if (!this.element.dataset.idKey) {
			while (children.length > value.length) {
				children.pop()?.remove();
			}

			if (value.length === 0 && this.addButton) {
				this.element.appendChild(this.addButton);
				return;
			}

			this.addButton?.remove();

			for (let i = 0; i < value.length; i++) {
				let child = children[i];
				if (!child) {
					if (this.element.dataset.component) {
						child = document.createElement(
							"editable-array-item",
						) as EditableArrayItemComponent;
					} else {
						// Empty arrays should be caught by the error case above so children[0] should always exist
						child = children[0].cloneNode(true) as HTMLElement & {
							editable?: EditableArrayItem;
						};
					}
					this.element.appendChild(child);
				}

				if (this.element.dataset.component) {
					child.dataset.component = this.element.dataset.component;
				}
				child.dataset.prop = `${i}`;
				child.dataset.length = `${children.length}`;
				child.editable?.pushValue(
					value,
					{ path: `${i}`, editable: child.editable },
					{ __base_context: this.contextBase ?? {} },
				);
			}
			return;
		}

		const key = this.element.dataset.idKey;
		const componentKey = this.element.dataset.componentKey;
		const dataKeys: (string | null)[] = [];
		const componentKeys: (string | null)[] = [];
		for (const item of value) {
			let data = item;
			if (CloudCannon.isAPIFile(item)) {
				data = await item.data.get();
			}

			if (data && typeof data === "object" && key) {
				dataKeys.push(String((data as any)[key]));
			} else {
				dataKeys.push(null);
			}

			if (data && typeof data === "object" && componentKey) {
				const component = (data as any)[componentKey];
				if (typeof component !== "undefined" && component !== null) {
					componentKeys.push(String((data as any)[componentKey]));
				} else {
					componentKeys.push(null);
				}
			}
		}

		const childKeys = children.map((element) => {
			return element.dataset.id;
		});

		const equal = dataKeys?.every((key, i) => key === childKeys[i]);
		if (equal && children.length === dataKeys?.length) {
			children.forEach((child, index) => {
				child.dataset.prop = `${index}`;
				child.dataset.length = `${children.length}`;
				child.editable?.pushValue(
					value,
					{ path: `${index}`, editable: child.editable },
					{ __base_context: this.contextBase ?? {} },
				);
			});

			if (dataKeys.length === 0 && this.addButton) {
				this.element.appendChild(this.addButton);
			} else {
				this.addButton?.remove();
			}
			return;
		}

		const placeholders = children.map((child) => {
			const placeholder = document.createElement("array-placeholder");
			child.after(placeholder);
			return placeholder;
		});

		const moved: Record<number, boolean> = {};

		dataKeys?.forEach((key, i) => {
			if (!key) {
				return;
			}
			const placeholder = placeholders[i];
			const existingElement = children[i];
			const componentKey = componentKeys[i] || this.element.dataset.component;

			const matchingChildIndex = children.findIndex(
				(child, i) => child.dataset.id === key && !moved[i],
			);

			let matchingChild = children[matchingChildIndex];
			if (!matchingChild) {
				const clone = children.find((child) => child.dataset.id === key);
				if (clone) {
					matchingChild = clone.cloneNode(true) as any;
				} else if (componentKey) {
					matchingChild = document.createElement(
						"editable-array-item",
					) as EditableArrayItemComponent;
					matchingChild.dataset.id = key;
					matchingChild.dataset.component = componentKey;
				} else {
					const error = document.createElement("editable-region-error-card");
					error.setAttribute("heading", "Failed to render array item");
					if (typeof this.element.dataset.componentKey === "string") {
						error.setAttribute(
							"message",
							"Array editable region has no child with a matching 'data-id' value for this element and the value has no key matching the 'data-component-key' attribute. Please check that the 'data-component-key' attribute for this element is correct and that each element has an entry for that key, or provide a fallback 'data-component' attribute.",
						);
						error.setAttribute(
							"hint",
							`This may mean that the value for 'data-component-key' is incorrect or that your array data is incorrectly formatted.
							The current value for 'data-component-key' is '${this.element.dataset.componentKey}' and the current value for 'data-id' is '${key}'.
							`,
						);
					} else {
						error.setAttribute(
							"message",
							"Array editable region has no child with a matching 'data-id' value for this element and no 'data-component' or 'data-component-key' attribute. Please save and rebuild to see your changes or add a 'data-component' or 'data-component-key' attribute to this element.",
						);
						error.setAttribute(
							"hint",
							`The full value of "data-id" for this item is "${key}"`,
						);
					}
					matchingChild = document.createElement("array-placeholder");
					matchingChild.append(error);
				}
			} else {
				moved[matchingChildIndex] = true;
			}

			matchingChild.dataset.id = String(key);
			matchingChild.dataset.prop = `${i}`;

			if (existingElement === matchingChild) {
				placeholder.remove();
			} else if (placeholder) {
				placeholder.replaceWith(matchingChild);
			} else {
				this.element.appendChild(matchingChild);
			}

			if (matchingChild.editable) {
				matchingChild.editable.parent = this;
				matchingChild.editable.pushValue(
					value,
					{ path: `${i}`, editable: matchingChild.editable },
					{ __base_context: this.contextBase ?? {} },
				);
			}
		});

		children.forEach((child, i) => {
			if (!moved[i]) {
				child.remove();
			}
		});

		if (dataKeys.length === 0 && this.addButton) {
			this.element.appendChild(this.addButton);
		} else {
			this.addButton?.remove();
		}
	}

	calculateArrayDirection(): ArrayDirection {
		if (isArrayDirection(this.element.dataset.direction)) {
			return this.element.dataset.direction;
		}

		const computedStyles = getComputedStyle(this.element);
		if (
			computedStyles.display === "flex" &&
			isArrayDirection(computedStyles.flexDirection)
		) {
			return computedStyles.flexDirection;
		}

		return "column";
	}

	mount(): void {
		this.arrayDirection = this.calculateArrayDirection();

		this.addButton = document.createElement("editable-region-button");
		this.addButton.setAttribute("icon", "add");
		this.addButton.setAttribute("text", "Add Item");
		this.addButton.addEventListener("button-click", () => {
			this.element.dispatchEvent(
				new CustomEvent("cloudcannon-api", {
					bubbles: true,
					detail: {
						source: this.element.dataset.prop,
						action: "add-array-item",
						newIndex: 0,
					},
				}),
			);
		});
	}
}
