/**
 * Global type definitions for CloudCannon Editor Components
 */

import Editable from "../nodes/editable.js";
import ArrayItem from "../nodes/array-item.js";
import LiveComponent from "../nodes/live-component.js";


declare global {
  interface Window {
    /** CloudCannon API object */
    CloudCannon?: {
      /** Set a value at the given data path */
      set(path: string, value: any): void;
      /** Move an array item from one index to another */
      moveArrayItem(path: string, fromIndex: number, toIndex: number): void;
    };

    /** Root listeners for top-level editable components */
    cc_root_listeners?: Array<{
      element: HTMLElement;
      source: string | null;
    }>;

    /** Registered component renderers */
    cc_components?: Record<string, ComponentRenderer>;
  }

  /** Function that renders a component with given props */
  type ComponentRenderer = (target: HTMLElement, props: any) => void | Promise<void>;

  /** Options for pushing values to editable components */
  interface PushValueOptions {
    /** Whether to suppress triggering listeners */
    silent?: boolean;
  }

  /** Listener configuration for editable components */
  interface EditableListener {
    /** The target element that will receive updates */
    element: Editable;
    /** Optional source path for nested data access */
    source?: string;
  }

  interface HTMLElementTagNameMap {
    'array-editable': HTMLElement & { editable: import("../nodes/array-editable.js").default };
    'array-item': HTMLElement & { editable: ArrayItem };
    'inline-editable': HTMLElement & { editable: import("../nodes/inline-editable.js").default };
    'live-component': HTMLElement & { editable: LiveComponent };
  }
}

export { };
