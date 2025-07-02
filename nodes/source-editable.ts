import type { WindowType } from "../types/window.js";
import TextEditable from "./text-editable.js";

declare const window: WindowType;

export default class SourceEditable extends TextEditable {
	connect(): void {
		Promise.all([
			customElements.whenDefined("array-item"),
			customElements.whenDefined("array-editable"),
			customElements.whenDefined("text-editable"),
			customElements.whenDefined("component-editable"),
			customElements.whenDefined("image-editable"),
			customElements.whenDefined("source-editable"),
		]).then(() => {
			this.mount();
		});
	}

	mount(): void {
		this.element.onblur = () => {
			this.focused = false;
			this.parent?.update();
		};

		const editableOptions = {
			path: this.element.dataset.path,
			key: this.element.dataset.key,
			elementType: this.element.dataset.type,
		};

		this.element.onclick = () => {
			this.focused = true;
		};

		if (!window.CloudCannon && !this.editor) {
			document.addEventListener("cloudcannon:load", async (e) => {
				this.editor = await (
					e as any
				).detail.CloudCannon.createSourceEditableRegion(
					this.element,
					editableOptions,
				);
			});
		} else if (!this.editor) {
			window.CloudCannon?.createSourceEditableRegion(
				this.element,
				editableOptions,
			).then((editor) => {
				this.editor = editor;
			});
		}
	}
}
