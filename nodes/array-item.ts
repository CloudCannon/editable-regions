import "../components/ui/array-controls.js";
import type ArrayControls from "../components/ui/array-controls.js";
import type { WindowType } from "../types/window.js";
import ArrayEditable from "./array-editable.js";
import ComponentEditable from "./component-editable.js";

declare const window: WindowType;

export default class ArrayItem extends ComponentEditable {
	protected controlsElement?: ArrayControls;

	private inputConfig?: any;

	validateConfiguration(): boolean {
		const key = this.element.dataset.component;
		if (key) {
			const component = window.cc_components?.[key];
			if (!component) {
				this.element.classList.add("errored");
				const error = document.createElement("error-card");
				error.setAttribute("heading", "Failed to render component");
				error.setAttribute("message", `Couldn't find component '${key}'`);
				this.element.replaceChildren(error);
				return false;
			}
		}

		if (!this.parent || !(this.parent instanceof ArrayEditable)) {
			this.element.classList.add("errored");
			const error = document.createElement("error-card");
			error.setAttribute("heading", "Failed to render array item");
			error.setAttribute(
				"message",
				"Parent array editable not found. Array items must be a descendant of an array editable.",
			);
			this.element.replaceChildren(error);
			return false;
		}

		return true;
	}

	onHover(e: DragEvent): void {
		const source = this.parent?.resolveSource();
		if (!source || !e.dataTransfer) {
			return;
		}

		if (
			!e.dataTransfer?.types.includes(source) &&
			!e.dataTransfer.types.includes(this.getDragType())
		) {
			return;
		}

		e.preventDefault();
		this.element.classList.add("dragover");
		this.element.style.outline = "3px solid var(--ccve-color-sol)";
	}

	getDragType(): string {
		if (this.inputConfig?.options?.structures?.values?.length) {
			return "cc:structure";
		}

		const currentArraySubtype = this.inputConfig?.options?.__array_subtype;
		if (currentArraySubtype) {
			return `cc:${currentArraySubtype}`;
		}

		const type = window.CloudCannon?.getInputType(
			this.resolveSource(),
			this.value,
		);
		return `cc:${type}`;
	}

