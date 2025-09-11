import type {
	CloudCannonJavaScriptV1APICollection,
	CloudCannonJavaScriptV1APIFile,
} from "@cloudcannon/javascript-api";
import type { CloudCannonJavaScriptV1APIDataset } from "@cloudcannon/javascript-api";
import { hasArrayItemEditable } from "../helpers/checks.js";
import { CloudCannon } from "../helpers/cloudcannon.js";
import { hydrateDataEditables } from "../helpers/hydrate-editables.js";
import type { WindowType } from "../types/window.js";
import type ArrayItem from "./array-item.js";
import Editable from "./editable.js";

declare const window: WindowType;

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

export default class ArrayEditable extends Editable {
	arrayDirection?: ArrayDirection;
	value:
		| CloudCannonJavaScriptV1APICollection
		| CloudCannonJavaScriptV1APIDataset
		| unknown[]
		| null
		| undefined = undefined;

	validateConfiguration(): boolean {
		const prop = this.element.dataset.prop;
		if (typeof prop !== "string") {
			this.element.classList.add("errored");
			const error = document.createElement("error-card");
			error.setAttribute("heading", "Failed to render array editable");
			error.setAttribute("message", "Missing required attribute data-prop");
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
			const error = document.createElement("error-card");
			error.setAttribute("heading", "Failed to render array editable");
			error.setAttribute(
				"message",
				`Illegal value type: ${typeof value}. Supported types are array.`,
			);
			this.element.replaceChildren(error);
			return;
		}
		return value;
	}

	async update(): Promise<void> {
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

		const children: (HTMLElement & { editable: ArrayItem })[] = [];

		for (const child of this.element.querySelectorAll(
			"array-item,[data-editable='array-item']",
		)) {
			if (!hasArrayItemEditable(child)) {
				continue;
			}

			let parent = child.editable.parent?.element ?? child.parentElement;
			while (parent && !("editable" in parent)) {
				parent = parent.parentElement;
			}
			if (!parent || parent.editable !== this) {
				continue;
			}

			children.push(child as any);
		}

		if (!this.element.dataset.idKey) {
			if (children.length > value.length) {
				for (let i = value.length; i < children.length; i++) {
					children[i].remove();
				}
			}

			for (let i = 0; i < value.length; i++) {
				let child = children[i];
				if (!child) {
					child = children[0].cloneNode(true) as HTMLElement & {
						editable: ArrayItem;
					};
					children.push(child);
				}
			}

			children.forEach((child, i) => {
				child.dataset.prop = `${i}`;
				child.dataset.length = `${children.length}`;

				hydrateDataEditables(child);
				child.editable.parent = this;
				child.editable.pushValue(value[i]);

				if (!child.parentElement && i < value.length) {
					this.element.appendChild(child);
				}
			});
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
				componentKeys.push(String((data as any)[componentKey]));
			} else {
				componentKeys.push(null);
			}
		}

		const childKeys = children.map((element) => {
			return element.dataset.id;
		});

		const equal = dataKeys?.every((key, i) => key === childKeys[i]);
		if (equal && children.length === dataKeys?.length) {
			children.forEach((child, index) => {
				child.dataset.prop = `${index}`;
				child.editable.pushValue(value[index]);
			});
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
			const matchingChildIndex = children.findIndex(
				(child, i) => child.dataset.id === key && !moved[i],
			);

			let matchingChild = children[matchingChildIndex];
			if (!matchingChild) {
				const clone = children.find((child) => child.dataset.id === key);
				if (clone) {
					matchingChild = clone.cloneNode(true) as any;
				} else {
					matchingChild = document.createElement("array-item");
					matchingChild.dataset.id = key;

					if (componentKeys[i]) {
						matchingChild.dataset.component = componentKeys[i];
					}
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

			hydrateDataEditables(matchingChild);

			matchingChild.editable.parent = this;
			matchingChild.editable.pushValue(value[i]);
		});

		children.forEach((child, i) => {
			if (!moved[i]) {
				child.remove();
			}
		});
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
	}
}
