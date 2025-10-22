import "../components/ui/editable-array-item-controls.js";
import type EditableArrayItemControls from "../components/ui/editable-array-item-controls.js";
import {
	hasEditableArrayItem,
	isEditableArrayItem,
} from "../helpers/checks.js";
import { CloudCannon, realizeAPIValue } from "../helpers/cloudcannon.js";
import EditableArray from "./editable-array.js";
import EditableComponent from "./editable-component.js";

export default class EditableArrayItem extends EditableComponent {
	parent: EditableArray | null = null;

	protected controlsElement?: EditableArrayItemControls;

	private inputConfig?: any;

	shouldMount(): boolean {
		return this.value !== undefined;
	}

	validateConfiguration(): boolean {
		const key = this.element.dataset.component;
		if (key) {
			const component = this.getComponents()[key];
			if (!component) {
				this.element.classList.add("errored");
				const error = document.createElement("editable-region-error-card");
				error.setAttribute("heading", "Failed to render component");
				error.setAttribute("message", `Couldn't find component '${key}'`);
				this.element.replaceChildren(error);
				return false;
			}
		}

		if (!this.parent || !(this.parent instanceof EditableArray)) {
			this.element.classList.add("errored");
			const error = document.createElement("editable-region-error-card");
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

	isValidDropzone(e: DragEvent): boolean {
		const source = this.parent?.contextBase?.filePath;
		if (!source || !e.dataTransfer) {
			return false;
		}

		const dragType = this.getDragType();

		if (
			!e.dataTransfer?.types.includes(source.toLowerCase()) &&
			(!dragType || !e.dataTransfer.types.includes(dragType))
		) {
			return false;
		}

		return true;
	}

	onHover(e: DragEvent): void {
		if (!this.isValidDropzone(e)) {
			return;
		}

		e.preventDefault();
		e.stopPropagation();
		this.element.classList.add("dragover");
		this.element.style.boxShadow = this.getDraggingBoxShadow(e);
	}

	getDragType(): string | undefined {
		if (this.inputConfig?.options?.structures?.values?.length) {
			return "cc:structure";
		}

		const currentArraySubtype = this.inputConfig?.options?.__array_subtype;
		if (currentArraySubtype) {
			return `cc:${currentArraySubtype}`;
		}

		const type = CloudCannon.getInputType(
			this.contextBase?.filePath,
			this.value,
			this.inputConfig,
		);
		if (type === "array" || type === "object") {
			return undefined;
		}
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

	dispatchArrayMove(fromIndex: number, toIndex: number, fromSlug?: string) {
		this.element.dispatchEvent(
			new CustomEvent("cloudcannon-api", {
				bubbles: true,
				detail: {
					action: "move-array-item",
					fromSlug,
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

	dispatchArrayAdd(newIndex: number, value: unknown, sourceIndex?: number) {
		this.element.dispatchEvent(
			new CustomEvent("cloudcannon-api", {
				bubbles: true,
				detail: {
					action: "add-array-item",
					newIndex,
					sourceIndex,
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
			this.controlsElement = document.createElement(
				"editable-array-item-controls",
			);
			this.controlsElement.addEventListener("edit", (e: any) => {
				this.dispatchEdit(this.element.dataset.prop);
			});

			this.controlsElement.addEventListener("add", () => {
				const fromIndex = Number(this.element.dataset.prop);
				const arrayDirection = this.parent?.arrayDirection ?? "column";
				const reversed = arrayDirection.endsWith("reverse");

				this.dispatchArrayAdd(
					reversed ? fromIndex - 1 : fromIndex + 1,
					undefined,
					fromIndex,
				);
			});

			this.controlsElement.addEventListener("duplicate", async () => {
				const value = await realizeAPIValue(this.value);
				const fromIndex = Number(this.element.dataset.prop);
				const arrayDirection = this.parent?.arrayDirection ?? "column";
				const reversed = arrayDirection.endsWith("reverse");

				this.dispatchArrayAdd(
					reversed ? fromIndex - 1 : fromIndex + 1,
					value,
					fromIndex,
				);

				this.controlsElement?.removeAttribute("open");
				this.element.after(this.element.cloneNode(true));
			});

			this.controlsElement.addEventListener("move-backward", () => {
				const fromIndex = Number(this.element.dataset.prop);
				const arrayDirection = this.parent?.arrayDirection ?? "column";
				const reversed = arrayDirection.endsWith("reverse");

				this.dispatchArrayMove(
					fromIndex,
					reversed ? fromIndex + 1 : fromIndex - 1,
				);

				if (isEditableArrayItem(this.element.previousElementSibling)) {
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

				if (isEditableArrayItem(this.element.nextElementSibling)) {
					this.element.nextElementSibling?.after(this.element);
				}
			});

			this.controlsElement.addEventListener("delete", () => {
				this.dispatchArrayRemove(Number(this.element.dataset.prop));
				this.element.remove();
			});

			this.controlsElement.addEventListener("dragstart", (e: DragEvent) => {
				const source = this.parent?.contextBase?.filePath;
				if (!source || !e.dataTransfer || !this.element.dataset.prop) {
					return;
				}

				const clientRect = this.element.getBoundingClientRect();

				e.stopPropagation();
				this.element.classList.add("dragging");

				e.dataTransfer.setDragImage(this.element, clientRect.width - 35, 35);
				e.dataTransfer.effectAllowed = "move";

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

				const payload = JSON.stringify(data);
				e.dataTransfer?.setData(source, payload);
				const dragType = this.getDragType();
				if (dragType) {
					e.dataTransfer?.setData(dragType, payload);
				}
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
				this.controlsElement.disableAdd =
					(inputConfig as any)?.options?.disable_add ?? false;

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
			if (!this.isValidDropzone(e)) {
				return;
			}
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

			const source = this.parent?.contextBase?.filePath;
			if (!source) {
				throw new Error("Source not found");
			}

			const dragType = this.getDragType();
			const sameArrayData = e.dataTransfer.getData(source);
			const otherArrayData = dragType
				? e.dataTransfer.getData(dragType)
				: undefined;

			const position = this.getDragPosition(e);
			let newIndex =
				position === "after"
					? Number(this.element.dataset.prop) + 1
					: Number(this.element.dataset.prop);

			if (sameArrayData) {
				const { index: fromIndex, sourceId } = JSON.parse(sameArrayData);

				if (fromIndex < newIndex) {
					newIndex -= 1;
				}

				if (fromIndex !== newIndex) {
					const sourceElement = document.getElementById(sourceId);
					if (sourceElement) {
						if (position === "after") {
							this.element.after(sourceElement);
						} else {
							this.element.before(sourceElement);
						}
					}
					this.dispatchArrayMove(fromIndex, newIndex);
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
				if (sourceElement && hasEditableArrayItem(sourceElement)) {
					const parentValue = this.parent?.value;
					if (Array.isArray(parentValue)) {
						parentValue.splice(newIndex, 0, value);
					}
					sourceElement.dataset.prop = `${newIndex}`;
					const fromSlug = sourceElement.editable.parent?.contextBase?.fullPath;
					if (position === "after") {
						this.element.after(sourceElement);
					} else {
						this.element.before(sourceElement);
					}

					this.dispatchArrayMove(index, newIndex, fromSlug);
				}
			}

			e.preventDefault();
			e.stopPropagation();
			e.dataTransfer.dropEffect = "move";
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