	mount(): void {
		if (!this.controlsElement) {
			this.controlsElement = document.createElement("array-controls");
			this.controlsElement.addEventListener("edit", (e: any) => {
				const source = this.resolveSource();
				if (!source) {
					throw new Error("Source not found");
				}
				window.CloudCannon?.edit(source, undefined, e);
			});

			this.controlsElement.addEventListener("move-up", () => {
				const source = this.parent?.resolveSource();
				if (!source) {
					throw new Error("Source not found");
				}

				const fromIndex = Number(this.element.dataset.prop);
				window.CloudCannon?.moveArrayItem(source, fromIndex, fromIndex - 1);
			});

			this.controlsElement.addEventListener("move-down", () => {
				const source = this.parent?.resolveSource();
				if (!source) {
					throw new Error("Source not found");
				}

				const fromIndex = Number(this.element.dataset.prop);
				window.CloudCannon?.moveArrayItem(source, fromIndex, fromIndex + 1);
			});

			this.controlsElement.addEventListener("delete", () => {
				const source = this.parent?.resolveSource();
				if (!source) {
					throw new Error("Source not found");
				}

				const fromIndex = Number(this.element.dataset.prop);
				window.CloudCannon?.removeArrayItem(source, fromIndex);
			});

			this.controlsElement.addEventListener("dragstart", (e: DragEvent) => {
				const source = this.parent?.resolveSource();
				if (!source || !e.dataTransfer || !this.element.dataset.prop) {
					return;
				}

				const clientRect = this.element.getBoundingClientRect();

				e.stopPropagation();
				this.element.classList.add("dragging");
				this.element.style.outline = "none";

				e.dataTransfer.setDragImage(this.element, clientRect.width - 35, 35);
				e.dataTransfer.effectAllowed = "move";
				e.dataTransfer?.setData(source, this.element.dataset.prop);

				const data: Record<string, any> = {
					index: this.element.dataset.prop,
					slug: source,
					value: this.value,
				};

				if (this.inputConfig?.options?.structures?.values?.length > 1) {
					data.structure = window.CloudCannon?.findStructure(
						this.inputConfig?.options?.structures,
						this.value,
					);
				}

				e.dataTransfer?.setData(this.getDragType(), JSON.stringify(data));
			});

			window.CloudCannon?.getInputConfig(
				this.parent?.resolveSource() ?? "",
			).then((inputConfig) => {
				if (!this.controlsElement || typeof inputConfig !== "object") {
					return;
				}

				this.controlsElement.disableMoveUp =
					Number(this.element.dataset.prop) === 0;
				this.controlsElement.disableMoveDown =
					Number(this.element.dataset.prop) ===
					Number(this.element.dataset.length) - 1;

				this.controlsElement.disableReorder =
					(inputConfig as any)?.options?.disable_reorder ?? false;
				this.controlsElement.disableRemove =
					(inputConfig as any)?.options?.disable_remove ?? false;

				this.inputConfig = inputConfig;
				this.element.append(this.controlsElement);
			});
		}

		this.element.ondragend = () => {
			this.element.classList.remove("dragging");
			this.element.style.outline = "";
		};

		this.element.ondragenter = this.onHover.bind(this);
		this.element.ondragover = this.onHover.bind(this);

		this.element.ondragleave = (e: DragEvent): void => {
			e.stopPropagation();

			this.element.classList.remove("dragover");
			this.element.style.outline = "";
		};

		this.element.ondrop = (e: DragEvent): void => {
			this.element.classList.remove("dragover");
			this.element.style.outline = "";

			if (!e.dataTransfer) {
				return;
			}

			const source = this.parent?.resolveSource();
			if (!source) {
				throw new Error("Source not found");
			}

			const dragType = this.getDragType();
			const sameArrayData = e.dataTransfer.getData(source);
			const otherArrayData = e.dataTransfer.getData(dragType);

			if (sameArrayData) {
				const fromIndex = Number(sameArrayData);
				const newIndex = Number(this.element.dataset.prop);

				e.preventDefault();
				e.stopPropagation();
				e.dataTransfer.dropEffect = "move";

				if (window.CloudCannon && fromIndex !== newIndex) {
					window.CloudCannon.moveArrayItem(source, fromIndex, newIndex);
				}
			} else if (otherArrayData && dragType === "cc:structure") {
				const { index, slug, value, structure } = JSON.parse(otherArrayData);

				if (!this.inputConfig?.options?.structures?.values) {
					throw new Error("No structures found");
				}

				const targetStructure = window.CloudCannon?.findStructure(
					this.inputConfig.options.structures,
					this.value,
				);
				if (!targetStructure) {
					throw new Error("No target structure found");
				}

				if (JSON.stringify(structure) !== JSON.stringify(targetStructure)) {
					throw new Error("Structures do not match");
				}

				const newIndex = Number(this.element.dataset.prop) + 1;
				window.CloudCannon?.removeArrayItem(slug, index);
				window.CloudCannon?.addArrayItem(source, newIndex, value);

				e.preventDefault();
				e.stopPropagation();
				e.dataTransfer.dropEffect = "move";
			} else if (otherArrayData) {
				const { index, slug, value } = JSON.parse(otherArrayData);
				window.CloudCannon?.removeArrayItem(slug, index);

				const newIndex = Number(this.element.dataset.prop) + 1;
				window.CloudCannon?.addArrayItem(source, newIndex, value);

				e.preventDefault();
				e.stopPropagation();
				e.dataTransfer.dropEffect = "move";
			}
		};
	}

	setupListeners(): void {
		super.setupListeners();
		this.parent?.registerListener({ editable: this });
	}
}
