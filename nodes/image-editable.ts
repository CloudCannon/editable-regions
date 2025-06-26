import type { WindowType } from "../types/window.js";
import Editable from "./editable.js";

declare const window: WindowType;

export default class ImageEditable extends Editable {
	value: { src?: string } | undefined = undefined;

	update(): void {
		if (!(this.element instanceof HTMLImageElement)) {
			throw new Error("Element is not an HTMLImageElement");
		}

		if (this.element.src !== this.value?.src && this.value?.src) {
			this.element.src = this.value?.src;
		}
	}

	mount(): void {
		this.element.onclick = (e) => {
			// TODO: Some UI for editing alt and title
			const input = document.createElement("input");
			input.type = "file";

			input.onchange = async (e) => {
				const slug = this.resolveSource("src");
				if (!slug) {
					throw new Error("Slug is required");
				}

				const file = (e.target as any)?.files[0];
				if (!file) {
					throw new Error("No file selected");
				}

				const path = await window.CloudCannon?.uploadFile(file);
				window.CloudCannon?.set(slug, path);
			};

			input.click();
		};
	}
}
