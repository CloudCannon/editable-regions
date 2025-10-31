import { getEditableSnippetRenderers } from "../helpers/cloudcannon.js";
import EditableComponent from "./editable-component.js";
import Editable from "./editable.js";

export default class EditableSnippet extends EditableComponent {
	getComponents() {
		return getEditableSnippetRenderers();
	}

	setupListeners(): void {
		this.element.addEventListener("cloudcannon-api", async (e: any) => {
			if (e.target !== this.element) {
				if (!e.detail.source) {
					e.detail.source = `@snippet[${this.element.getAttribute("data-cms-snippet-id")}]`;
				} else {
					e.detail.source = `@snippet[${this.element.getAttribute("data-cms-snippet-id")}].${e.detail.source}`;
				}
			}

			const { absolute, snippets } = this.parseSource(e.detail.source);
			if (!this.parent || absolute || snippets) {
				if (this.executeApiCall(e.detail)) {
					e.stopPropagation();
				}
			}
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

	executeApiCall(options: any): boolean {
		const { snippets, source } = this.parseSource(options.source);

		if (options.action === "get-input-config") {
			// TODO: This should actually load the input config, including the snippet in the cascade
			return false;
		}

		const snippet = snippets.pop();

		if (
			snippet &&
			snippet !== this.element.getAttribute("data-cms-snippet-id")
		) {
			const snippetEl = document.querySelector(
				`[data-cms-snippet-id="${snippet}"]`,
			);
			if (
				!snippetEl ||
				!("editable" in snippetEl) ||
				!(snippetEl.editable instanceof Editable)
			) {
				console.error(`Error: Snippet with ID "${snippet}" not found`);
				return false;
			}
			return snippetEl.editable.executeApiCall({
				...options,
				source,
			});
		}

		if (source) {
			this.dispatchSnippetChange(source, options);
		}
		return true;
	}

	async dispatchSnippetChange(source: string, options: any) {
		switch (options.action) {
			case "edit":
				break;
			case "set": {
				const parts = source.split(".");
				const lastPart = parts.pop();
				const temp = await this.lookupPath(parts.join("."), this.value);

				if (lastPart && temp && typeof temp === "object") {
					temp[lastPart] = options.value;
				}
				break;
			}
			case "move-array-item": {
				const temp = await this.lookupPath(source, this.value);
				if (Array.isArray(temp)) {
					const value = temp.splice(options.fromIndex, 1)[0];
					temp.splice(options.toIndex, 0, value);
				}
				break;
			}
			case "remove-array-item": {
				const temp = await this.lookupPath(source, this.value);
				if (Array.isArray(temp)) {
					temp.splice(options.fromIndex, 1);
				}
				break;
			}
			case "add-array-item": {
				const temp = await this.lookupPath(source, this.value);
				if (Array.isArray(temp)) {
					temp.splice(options.toIndex, 0, options.value);
				}

				break;
			}
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
}
