import type {
	CloudCannonJavaScriptV1APICollection,
	CloudCannonJavaScriptV1APIDataset,
	CloudCannonJavaScriptV1APIFile,
} from "@cloudcannon/javascript-api";
import { hasEditable } from "../helpers/checks";
import { apiLoadedPromise, CloudCannon } from "../helpers/cloudcannon.mjs";

declare global {
	interface HTMLElement {
		__pendingEditableListeners?: EditableListener[];
	}
}

export interface EditableListener {
	editable: Editable;
	key?: string;
	path?: string;
}

export interface EditableContext {
	fullPath?: string;
	filePath?: string;
	isContent?: boolean;
	file?: CloudCannonJavaScriptV1APIFile;
	collection?: CloudCannonJavaScriptV1APICollection;
	dataset?: CloudCannonJavaScriptV1APIDataset;
}

export interface DOMListener {
	fn: (e: any) => void;
	event: string;
}

export interface APIListener {
	fn: (e: any) => void;
	obj:
		| CloudCannonJavaScriptV1APIFile
		| CloudCannonJavaScriptV1APICollection
		| CloudCannonJavaScriptV1APIDataset;
}

export default class Editable {
	APIListeners: APIListener[] = [];
	listeners: EditableListener[] = [];
	domListeners: DOMListener[] = [];
	value: unknown = undefined;
	parent: Editable | null = null;
	pendingParentElement: HTMLElement | null = null;
	element: HTMLElement;
	mounted = false;
	connected = false;
	disconnecting = false;
	needsReconnect = false;

	specialPropListeners: EditableListener[] = [];
	specialProps: Record<string, unknown> = {};
	propsBase: unknown;
	contextBase?: EditableContext;
	props: Record<string, unknown> = {};
	contexts: Record<string, EditableContext> = {};
	connectPromise?: Promise<void>;

	constructor(element: HTMLElement) {
		this.element = element;
		(element as any).editable = this;
	}

	async lookupPath(path: string, obj: unknown): Promise<any> {
		if (!path) {
			return obj;
		}
		return path.split(".").reduce(async (acc, key) => {
			acc = await acc;

			if (CloudCannon.isAPICollection(acc)) {
				acc = await acc.items();
			} else if (CloudCannon.isAPIFile(acc)) {
				if (key === "@content") {
					return acc.content.get();
				}
				acc = await acc.data.get();
			} else if (CloudCannon.isAPIDataset(acc)) {
				const items = await acc.items();
				if (Array.isArray(items)) {
					acc = items;
				} else {
					acc = await items.data.get();
				}
			}

			if (acc && typeof acc === "object" && key in acc) {
				return (acc as any)[key];
			}
		}, obj);
	}

	async lookupPathAndContext(
		path?: string,
		obj?: unknown,
		contexts: { [key: string]: EditableContext } = {},
	): Promise<{ value: any; context: EditableContext }> {
		if (!path) {
			return {
				value: obj,
				context: {
					...contexts.__base_context,
				},
			};
		}

		let value: any = obj;
		let context: EditableContext | undefined;

		for (const key of path.split(".")) {
			if (!context && contexts[key]) {
				context = {
					...contexts[key],
				};
			} else {
				context = context ?? {
					...contexts.__base_context,
				};
			}

			if (CloudCannon.isAPICollection(value)) {
				context.collection = value;
				value = await value.items();
			} else if (CloudCannon.isAPIFile(value)) {
				context.file = value;
				if (key !== "@content") {
					value = await value.data.get();
				}
			} else if (CloudCannon.isAPIDataset(value)) {
				context.dataset = value;
				const items = await value.items();
				if (Array.isArray(items)) {
					value = items;
				} else {
					context.file = items;
					value = await items.data.get();
				}
			}

			if (key === "@content" && CloudCannon.isAPIFile(value)) {
				context.isContent = true;
				value = await value.content.get();
			} else if (value && typeof value === "object" && key in value) {
				value = (value as any)[key];
			} else {
				value = undefined;
			}

			context.fullPath = context.fullPath ? `${context.fullPath}.${key}` : key;
			if (context.file) {
				context.filePath = context.filePath
					? `${context.filePath}.${key}`
					: key;
			}
		}
		return {
			value,
			context: context ?? {},
		};
	}

	shouldUpdate(_value: unknown) {
		return true;
	}

	shouldMount() {
		return this.value !== undefined;
	}

	getLiteralProps() {
		let literalPropsBase: unknown;
		const literalProps: Record<string, unknown> = {};
		Object.entries(this.element.dataset).forEach(([propName, propPath]) => {
			if (!propName.startsWith("literal") || typeof propPath !== "string") {
				return;
			}

			const key =
				propName === "prop" ? undefined : propName.substring(7).toLowerCase();
			let value = propPath;
			try {
				value = JSON.parse(value);
			} catch (_error) {
				// Error intentionally ignored
			}

			if (key) {
				literalProps[key] = value;
			} else {
				literalPropsBase = value;
			}
		});
		return { literalPropsBase, literalProps };
	}

