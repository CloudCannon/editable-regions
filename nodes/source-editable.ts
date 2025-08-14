import { html as beautifyHtml } from "js-beautify";
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
	format = {
		leading: "",
		trailing: "",
		indent: "",
		indentSize: 0,
		indentChar: "",
	};

	setupListeners(): void {
		// TODO: Listen for changes in the file source
		if (this.validateConfiguration()) {
			this.mount();
		}
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
				return { start: start + 1, end: start + tagMatch.index - 1 };
			}
		}

		return { start: start + 1, end: start + source.length - 1 };
	}

	update(): void {
		window.CloudCannon?.getFileSource({ path: this.element.dataset.path }).then(
			(source) => {
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
				this.format.indent = content
					.split("\n")
					.filter((line) => line.trim().length > 0)
					.reduce((acc, line) => {
						if (typeof acc !== "string" || !line.startsWith(acc)) {
							return line.match(/^\s*/)?.[0] ?? "";
						}

						return acc;
					});

				this.editor?.setContent(content);
			},
		);
	}

	async mountEditor(): Promise<any> {
		if (this.editor) {
			return this.editor;
		}

		this.editor = await window.CloudCannon?.createTextEditableRegion(
			this.element,
			this.onChange.bind(this),
			{
				elementType: this.element.dataset.type,
				editableType: "content",
				inputConfig: { type: "html" },
			},
		);

		this.update();

		return this.editor;
	}

	onChange(value?: string) {
		window.CloudCannon?.getFileSource({ path: this.element.dataset.path }).then(
			(source) => {
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

				window.CloudCannon?.setFileSource(content, {
					path: this.element.dataset.path,
				});
			},
		);
	}
}
