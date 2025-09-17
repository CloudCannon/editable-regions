import "../components/ui/array-controls.js";
import type ArrayControls from "../components/ui/array-controls.js";
import { hasArrayItemEditable, isArrayItem } from "../helpers/checks.js";
import { CloudCannon } from "../helpers/cloudcannon.js";
import type { WindowType } from "../types/window.js";
import ArrayEditable from "./array-editable.js";
import ComponentEditable from "./component-editable.js";

declare const window: WindowType;

export default class ArrayItem extends ComponentEditable {
	parent: ArrayEditable | null = null;

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
		this.element.style.boxShadow = this.getDraggingBoxShadow(e);
	}

	getDragType(): string {
		if (this.inputConfig?.options?.structures?.values?.length) {
			return "cc:structure";
		}

		const currentArraySubtype = this.inputConfig?.options?.__array_subtype;
		if (currentArraySubtype) {
			return `cc:${currentArraySubtype}`;
		}

		const type = CloudCannon.getInputType(this.resolveSource(), this.value);
		return `cc:${type}`;
	}

	getDraggingBoxShadow(e: DragEvent): string {
		const position = this.getDragPosition(e);
		const arrayDirection = this.parent?.arrayDirection || "column";

		const column = arrayDirection.startsWith("column");
		const reversed = arrayDirection.endsWith("reverse");

		if (column) {
			if (reversed) {
				if (position === "before") {
					return "0 3px 0 var(--ccve-color-sol)";
				}
				return "0 -3px 0 var(--ccve-color-sol)";
			}
			if (position === "before") {
				return "0 -3px 0 var(--ccve-color-sol)";
			}
			return "0 3px 0 var(--ccve-color-sol)";
		}

		if (reversed) {
			if (position === "before") {
				return "3px 0 0 var(--ccve-color-sol)";
			}
			return "-3px 0 0 var(--ccve-color-sol)";
		}
		if (position === "before") {
			return "-3px 0 0 var(--ccve-color-sol)";
		}
		return "3px 0 0 var(--ccve-color-sol)";
	}

	getDragPosition(e: DragEvent): "before" | "after" {
		const rect = this.element.getBoundingClientRect();
		const arrayDirection = this.parent?.arrayDirection ?? "column";

		const mousePos = arrayDirection.startsWith("row") ? e.clientX : e.clientY;
		const elementPos = arrayDirection.startsWith("row") ? rect.left : rect.top;
		const elementSize = arrayDirection.startsWith("row")
			? rect.width
			: rect.height;

		const relativePos = mousePos - elementPos;
		const isInFirstHalf = relativePos < elementSize / 2;
		const isBefore = arrayDirection.endsWith("reverse")
			? !isInFirstHalf
			: isInFirstHalf;

		return isBefore ? "before" : "after";
	}

	dispatchArrayMove(fromIndex: number, toIndex: number) {
		this.element.dispatchEvent(
			new CustomEvent("cloudcannon-api", {
				bubbles: true,
				detail: {
					action: "move-array-item",
					fromIndex,
					toIndex,
				},
			}),
		);
	}

	dispatchArrayRemove(fromIndex: number, source?: string) {
		this.element.dispatchEvent(
			new CustomEvent("cloudcannon-api", {
				bubbles: true,
				detail: {
					action: "remove-array-item",
					fromIndex,
					source,
				},
			}),
		);
	}

	dispatchArrayAdd(newIndex: number, value: unknown) {
		this.element.dispatchEvent(
			new CustomEvent("cloudcannon-api", {
				bubbles: true,
				detail: {
					action: "add-array-item",
					newIndex,
					value,
				},
			}),
		);
	}

	async update(): Promise<void> {
		await super.update();
		this.updateControls();
	}

	updateControls() {
		if (!this.controlsElement) {
			return;
		}

		const arrayDirection = this.parent?.arrayDirection ?? "column";
		const reversed = arrayDirection.endsWith("reverse");

		this.controlsElement.arrayDirection = arrayDirection;

		if (arrayDirection.startsWith("column")) {
			this.controlsElement.moveBackwardText = "up";
			this.controlsElement.moveForwardText = "down";
		} else {
			this.controlsElement.moveBackwardText = "left";
			this.controlsElement.moveForwardText = "right";
		}

		if (reversed) {
			this.controlsElement.disableMoveBackward =
				Number(this.element.dataset.prop) ===
				Number(this.element.dataset.length) - 1;
			this.controlsElement.disableMoveForward =
				Number(this.element.dataset.prop) === 0;
		} else {
			this.controlsElement.disableMoveBackward =
				Number(this.element.dataset.prop) === 0;
			this.controlsElement.disableMoveForward =
				Number(this.element.dataset.prop) ===
				Number(this.element.dataset.length) - 1;
		}
	}

	mount(): void {
		if (!this.controlsElement) {
			this.controlsElement = document.createElement("array-controls");
			this.controlsElement.addEventListener("edit", (e: any) => {
				this.dispatchEdit(this.element.dataset.prop);
			});

			this.controlsElement.addEventListener("move-backward", () => {
				const fromIndex = Number(this.element.dataset.prop);
				const arrayDirection = this.parent?.arrayDirection ?? "column";
				const reversed = arrayDirection.endsWith("reverse");

				this.dispatchArrayMove(
					fromIndex,
					reversed ? fromIndex + 1 : fromIndex - 1,
				);

				if (isArrayItem(this.element.previousElementSibling)) {
					this.element.previousElementSibling?.before(this.element);
				}
			});

			this.controlsElement.addEventListener("move-forward", () => {
				const fromIndex = Number(this.element.dataset.prop);
				const arrayDirection = this.parent?.arrayDirection ?? "column";
				const reversed = arrayDirection.endsWith("reverse");

				this.dispatchArrayMove(
					fromIndex,
					reversed ? fromIndex - 1 : fromIndex + 1,
				);

				if (isArrayItem(this.element.nextElementSibling)) {
					this.element.nextElementSibling?.after(this.element);
				}
			});

			this.controlsElement.addEventListener("delete", () => {
				this.dispatchArrayRemove(Number(this.element.dataset.prop));
				this.element.remove();
			});

			this.controlsElement.addEventListener("dragstart", (e: DragEvent) => {
				const source = this.parent?.resolveSource();
				if (!source || !e.dataTransfer || !this.element.dataset.prop) {
					return;
				}

				const clientRect = this.element.getBoundingClientRect();

				e.stopPropagation();
				this.element.classList.add("dragging");

				e.dataTransfer.setDragImage(this.element, clientRect.width - 35, 35);
				e.dataTransfer.effectAllowed = "move";
				e.dataTransfer?.setData(source, this.element.dataset.prop);

				const id = Math.random().toString(36).slice(2);
				this.element.id = id;

				const data: Record<string, any> = {
					index: this.element.dataset.prop,
					sourceId: id,
					value: this.value,
				};

				if (this.inputConfig?.options?.structures?.values?.length > 0) {
					data.structure = CloudCannon.findStructure(
						this.inputConfig?.options?.structures,
						this.value,
					);
				}

				e.dataTransfer?.setData(this.getDragType(), JSON.stringify(data));
			});

			this.updateControls();

			this.dispatchGetInputConfig().then((inputConfig) => {
				if (!this.controlsElement) {
					return;
				}

				if (typeof inputConfig !== "object") {
					this.element.append(this.controlsElement);
					return;
				}

				this.controlsElement.disableReorder =
					(inputConfig as any)?.options?.disable_reorder ?? false;
				this.controlsElement.disableRemove =
					(inputConfig as any)?.options?.disable_remove ?? false;

				this.inputConfig = inputConfig;
				this.element.append(this.controlsElement);
			});
		}

		this.element.ondragend = (): void => {
			this.element.classList.remove("dragging");
			this.element.style.boxShadow = "";
		};

		this.element.ondragenter = this.onHover.bind(this);
		this.element.ondragover = this.onHover.bind(this);

		this.element.ondragleave = (e: DragEvent): void => {
			e.stopPropagation();

			this.element.classList.remove("dragover");
			this.element.style.boxShadow = "";
		};

		this.element.ondrop = (e: DragEvent): void => {
			this.element.classList.remove("dragover");
			this.element.style.boxShadow = "";

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

			const position = this.getDragPosition(e);
			let newIndex =
				position === "after"
					? Number(this.element.dataset.prop) + 1
					: Number(this.element.dataset.prop);

			if (sameArrayData) {
				const fromIndex = Number(sameArrayData);
				if (fromIndex < newIndex) {
					newIndex -= 1;
				}

				e.preventDefault();
				e.stopPropagation();
				e.dataTransfer.dropEffect = "move";

				if (fromIndex !== newIndex) {
					this.dispatchArrayMove(fromIndex, newIndex);
					const sourceElement = this.parent?.element.querySelector(
						`[data-prop="${fromIndex}"]`,
					);
					if (sourceElement) {
						if (position === "after") {
							this.element.after(sourceElement);
						} else {
							this.element.before(sourceElement);
						}
					}
				}
			} else if (otherArrayData) {
				const { index, sourceId, value, structure } =
					JSON.parse(otherArrayData);
				if (dragType === "cc:structure") {
					if (!this.inputConfig?.options?.structures?.values) {
						throw new Error("No structures found");
					}

					const targetStructure = CloudCannon.findStructure(
						this.inputConfig.options.structures,
						this.value,
					);
					if (!targetStructure) {
						throw new Error("No target structure found");
					}

					if (JSON.stringify(structure) !== JSON.stringify(targetStructure)) {
						throw new Error("Structures do not match");
					}
				}

				const sourceElement = document.getElementById(sourceId);
				if (sourceElement && hasArrayItemEditable(sourceElement)) {
					if (Array.isArray(sourceElement.editable.parent?.value)) {
						sourceElement.editable.parent.value = structuredClone(
							sourceElement.editable.parent.value,
						);
						sourceElement.editable.parent.value.splice(index, 1);
					}
					sourceElement.editable.dispatchArrayRemove(index);
					if (position === "after") {
						this.element.after(sourceElement);
					} else {
						this.element.before(sourceElement);
					}
					sourceElement.editable.parent?.update();
				}
				if (Array.isArray(this.parent?.value)) {
					this.parent.value = structuredClone(this.parent.value);
					this.parent.value.splice(newIndex, 0, value);
				}
				this.dispatchArrayAdd(newIndex, value);
				this.parent?.update();

				e.preventDefault();
				e.stopPropagation();
				e.dataTransfer.dropEffect = "move";
			}
		};

		if (this.value !== undefined) {
			this.update();
		}
	}

	setupListeners(): void {
		super.setupListeners();
		this.parent?.registerListener({ editable: this });
	}
}