	async getNewValue(
		value: unknown,
		specialProps: Record<string, unknown>,
		listener?: EditableListener,
		contexts?: { [key: string]: EditableContext },
	): Promise<unknown> {
		const { key, path } = listener ?? {};

		if (typeof path === "string") {
			const { value: resolvedValue, context: newContext } =
				await this.lookupPathAndContext(path, value, contexts);

			if (!key) {
				this.propsBase = resolvedValue;
				this.contextBase = newContext;
			} else {
				this.props[key] = resolvedValue;
				this.contexts[key] = newContext;
			}
		}

		this.specialProps = this.getSpecialProps(specialProps);
		const { literalPropsBase, literalProps } = this.getLiteralProps();

		let newValue: unknown;
		const specialPropsBase = this.specialPropListeners.find(({ key }) => !key);

		if (this.propsBase !== undefined) {
			newValue = this.propsBase;
		} else if (specialPropsBase?.path) {
			newValue = structuredClone(this.specialProps[specialPropsBase.path]);
		} else if (literalPropsBase !== undefined) {
			newValue = literalPropsBase;
		}

		if (Object.entries(this.props).length > 0) {
			newValue = Object.entries(this.props).reduce(
				(acc, [key, val]) => {
					(acc as any)[key] = structuredClone(val);
					return acc;
				},
				newValue && typeof newValue === "object"
					? structuredClone(newValue)
					: {},
			);
		}

		const filteredSpecialPropsListener = this.specialPropListeners.filter(
			({ key }) => !!key,
		);
		if (filteredSpecialPropsListener.length > 0) {
			newValue = filteredSpecialPropsListener.reduce(
				(acc, { key, path }) => {
					if (key && path) {
						(acc as any)[key] = structuredClone(this.specialProps[path]);
					}
					return acc;
				},
				structuredClone(
					newValue && typeof newValue === "object"
						? structuredClone(newValue)
						: {},
				),
			);
		}

		if (Object.entries(literalProps).length > 0) {
			newValue = Object.entries(literalProps).reduce(
				(acc, [key, val]) => {
					(acc as any)[key] = structuredClone(val);
					return acc;
				},
				newValue && typeof newValue === "object"
					? structuredClone(newValue)
					: {},
			);
		}

		return this.validateValue(newValue);
	}

	async pushValue(
		value: unknown,
		specialProps: Record<string, unknown>,
		listener?: EditableListener,
		contexts?: { [key: string]: EditableContext },
	): Promise<void> {
		const newValue = await this.getNewValue(
			value,
			specialProps,
			listener,
			contexts,
		);

		if (typeof newValue === "undefined" || !this.shouldUpdate(newValue)) {
			return;
		}

		this.value = newValue;
		if (this.connected && !this.mounted) {
			this.mounted = true;
			this.mount();
			return this.update();
		}

		if (this.mounted) {
			return this.update();
		}
	}

	update(): void {
		this.listeners.forEach((listener) =>
			listener.editable.pushValue(this.value, this.specialProps, listener, {
				...this.contexts,
				__base_context: this.contextBase ?? {},
			}),
		);
	}

	validateValue(value: unknown): unknown {
		return value;
	}

	registerListener(listener: EditableListener): void {
		if (this.value !== undefined) {
			listener.editable.pushValue(this.value, this.specialProps, listener, {
				...this.contexts,
				__base_context: this.contextBase ?? {},
			});
		}

		if (
			this.listeners.find(
				({ editable: other, key }) =>
					listener.editable.element === other.element && listener.key === key,
			)
		) {
			return;
		}

		this.listeners.push(listener);
	}

	deregisterListener(target: Editable): void {
		this.listeners = this.listeners.filter(
			({ editable }) => editable.element !== target.element,
		);
	}

	private queueListenerOnParent(
		parentElement: HTMLElement,
		listener: EditableListener,
	): void {
		if (!parentElement.__pendingEditableListeners) {
			parentElement.__pendingEditableListeners = [];
		}
		parentElement.__pendingEditableListeners.push(listener);
	}

	private replayPendingListeners(): void {
		const pending = this.element.__pendingEditableListeners;
		if (!pending || pending.length === 0) {
			return;
		}
		this.element.__pendingEditableListeners = [];
		for (const listener of pending) {
			listener.editable.parent = this;
			listener.editable.pendingParentElement = null;
			this.registerListener(listener);
		}
	}

