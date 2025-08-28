import type { WindowType } from "../types/window.js";
import ComponentEditable from "./component-editable.js";
import Editable from "./editable.js";

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

	executeApiCall(options: any): void {
		if (options.source?.startsWith("@snippet")) {
			const match = options.source.match(
				/^@snippet\[(?<id>[^\]]+)\]\.(?<rest>.+)$/,
			);
			if (!match) {
				console.error("Error: Invalid snippet syntax");
				return;
			}
			const { id, rest } = match.groups;
			if (id !== this.element.getAttribute("data-cms-snippet-id")) {
				const snippet = document.querySelector(`[data-cms-snippet-id="${id}"]`);
				if (
					!snippet ||
					!("editable" in snippet) ||
					!(snippet.editable instanceof Editable)
				) {
					console.error(`Error: Snippet with ID "${id}" not found`);
					return;
				}
				snippet.editable.executeApiCall({
					...options,
					source: rest,
				});
			}
		}

		switch (options.action) {
			case "edit":
				window.CloudCannon?.edit(options.source);
				break;
			case "set-file-data": {
				const parts = options.source.split(".");
				const lastPart = parts.pop();
				const temp = this.lookupPath(parts.join("."), this.value);

				if (temp && typeof temp === "object") {
					temp[lastPart] = options.value;
				}
				break;
			}
			case "move-array-item": {
				const temp = this.lookupPath(options.source, this.value);
				if (Array.isArray(temp)) {
					const value = temp.splice(options.fromIndex, 1)[0];
					temp.splice(options.toIndex, 0, value);
				}
				break;
			}
			case "remove-array-item": {
				const temp = this.lookupPath(options.source, this.value);
				if (Array.isArray(temp)) {
					temp.splice(options.fromIndex, 1);
				}
				break;
			}
			case "add-array-item": {
				const temp = this.lookupPath(options.source, this.value);
				if (Array.isArray(temp)) {
					temp.splice(options.toIndex, 0, options.value);
				}

				break;
			}
			case "set-file-content":
				console.error(`${options.action} not implemented for snippet editable`);
				return;
		}

		this.element.dispatchEvent(
			new CustomEvent("snippet-change", {
				detail: {
					snippetId: this.element.getAttribute("data-cms-snippet-id"),
					isValid: true,
					snippetData: this.value,
				},
				bubbles: true,
			}),
		);
	}

	mount(): void {}

	validateConfiguration(): boolean {
		return true;
	}

	resolveSource(source?: string): string | undefined {
		return `@snippet[${this.element.getAttribute("data-cms-snippet-id")}].${source}`;
	}
}
