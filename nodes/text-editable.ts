import type { WindowType } from "../types/window.js";
import Editable from "./editable.js";

declare const window: WindowType;

type EditableFocusEvent = CustomEvent<number>;

export default class TextEditable extends Editable {
	editor?: any;
	focused = false;
	focusIndex = 0;
	value: string | null | undefined;

	validateConfiguration(): boolean {
		const prop = this.element.dataset.prop;
		if (typeof prop !== "string") {
			this.element.classList.add("errored");
			const error = document.createElement("error-card");
			error.setAttribute("heading", "Failed to render text editable region");
			error.setAttribute("message", "Missing required attribute data-prop");
			this.element.replaceChildren(error);
			return false;
		}

		const elementType = this.element.dataset.type;
		if (
			typeof elementType === "string" &&
			!["span", "text", "block"].includes(elementType)
		) {
			this.element.classList.add("errored");
			const error = document.createElement("error-card");
			error.setAttribute("heading", "Failed to render text editable region");
			error.setAttribute(
				"message",
				`Unsupported element type: "${elementType}". Supported element types are span, text, and block.`,
			);
			this.element.replaceChildren(error);
			return false;
		}
		return true;
	}

	validateValue(value: unknown): string | null | undefined {
		// TODO: Make this less hacky. i.e. when the prop is content that should come through the listeners
		if (this.element.dataset.prop === "@content") {
			return "";
		}

		if (typeof value !== "string" && value !== null) {
			this.element.classList.add("errored");
			const error = document.createElement("error-card");
			error.setAttribute("heading", "Failed to render text editable region");
			error.setAttribute(
				"message",
				`Illegal value type: ${typeof value}. Supported types are string.`,
			);
			this.element.replaceChildren(error);
			return;
		}
		return value;
	}

	shouldUpdate(value: string) {
		return (
			!this.focused &&
			value !== this.value &&
			(typeof value === "string" || value === null)
		);
	}

	update(): void {
		this.element.dataset.prop === "@content"
			? window.CloudCannonAPI.v1
					.currentFile()
					.content.get()
					.then((content) => {
						console.log("", { content });
						this.editor?.setContent(content);
					})
			: this.editor?.setContent(this.value);
	}

	mount(): void {
		this.element.addEventListener("blur", () => {
			this.focused = false;
			this.element.dispatchEvent(
				new CustomEvent("editable:blur", {
					bubbles: true,
					detail: this.focusIndex,
				}),
			);
		});

		this.element.addEventListener("focus", () => {
			this.focusIndex += 1;
			this.element.dispatchEvent(
				new CustomEvent("editable:focus", {
					bubbles: true,
					detail: this.focusIndex,
				}),
			);
		});

		this.element.addEventListener("editable:focus", (e: EditableFocusEvent) => {
			this.focused = true;
			this.focusIndex = e.detail;
		});

		this.element.addEventListener("editable:blur", (e: EditableFocusEvent) => {
			if (e.detail >= this.focusIndex) {
				this.focused = false;
			}
		});

		if (typeof this.element.dataset.deferMount === "string") {
			this.element.onclick = () => {
				this.focused = true;
				this.mountEditor().then(() => {
					this.element.focus();
				});
			};
			return;
		}

		if (!window.CloudCannon && !this.editor) {
			document.addEventListener(
				"cloudcannon:load",
				this.mountEditor.bind(this),
			);
		} else if (!this.editor) {
			this.mountEditor();
		}
	}

	async mountEditor(): Promise<any> {
		if (this.editor) {
			return this.editor;
		}

		const source = this.resolveSource();

		const inputConfig =
			!source || this.element.dataset.prop === "@content"
				? { type: "markdown" }
				: await window.CloudCannon?.getInputConfig(source);

		this.editor = await window.CloudCannon?.createTextEditableRegion(
			this.element,
			this.onChange.bind(this),
			{
				elementType: this.element.dataset.type,
				editableType:
					this.element.dataset.prop === "@content" ? "content" : undefined,
				inputConfig,
			},
		);

		if (typeof this.value === "string") {
			this.update();
		}

		return this.editor;
	}

	dispatchSetFileData(source: string, value: unknown) {
		this.element.dispatchEvent(
			new CustomEvent("cloudcannon-api", {
				bubbles: true,
				detail: {
					action: "set-file-data",
					source,
					value,
				},
			}),
		);
	}

	dispatchSetFileContent(value: string) {
		this.element.dispatchEvent(
			new CustomEvent("cloudcannon-api", {
				bubbles: true,
				detail: {
					action: "set-file-content",
					value,
				},
			}),
		);
	}

	onChange(value?: string) {
		const source = this.element.dataset.prop;
		if (!source) {
			throw new Error("Source not found");
		}

		this.value = value;

		this.element.dataset.prop === "@content"
			? this.dispatchSetFileContent(value || "")
			: this.dispatchSetFileData(source, value);
	}
}

declare global {
	interface HTMLElementEventMap {
		"editable:focus": EditableFocusEvent;
		"editable:blur": EditableFocusEvent;
	}
}
