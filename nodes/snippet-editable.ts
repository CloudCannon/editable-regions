import type { WindowType } from "../types/window.js";
import ComponentEditable from "./component-editable.js";

declare const window: WindowType;

export default class SnippetEditable extends ComponentEditable {
	getComponents() {
		return window.cc_snippets;
	}

	setupListeners(): void {
		this.element.addEventListener("cloudcannon-api", (e: any) => {
			e.stopPropagation();
			this.executeApiCall(e.detail);
		});
	}

	validateValue(value: unknown): unknown {
		if (typeof value !== "object") {
			return;
		}

		if (!value) {
			return value;
		}

		if (
			!("_snippet_type" in value) ||
			typeof value._snippet_type !== "string"
		) {
			return;
		}

		this.element.dataset.component = value._snippet_type;

		return value;
	}

	executeApiCall(options: any) {
		switch (options.action) {
			case "edit":
				window.CloudCannon?.edit(options.source);
				break;
			case "set-file-data": {
				const newValue = this.value;
				if (newValue && typeof newValue === "object") {
					let temp: any = newValue;
					const parts = options.source.split(".");
					const lastPart = parts.pop();
					parts.forEach((part: string) => {
						if (typeof temp?.[part] === "undefined") {
							temp ??= {};
							temp[part] ??= {};
						}
						temp = temp[part];
					});
					temp[lastPart] = options.value;
				}
				this.element.dispatchEvent(
					new CustomEvent("snippet-change", {
						detail: {
							snippetId: this.element.getAttribute("data-cms-snippet-id"),
							isValid: true,
							snippetData: newValue,
						},
						bubbles: true,
					}),
				);
				break;
			}
			case "move-array-item":
				debugger;
			case "set-file-content":
			case "add-array-item":
			case "remove-array-item":
				console.error(`${options.action} not implemented for snippet editable`);
		}
	}

	mount(): void {}

	validateConfiguration(): boolean {
		return true;
	}

	resolveSource(source?: string): string | undefined {
		return source;
	}
}
