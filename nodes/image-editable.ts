import { CloudCannon } from "../helpers/cloudcannon.js";
import Editable from "./editable.js";

export default class ImageEditable extends Editable {
	value: { src?: string; alt?: string; title?: string } | null | undefined =
		undefined;
	inputConfig: { src?: any; alt?: any; title?: any } = {};
	imageEl?: HTMLImageElement;

	configuredSrc = false;
	configuredAlt = false;
	configuredTitle = false;

	displayError(heading: string, message: string) {
		this.element.classList.add("errored");
		const error = document.createElement("error-card");
		error.setAttribute("heading", heading);
		error.setAttribute("message", message);
		if (this.imageEl) {
			this.imageEl?.replaceWith(error);
		} else {
			this.element.replaceChildren(error);
		}
	}

	validateConfiguration(): boolean {
		const child =
			this.element instanceof HTMLImageElement
				? this.element
				: this.element.querySelector("img");

		if (!(child instanceof HTMLImageElement)) {
			this.displayError(
				"Failed to render image editable region",
				"Image editable region requires an image element as its child.",
			);
			return false;
		}

		this.imageEl = child;

		if (
			this.element.dataset.prop === undefined &&
			this.element.dataset.propSrc === undefined &&
			this.element.dataset.propAlt === undefined &&
			this.element.dataset.propTitle === undefined
		) {
			this.displayError(
				"Failed to render image editable region",
				"Atleast one of data-prop, data-prop-src, data-prop-alt, or data-prop-title is required.",
			);
			return false;
		}
		return true;
	}

	validateValue(value: unknown): this["value"] {
		if (typeof value !== "object") {
			this.displayError(
				"Failed to render image editable region",
				`Illegal value type: ${typeof value}. Supported types are object.`,
			);
			return;
		}

		if (value === null) {
			return value;
		}

		if ("src" in value && typeof value.src !== "string" && value.src !== null) {
			this.displayError(
				"Failed to render image editable region",
				`Illegal value type for "src": ${typeof value.src}. Supported types are string.`,
			);
			return;
		}

		if ("alt" in value && typeof value.alt !== "string" && value.alt !== null) {
			this.displayError(
				"Failed to render image editable region",
				`Illegal value type for "alt": ${typeof value.alt}. Supported types are string.`,
			);
			return;
		}

		if (
			"title" in value &&
			typeof value.title !== "string" &&
			value.title !== null
		) {
			this.displayError(
				"Failed to render image editable region",
				`Illegal value type for "title": ${typeof value.title}. Supported types are string.`,
			);
			return;
		}

		const unexpectedKey = Object.keys(value).find(
			(key) => key !== "src" && key !== "alt" && key !== "title",
		);

		if (unexpectedKey) {
			this.displayError(
				"Failed to render image editable region",
				`Unexpected key "${unexpectedKey}" in image editable region. Supported keys are "src", "alt", and "title".`,
			);
			return;
		}

		return value;
	}

	update(): void {
		if (!this.imageEl) {
			throw new Error("Element is not an HTMLImageElement");
		}

		if (this.configuredSrc && this.imageEl.src !== this.value?.src) {
			this.imageEl.src = this.value?.src ?? "";
		}

		if (this.configuredAlt && this.imageEl.alt !== this.value?.alt) {
			this.imageEl.alt = this.value?.alt ?? "";
		}

		if (this.configuredTitle && this.imageEl.title !== this.value?.title) {
			this.imageEl.title = this.value?.title ?? "";
		}
	}

	async loadInputConfig(): Promise<void> {
		this.inputConfig = {};
		if (this.configuredSrc) {
			this.inputConfig.src = await this.dispatchGetInputConfig(
				this.element.dataset.propSrc ?? `${this.element.dataset.prop}.src`,
			);
		}
		if (this.configuredAlt) {
			this.inputConfig.alt = await this.dispatchGetInputConfig(
				this.element.dataset.propAlt ?? `${this.element.dataset.prop}.alt`,
			);
		}
		if (this.configuredTitle) {
			this.inputConfig.title = await this.dispatchGetInputConfig(
				this.element.dataset.propTitle ?? `${this.element.dataset.prop}.title`,
			);
		}
	}

	mount(): void {
		this.configuredSrc =
			!!this.element.dataset.propSrc || !!this.element.dataset.prop;
		this.configuredAlt =
			!!this.element.dataset.propAlt || !!this.element.dataset.prop;
		this.configuredTitle =
			!!this.element.dataset.propTitle || !!this.element.dataset.prop;

		this.loadInputConfig().then(() => {
			this.imageEl?.addEventListener("click", () => {
				if (!this.value) {
					throw new Error("Value is not defined");
				}

				const data: this["value"] = {};
				if ("src" in this.value) {
					data.src = this.value.src;
				}
				if ("alt" in this.value) {
					data.alt = this.value.alt;
				}
				if ("title" in this.value) {
					data.title = this.value.title;
				}

				CloudCannon.createCustomDataPanel({
					title: "Edit Image",
					data,
					position: this.imageEl?.getBoundingClientRect(),
					config: {
						_inputs: {
							src: {
								label: "Image",
								type: "image",
								...this.inputConfig.src,
							},
							alt: {
								comment:
									"A description which provides information about this image if for some reason it cannot be viewed.",
								...this.inputConfig.alt,
							},
							title: {
								comment: "Displayed when hovering over the image.",
								...this.inputConfig.title,
							},
						},
					},
					onChange: (value): void => {
						if (!value || typeof value !== "object") {
							throw new Error("Invalid image data");
						}

						if (
							"src" in value &&
							this.configuredSrc &&
							value.src !== this.value?.src
						) {
							this.dispatchSet(
								this.element.dataset.propSrc ??
									`${this.element.dataset.prop}.src`,
								value.src,
							);
						}
						if (
							"alt" in value &&
							this.configuredAlt &&
							value.alt !== this.value?.alt
						) {
							this.dispatchSet(
								this.element.dataset.propAlt ??
									`${this.element.dataset.prop}.alt`,
								value.alt,
							);
						}
						if (
							"title" in value &&
							this.configuredTitle &&
							value.title !== this.value?.title
						) {
							this.dispatchSet(
								this.element.dataset.propTitle ??
									`${this.element.dataset.prop}.title`,
								value.title,
							);
						}
					},
				});
			});
		});
	}
}