	async disconnect(): Promise<void> {
		if (this.disconnecting) {
			return;
		}
		this.disconnecting = true;

		if (this.connectPromise) {
			await this.connectPromise;
		}

		this.parent?.deregisterListener(this);
		this.parent = null;
		if (this.pendingParentElement) {
			const pending = this.pendingParentElement.__pendingEditableListeners;
			if (pending) {
				this.pendingParentElement.__pendingEditableListeners = pending.filter(
					(listener) => listener.editable !== this,
				);
			}
			this.pendingParentElement = null;
		}
		this.APIListeners.forEach(({ obj, fn }) => {
			obj.removeEventListener("change", fn);
			obj.removeEventListener("delete", fn);
		});
		this.APIListeners = [];
		this.domListeners.forEach(({ event, fn }) => {
			this.element.removeEventListener(event, fn);
		});
		this.domListeners = [];
		this.specialPropListeners = [];
		this.connected = false;
		this.connectPromise = undefined;
		this.disconnecting = false;

		if (this.needsReconnect) {
			this.needsReconnect = false;
			this.connect();
		}
	}

	connect(): void {
		if (!this.validateConfiguration()) {
			return;
		}

		if (this.disconnecting) {
			this.needsReconnect = true;
			return;
		}
		if (this.connectPromise) {
			return;
		}
		this.connectPromise = apiLoadedPromise.then(() => {
			this.setupListeners();
			this.connected = true;
			if (!this.mounted && this.shouldMount()) {
				this.mounted = true;
				this.mount();
				this.update();
			}
		});
	}

	addEventListener(event: string, fn: (e: any) => void): void {
		this.domListeners.push({ event, fn });
		this.element.addEventListener(event, fn);
	}

	setupListeners(): void {
		let parentElement: HTMLElement | null = null;
		let parent = this.element.parentElement;
		while (parent) {
			if (
				parent.tagName.startsWith("EDITABLE-") ||
				"editable" in parent.dataset
			) {
				parentElement ??= parent;
			}

			if (parent.tagName === "A") {
				parent.draggable = false;
			}
			parent = parent.parentElement;
		}

		let hasParentListener = false;

		if (parentElement && hasEditable(parentElement)) {
			this.parent = parentElement.editable;
		} else if (parentElement) {
			this.pendingParentElement = parentElement;
		}

		Object.entries(this.element.dataset).forEach(([propName, propPath]) => {
			if (!propName.startsWith("prop") || typeof propPath !== "string") {
				return;
			}

			const { collection, file, dataset, source, absolute, currentFile } =
				this.parseSource(propPath);

			const listener = {
				editable: this,
				key:
					propName === "prop" ? undefined : propName.substring(4).toLowerCase(),
				path: source,
			};

			if (!absolute && source.startsWith("@") && source !== "@content") {
				this.specialPropListeners.push(listener);
				return;
			}

			if (!absolute && this.parent) {
				hasParentListener = true;
				this.parent.registerListener(listener);
				return;
			}

			if (!absolute && this.pendingParentElement) {
				hasParentListener = true;
				this.queueListenerOnParent(this.pendingParentElement, listener);
				return;
			}

			// Any single data path should only be able to refer to a single absolute API object
			const obj = collection || dataset || file;
			if (obj) {
				const fullPath = collection
					? `@collections[${collection.collectionKey}]`
					: dataset
						? `@data[${dataset.datasetKey}]`
						: currentFile
							? undefined
							: `@file[${file?.path}]`;
				const handleAPIChange = () => {
					this.pushValue(obj, {}, listener, {
						__base_context: { fullPath },
					});
				};
				this.APIListeners.push({
					obj,
					fn: handleAPIChange,
				});
				obj.addEventListener("change", handleAPIChange);
				obj.addEventListener("delete", handleAPIChange);
				handleAPIChange();
			}
		});

		if (this.parent && !hasParentListener) {
			this.parent.registerListener({ editable: this });
		} else if (this.pendingParentElement && !hasParentListener) {
			this.queueListenerOnParent(this.pendingParentElement, { editable: this });
		}

		this.addEventListener("cloudcannon-api", this.handleApiEvent.bind(this));
		this.replayPendingListeners();
	}

