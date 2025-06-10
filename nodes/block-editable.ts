import { EditorState, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Schema, DOMParser, DOMSerializer } from "prosemirror-model";
import { schema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { exampleSetup } from "prosemirror-example-setup";
import "prosemirror-menu/style/menu.css";
import Editable, { EditableListener } from "./editable.js";

const mySchema = new Schema({
  nodes: addListNodes(schema.spec.nodes, "paragraph block*", "block"),
  marks: schema.spec.marks,
});

export default class BlockEditable extends Editable {
  editor: EditorView | null = null;
  domValue: HTMLElement | null = null;

  pushValue(value: unknown, listener?: EditableListener): void {
    const newValue = this.getNewValue(value, listener);

    if (typeof newValue === "undefined") {
      return;
    }

    this.value = newValue;

    if (this.domValue && typeof newValue === 'string' && newValue !== this.domValue.innerHTML) {
      this.domValue.innerHTML = newValue;

      const doc = DOMParser.fromSchema(mySchema).parse(this.domValue, {
        preserveWhitespace: true,
      });
      const state = EditorState.create({
        doc, // this passes schema implicitly through doc
        plugins: exampleSetup({ schema: mySchema }),
      });

      this.editor?.updateState(state);
    }
  }

  getValue(): string {
    if (this.editor) {
      const innerDocument = document.implementation.createHTMLDocument();
      const div = innerDocument.createElement("div");
      div.appendChild(
        DOMSerializer.fromSchema(mySchema).serializeFragment(
          this.editor.state.doc.content,
          {
            document: innerDocument,
          },
        ),
      );
      return div.innerHTML;
    }

    if (!this.domValue) {
      throw new Error("domValue is not initialized");
    }

    return this.domValue.innerHTML;
  }

  mount(): void {
    this.element.style.cssText = "display: block; outline: 1px solid #034AD8;";
    this.domValue = document.createElement("div");

    // Move existing child content to the domValue container
    let child = this.element.firstChild;
    while (child) {
      const nextSibling = child.nextSibling;
      this.domValue.appendChild(child);
      child = nextSibling;
    }

    // Initialize the ProseMirror editor
    this.editor = new EditorView(this.element, {
      state: EditorState.create({
        doc: DOMParser.fromSchema(mySchema).parse(this.domValue),
        plugins: exampleSetup({ schema: mySchema }),
      }),
      /**
       * Handles ProseMirror transactions and syncs changes to CloudCannon.
       * Called whenever the editor content changes.
       *
       * @param transaction - The ProseMirror transaction to apply
       */
      dispatchTransaction: (transaction: Transaction): void => {
        if (this.editor) {
          const newState = this.editor.state.apply(transaction);
          this.editor.updateState(newState);
          const source = this.resolveSource();
          if (!source) {
            throw new Error("Invalid Source: Source not found");
          }
          if (window.CloudCannon) {
            window.CloudCannon.set(source, this.getValue());
          }
        }
      },
    });
  }
}
