import { CloudCannon } from "../helpers/cloudcannon.js";
import Editable from "./editable.js";

type EditableFocusEvent = CustomEvent<number>;

export default class EditableText extends Editable {
	editor?: any;
	focused = false;
	focusIndex = 0;
	value: string | null | undefined;

	validateConfiguration(): boolean {
		const prop = this.element.dataset.prop;
		if (typeof prop !== "string") {
			this.element.classList.add("errored");
			const error = document.createElement("editable-region-error-card");
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
			const error = document.createElement("editable-region-error-card");
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
		if (typeof value !== "string" && value !== null) {
			this.element.classList.add("errored");
			const error = document.createElement("editable-region-error-card");
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
		this.editor?.setContent(this.value);
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

		if (!this.editor) {
			this.mountEditor();
		}
	}

	async mountEditor(): Promise<any> {
		if (this.editor) {
			return this.editor;
		}

		const inputConfig = this.contextBase?.isContent
			? { type: "markdown" }
			: await this.dispatchGetInputConfig(this.element.dataset.prop);

		this.editor = await CloudCannon.createTextEditableRegion(
			this.element,
			this.onChange.bind(this),
			{
				elementType: this.element.dataset.type,
				editableType: this.contextBase?.isContent ? "content" : undefined,
				inputConfig,
			},
		);

		if (typeof this.value === "string") {
			this.update();
		}

		return this.editor;
	}

	onChange(value?: string | null) {
		const source = this.element.dataset.prop;
		if (typeof source !== "string") {
			throw new Error("Source not found");
		}

		this.value = value;
		this.dispatchSet(source, value);
	}
}

declare global {
	interface HTMLElementEventMap {
		"editable:focus": EditableFocusEvent;
		"editable:blur": EditableFocusEvent;
	}
}
