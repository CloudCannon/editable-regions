import type { CloudCannonJavaScriptV1APIFile } from "@cloudcannon/javascript-api";
import { html as beautifyHtml } from "js-beautify";
import { CloudCannon } from "../helpers/cloudcannon.js";
import type { WindowType } from "../types/window.js";
import TextEditable from "./text-editable.js";

declare const window: WindowType;

const INDENTATION_REGEX = /^([ \t]+)[^\s]/gm;
const TAG_REGEX =
	/<\s*(?<closing>\/?)\s*(?<tagname>[-a-z]+)(\s+[^>]+)*?\s*(?<selfclosing>\/?)\s*>/gi;

const HTML_VOID_ELEMENT: Record<string, boolean> = {
	area: true,
	base: true,
	br: true,
	col: true,
	embed: true,
	hr: true,
	img: true,
	input: true,
	link: true,
	meta: true,
	param: true,
	source: true,
	track: true,
	wbr: true,
};

export default class SourceEditable extends TextEditable {
	file?: CloudCannonJavaScriptV1APIFile;
	format = {
		leading: "",
		trailing: "",
		indent: "",
		indentSize: 0,
		indentChar: "",
	};

	setupListeners(): void {
		if (!this.element.dataset.path) {
			return;
		}
		this.file = CloudCannon.file(this.element.dataset.path);
		this.file.addEventListener("change", () => {
			this.file?.get().then(this.pushValue.bind(this));
		});
		this.file.get().then(this.pushValue.bind(this));
	}

	validateConfiguration(): boolean {
		const path = this.element.dataset.path;
		if (typeof path !== "string") {
			this.element.classList.add("errored");
			const error = document.createElement("error-card");
			error.setAttribute("heading", "Failed to render source editable region");
			error.setAttribute("message", "Missing required attribute data-path");
			this.element.replaceChildren(error);
			return false;
		}

		const key = this.element.dataset.key;
		if (typeof key !== "string") {
			this.element.classList.add("errored");
			const error = document.createElement("error-card");
			error.setAttribute("heading", "Failed to render source editable region");
			error.setAttribute("message", "Missing required attribute data-key");
			this.element.replaceChildren(error);
			return false;
		}
		return true;
	}

	validateValue(value: unknown): string | null | undefined {
		if (typeof value !== "string" && value !== null) {
			this.element.classList.add("errored");
			const error = document.createElement("error-card");
			error.setAttribute("heading", "Failed to render source editable region");
			error.setAttribute(
				"message",
				`Illegal value type: ${typeof value}. Supported types are string.`,
			);
			this.element.replaceChildren(error);
			return;
		}

		if (typeof value === "string") {
			const keyIndex = value.indexOf(`data-key="${this.element.dataset.key}"`);
			if (keyIndex === -1) {
				this.element.classList.add("errored");
				const error = document.createElement("error-card");
				error.setAttribute(
					"heading",
					"Failed to render source editable region",
				);
				error.setAttribute(
					"message",
					"Failed to find element with matching data-key attribute",
				);
				this.element.replaceChildren(error);
				return;
			}

			const nextKeyIndex = value.indexOf(
				`data-key="${this.element.dataset.key}"`,
				keyIndex + 1,
			);
			if (nextKeyIndex !== -1) {
				this.element.classList.add("errored");
				const error = document.createElement("error-card");
				error.setAttribute(
					"heading",
					"Failed to render source editable region",
				);
				error.setAttribute(
					"message",
					"Found duplicate data-key attribute. Make sure all source editables have unique data-key attributes",
				);
				this.element.replaceChildren(error);
				return;
			}
		}

		return value;
	}

	getSourceIndices(source: string): { start: number; end: number } {
		const keyIndex = source.indexOf(`data-key="${this.element.dataset.key}"`);
		let tagNameIndex = keyIndex;
		while (tagNameIndex >= 0 && source[tagNameIndex] !== "<") {
			tagNameIndex -= 1;
		}

		const stack = [
			source.substring(tagNameIndex + 1, source.indexOf(" ", tagNameIndex)),
		];

		const start = source.indexOf(">", keyIndex);
		source = source.substring(start + 1);

		for (const tagMatch of source.matchAll(TAG_REGEX)) {
			if (!tagMatch?.groups) {
				continue;
			}

			const { closing, tagname, selfclosing } = tagMatch.groups;
			if (closing) {
				while (stack.length > 0) {
					if (stack.pop() === tagname) {
						break;
					}
				}
			} else if (!selfclosing && !HTML_VOID_ELEMENT[tagname]) {
				stack.push(tagname);
			}

			if (stack.length === 0) {
				return { start: start + 1, end: start + 1 + tagMatch.index };
			}
		}

		return { start: start + 1, end: start + 1 + source.length };
	}

	update(): void {
		if (!this.value) {
			return;
		}
		const source = this.value;
		for (const indentation of source.matchAll(INDENTATION_REGEX)) {
			if (
				!this.format.indentSize ||
				indentation[1].length < this.format.indentSize
			) {
				this.format.indentSize = indentation[1].length;
				this.format.indentChar = indentation[0][0];
			}
		}

		const { start, end } = this.getSourceIndices(source);
		const content = source.substring(start, end);

		this.format.leading = content.match(/^(\s*\n)[^\n]*?\S/)?.[1] ?? "";
		this.format.trailing = content.match(/\S(\n\s*)$/)?.[1] ?? "";
		this.format.indent =
			content
				.split("\n")
				.filter((line) => line.trim().length > 0)
				.reduce((acc: string | null, line) => {
					if (typeof acc !== "string" || !line.startsWith(acc)) {
						return line.match(/^\s*/)?.[0] ?? "";
					}

					return acc;
				}, null) ?? "";

		this.editor?.setContent(content);
	}

	async mountEditor(): Promise<any> {
		if (this.editor) {
			return this.editor;
		}

		this.editor = await window.CloudCannonAPI?.v0.createTextEditableRegion(
			this.element,
			this.onChange.bind(this),
			{
				elementType: this.element.dataset.type,
				editableType: "content",
				inputConfig: { type: "html" },
			},
		);

		if (typeof this.value === "string") {
			this.update();
		}

		return this.editor;
	}

	onChange(value?: string) {
		this.file?.get().then((source) => {
			value = beautifyHtml(value ?? "", {
				indent_char: this.format.indentChar,
				indent_size: this.format.indentSize,
			});

			const { start, end } = this.getSourceIndices(source);
			const content =
				source.substring(0, start) +
				this.format.leading +
				value
					.split("\n")
					.map((line) => this.format.indent + line)
					.join("\n") +
				this.format.trailing +
				source.substring(end);

			if (content === this.value) {
				return;
			}

			this.value = content;
			this.file?.set(content);
		});
	}
}