	handleApiEvent(e: any): void {
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
				} else if (this.element.dataset.prop) {
					e.detail.source = `${this.element.dataset.prop}.${source}`;
				}
			}
		}

		const { absolute } = this.parseSource(e.detail.source);
		if (!this.parent || absolute) {
			if (this.executeApiCall(e.detail)) {
				e.stopPropagation();
			}
		}
	}

	executeApiCall(options: any): boolean {
		let { file, collection, source, dataset } = this.parseSource(
			options.source,
		);

		let filePromise: Promise<CloudCannonJavaScriptV1APIFile | undefined>;
		if (!file) {
			if (collection && source) {
				const parts = source.split(".");
				const first = Number(parts.shift());
				filePromise = collection.items().then((items) => items[first]);
				source = parts.join(".");
			} else if (dataset) {
				filePromise = dataset.items().then((items) => {
					if (Array.isArray(items) && source) {
						const parts = source.split(".");
						const first = Number(parts.shift());
						source = parts.join(".");
						return items[first];
					}

					if (CloudCannon.isAPIFile(items)) {
						return items;
					}
				});
			} else {
				filePromise = Promise.resolve(undefined);
			}
		} else {
			filePromise = Promise.resolve(file);
		}

		filePromise.then((file) => {
			switch (options.action) {
				case "edit":
					file?.data.edit({ slug: source, position: options.position });
					break;
				case "set":
					if (source?.endsWith("@content")) {
						file?.content.set(options.value);
					} else if (source) {
						file?.data.set({ slug: source, value: options.value });
					}
					break;
				case "add-array-item":
					file?.data.addArrayItem({
						slug: source,
						index: options.newIndex,
						value: options.value,
					});
					break;
				case "remove-array-item":
					file?.data.removeArrayItem({
						slug: source,
						index: options.fromIndex,
					});
					break;
				case "move-array-item":
					file?.data.moveArrayItem({
						fromSlug: options.fromSlug ?? source,
						fromIndex: options.fromIndex,
						toSlug: source,
						toIndex: options.toIndex,
					});
					break;
				case "get-input-config":
					if (!file) {
						options.callback({
							options: {
								disable_reorder: true,
								disable_remove: true,
								disable_add: true,
							},
						});
					} else {
						file?.getInputConfig({ slug: source }).then(options.callback);
					}
					break;
			}
		});

		return true;
	}

	mount(): void {}

	validateConfiguration(): boolean {
		return true;
	}

	dispatchSet(source: string, value: unknown) {
		this.element.dispatchEvent(
			new CustomEvent("cloudcannon-api", {
				bubbles: true,
				detail: {
					action: "set",
					source,
					value,
				},
			}),
		);
	}

	async dispatchGetInputConfig(source?: string): Promise<any> {
		return new Promise((resolve) => {
			this.element.dispatchEvent(
				new CustomEvent("cloudcannon-api", {
					bubbles: true,
					detail: {
						action: "get-input-config",
						source,
						callback: resolve,
					},
				}),
			);
		});
	}

	matchSourcePart(type: "collections" | "data" | "file", source?: string) {
		if (!source) {
			return;
		}

		if (!source.startsWith(`@${type}`)) {
			return;
		}

		const argsPart = source.slice(type.length + 1);
		const brackets = argsPart.match(/^\[+/);
		if (!brackets) {
			return;
		}
		const bracketsLength = brackets[0].length;
		return argsPart.match(
			new RegExp(
				`^\\[{${bracketsLength}}(?<key>.+?)\\]{${bracketsLength}}(\\.(?<rest>.+))?$`,
			),
		)?.groups;
	}

	parseSource(source?: string) {
		let collection: CloudCannonJavaScriptV1APICollection | undefined;
		let file: CloudCannonJavaScriptV1APIFile | undefined;
		let dataset: CloudCannonJavaScriptV1APIDataset | undefined;
		let absolute = false;
		let currentFile = false;

		const collectionMatch = this.matchSourcePart("collections", source);
		if (collectionMatch) {
			const { key, rest } = collectionMatch;
			collection = CloudCannon.collection(key);
			source = rest;
			absolute = true;
		} else {
			const fileMatch = this.matchSourcePart("file", source);
			if (fileMatch) {
				const { key, rest } = fileMatch;
				file = CloudCannon.file(key);
				source = rest;
				absolute = true;
			} else {
				const dataMatch = this.matchSourcePart("data", source);
				if (dataMatch) {
					const { key, rest } = dataMatch;
					dataset = CloudCannon.dataset(key);
					source = rest;
					absolute = true;
				} else {
					file = CloudCannon.currentFile();
					currentFile = true;
				}
			}
		}

		const snippets = [];
		let snippetMatch = source?.match(/@snippet\[(?<id>[^\]]+)\]\.(?<rest>.+)$/);
		while (snippetMatch?.groups) {
			const { id, rest } = snippetMatch.groups;
			snippets.push(id);
			source = rest;
			snippetMatch = source.match(/@snippet\[(?<id>[^\]]+)\]\.(?<rest>.+)$/);
		}

		return {
			collection,
			file,
			source: source ?? "",
			absolute,
			snippets,
			dataset,
			currentFile,
		};
	}

	getSpecialProps(
		incomingSpecialProps: Record<string, unknown> = {},
	): Record<string, unknown> {
		return {
			...this.specialProps,
			...incomingSpecialProps,
		};
	}
}
