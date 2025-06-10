import Editable, { EditableListener } from "./editable.js";

export default class ArrayItem extends Editable {
  dragging: boolean = false;
  editButton: HTMLElement | undefined = undefined;
  dragHandle: HTMLElement | undefined = undefined;
  noSwapBack: boolean = false;

  pushValue(value: unknown, listener?: EditableListener): void {
    if (this.dragging) {
      return;
    }
    super.pushValue(value, listener);
  }

  registerListener(listener: EditableListener): void {
    if (
      this.listeners.find(
        ({ editable: other }) => listener.editable.element === other.element,
      )
    ) {
      return;
    }

    if (this.value && !this.dragging) {
      listener.editable.pushValue(this.value, listener);
    }

    this.listeners.push(listener);
  }

  mount(): void {
    this.element.style.cssText = this.dragging
      ? "position: relative; display: block; outline: 1px dashed #034ad8; opacity: 0.5"
      : "position: relative; display: block; outline: 1px solid #034ad8";

    if (!this.editButton) {
      this.editButton = document.createElement("div");
      this.editButton.style.cssText = `
        position: absolute;
        top: 10px;
        right: 60px;
        width: 40px;
        height: 40px;
        background-color: #cfcfcf;
        z-index: 99999999999;
        cursor: pointer;
        border-radius: 5px;
        display: grid;
        place-items: center;
      `;
      this.editButton.innerHTML = "<cc-icon name='mdi:edit'></cc-icon>";

      this.element.append(this.editButton);
    }

    if (!this.dragHandle) {
      this.dragHandle = document.createElement("div");
      this.dragHandle.className = "drag-handle";
      this.dragHandle.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        width: 40px;
        height: 40px;
        background-color: #cfcfcf;
        z-index: 99999999999;
        cursor: grab;
        border-radius: 5px;
        display: grid;
        place-items: center;
      `;
      this.dragHandle.draggable = true;
      this.dragHandle.innerHTML =
        "<cc-icon name='mdi:drag_indicator'></cc-icon>";

      /**
       * Handles the start of drag operation for this array item.
       *
       * @param e - The drag start event
       */
      this.dragHandle.ondragstart = (e: DragEvent): void => {
        e.stopPropagation();
        if (e.dataTransfer) {
          e.dataTransfer.setDragImage(this.element, 10, 10);
          e.dataTransfer.effectAllowed = "move";
        }
        this.dragging = true;
        this.element.style.cssText =
          "position: relative; display: block; outline: 1px dashed #034ad8; opacity: 0.5";
        this.element.dispatchEvent(
          new Event("started-drag", { bubbles: true }),
        );
      };

      /**
       * Handles the end of drag operation for this array item.
       *
       * @param e - The drag end event
       */
      this.dragHandle.ondragend = (e: DragEvent): void => {
        this.dragging = false;
        this.element.style.cssText =
          "position: relative; display: block; outline: 1px solid #034ad8";
      };

      this.element.append(this.dragHandle);
    }

    this.element.ondragenter = (e: DragEvent): void => {
      if (this.noSwapBack) {
        return;
      }
      e.preventDefault();
      this.element.dispatchEvent(new Event("hovered", { bubbles: true }));
    };

    this.element.ondragover = (e: DragEvent): void => {
      e.preventDefault();
    };

    this.element.ondrop = (e: DragEvent): void => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "move";
      }
      this.element.dispatchEvent(new Event("ended-drag", { bubbles: true }));
    };
  }

  setupListeners(): void {
    super.setupListeners();
    this.parent?.registerListener({ editable: this });
  }
}
