import type { WindowType } from "../types/window.js";
import Editable from "./editable.js";

declare const window: WindowType;

export default class TextEditable extends Editable {
	editor?: any;
	elementType?: string;
	focused = false;

	update(): void {
		if (this.focused || typeof this.value !== "string") {
			return;
		}
		this.editor?.setContent({ content: this.value });
	}

	mount(): void {
		this.element.style.cssText =
			"display: inline-block; outline: 1px solid #034AD8;";

		this.element.onblur = () => {
			this.focused = false;
		};

		const editableOptions = {
			slug: this.resolveSource(),
			elementType: this.element.dataset.type,
		};

		if (typeof this.element.dataset.deferMount === "string") {
			this.element.onclick = () => {
				this.focused = true;
				if (!this.editor) {
					window.CloudCannon.createTextEditableRegion(this.element).then(
						(editor) => (this.editor = editor),
						editableOptions,
					);
				}
			};
			return;
		}

		this.element.onclick = () => {
			this.focused = true;
		};

		if (!window.CloudCannon && !this.editor) {
			document.addEventListener("cloudcannon:load", async (e) => {
				this.editor = await (
					e as any
				).detail.CloudCannon.createTextEditableRegion(
					this.element,
					editableOptions,
				);
			});
		} else if (!this.editor) {
			window.CloudCannon.createTextEditableRegion(
				this.element,
				editableOptions,
			).then((editor) => (this.editor = editor));
		}
	}
}
