import type { WindowType } from "../types/window";

declare const window: WindowType;

export interface EditableListener {
	editable: Editable;
	key?: string;
	path?: string;
}

export default class Editable {
	listeners: EditableListener[] = [];
	value: unknown = undefined;
	parent: Editable | null = null;
	element: HTMLElement;
	mounted = false;

	propsBase: unknown;
	props: Record<string, unknown> = {};

	constructor(element: HTMLElement) {
		this.element = element;
		(element as any).editable = this;
	}

	lookupPath(path: string, obj: unknown): any {
		return path.split(".").reduce((acc, key) => {
			if (acc && typeof acc === "object" && key in acc) {
				return (acc as any)[key];
			}
		}, obj);
	}

	shouldUpdate(_value: unknown) {
		return true;
	}

	getNewValue(value: unknown, listener?: EditableListener): unknown {
		const { key, path } = listener ?? {};
		if (!key) {
			this.propsBase = path ? this.lookupPath(path, value) : value;
		} else {
			this.props[key] = path ? this.lookupPath(path, value) : value;
		}

		if (Object.entries(this.props).length === 0) {
			return this.validateValue(this.propsBase);
		}

		const newValue = Object.entries(this.props).reduce(
			(acc, [key, val]) => {
				(acc as any)[key] = structuredClone(val);
				return acc;
			},
			structuredClone(this.propsBase ?? {}),
		);

		return this.validateValue(newValue);
	}

	pushValue(value: unknown, listener?: EditableListener): void {
		const newValue = this.getNewValue(value, listener);

		if (typeof newValue === "undefined") {
			return;
		}

		if (!this.mounted && this.validateConfiguration()) {
			this.mounted = true;
			this.mount();
		}

		if (this.mounted && this.shouldUpdate(newValue)) {
			this.value = newValue;
			this.update();
		}
	}

	update(): void {
		this.listeners.forEach((listener) =>
			listener.editable.pushValue(this.value, listener),
		);
	}

	validateValue(value: unknown): unknown {
		return value;
	}

	registerListener(listener: EditableListener): void {
		if (
			this.listeners.find(
				({ editable: other, key }) =>
					listener.editable.element === other.element && listener.key === key,
			)
		) {
			return;
		}

		if (this.mounted) {
			listener.editable.pushValue(this.value, listener);
		}

		this.listeners.push(listener);
	}

	deregisterListener(target: Editable): void {
		this.listeners = this.listeners.filter(
			({ editable }) => editable.element !== target.element,
		);
	}

	disconnect(): void {
		this.parent?.deregisterListener(this);
		this.parent = null;
	}

	resolveSource(source?: string): string | undefined {
		if (typeof source !== "string") {
			return this.parent
				? this.parent.resolveSource(this.element.dataset.prop)
				: this.element.dataset.prop;
		}

		// TODO: If source is absolute, return it as is

		const [part, ...rest] = source.split(".");
		const propKey = part.charAt(0).toUpperCase() + part.slice(1);
		const propPath = this.element.dataset[`prop${propKey}`];

		if (propPath) {
			rest.unshift(propPath);
			return this.parent
				? this.parent.resolveSource(rest.join("."))
				: rest.join(".");
		}

		if (typeof this.element.dataset.prop !== "string") {
			throw new Error(`Failed to resolve source "${source}"`);
		}

		if (this.element.dataset.prop) {
			source = `${this.element.dataset.prop}.${source}`;
		}

		return this.parent ? this.parent.resolveSource(source) : source;
	}

	connect(): void {
		Promise.all([
			customElements.whenDefined("array-item"),
			customElements.whenDefined("array-editable"),
			customElements.whenDefined("text-editable"),
			customElements.whenDefined("component-editable"),
			customElements.whenDefined("image-editable"),
			customElements.whenDefined("source-editable"),
			customElements.whenDefined("snippet-editable"),
		]).then(() => {
			this.setupListeners();
			this.validateConfiguration();
		});
	}

	setupListeners(): void {
		let parentEditable: Editable | undefined;
		let parent = this.element.parentElement;
		while (parent) {
			if (
				"editable" in parent &&
				(parent as any).editable instanceof Editable
			) {
				parentEditable = (parent as any).editable;
				break;
			}
			parent = parent.parentElement;
		}

		this.parent = parentEditable || null;

		Object.entries(this.element.dataset).forEach(([propName, propPath]) => {
			if (!propName.startsWith("prop")) {
				return;
			}

			// TODO: Parse the propPath
			// TODO: If the propPath is absolute listen to the API

			const listener = {
				editable: this,
				key:
					propName === "prop" ? undefined : propName.substring(4).toLowerCase(),
				path: propPath,
			};

			if (!parentEditable) {
				const loadCloudCannonValue = async (CloudCannon: any) => {
					const value = await CloudCannon.value({ keepMarkdownAsHTML: false });
					this.pushValue(value, listener);
				};

				document.addEventListener("cloudcannon:load", (e) => {
					(e as any).detail.CloudCannon.enableEvents();
					return loadCloudCannonValue((e as any).detail.CloudCannon);
				});

				document.addEventListener("cloudcannon:update", async (e) => {
					return loadCloudCannonValue((e as any).detail.CloudCannon);
				});
				return;
			}

			parentEditable.registerListener(listener);
		});

		this.element.addEventListener("cloudcannon-api", (e: any) => {
			if (e.target !== this.element) {
				if (!e.detail.source) {
					e.detail.source = this.element.dataset.prop;
				} else {
					const source = e.detail.source;
					const [part, ...rest] = source.split(".");
					const propKey = part.charAt(0).toUpperCase() + part.slice(1);
					const propPath = this.element.dataset[`prop${propKey}`];

					if (propPath) {
						rest.unshift(propPath);
						e.detail.source = rest.join(".");
					} else if (typeof this.element.dataset.prop !== "string") {
						throw new Error(`Failed to resolve source "${source}"`);
					} else if (this.element.dataset.prop) {
						e.detail.source = `${this.element.dataset.prop}.${source}`;
					}
				}
			}

			if (!this.parent) {
				e.stopPropagation();
				this.executeApiCall(e.detail);
			}
		});
	}

	executeApiCall(options: any) {
		switch (options.action) {
			case "edit":
				window.CloudCannon?.edit(options.source);
				break;
			case "set-file-data":
				window.CloudCannon?.setFileData(options.source, options.value);
				break;
			case "set-file-content":
				window.CloudCannonAPI.v1.currentFile().content.set(options.value);
				break;
			case "add-array-item":
				window.CloudCannon?.addArrayItem(
					options.source,
					options.newIndex,
					options.value,
				);
				break;
			case "remove-array-item":
				window.CloudCannon?.removeArrayItem(options.source, options.fromIndex);
				break;
			case "move-array-item":
				window.CloudCannon?.moveArrayItem(
					options.source,
					options.fromIndex,
					options.toIndex,
				);
				break;
		}
	}

	mount(): void {}

	validateConfiguration(): boolean {
		return true;
	}
}
