/**
 * @fileoverview CloudCannon Editor Components - React Integration
 *
 * This module provides functionality to register React components with the
 * CloudCannon component system, enabling real-time preview and editing
 * of React components within the CloudCannon editor.
 */

import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { createElement } from "react";

/**
 * Registers a React component with the CloudCannon component system.
 * Creates a wrapper function that renders the React component into the target element
 * and handles special cases like nested live-components.
 *
 * @param key - Unique identifier for the component in the global registry
 * @param component - The React component to register
 */
export const registerReactComponent = (key: string, component: Function): void => {
  /**
   * Wrapper function that renders the React component with given props.
   * Handles DOM synchronization and special live-component replacement logic.
   *
   * @param target - The DOM element to render the component into
   * @param props - Props to pass to the React component
   */
  const wrappedComponent = (target: HTMLElement, props: any): void => {
    console.log(props);
    // Create React element and temporary container
    const reactNode = createElement(component as any, props, null);
    const rootEl = document.createElement("div");
    const root = createRoot(rootEl);

    // Render synchronously to ensure DOM is ready
    flushSync(() => root.render(reactNode));

    // Handle special case where React component renders a live-component
    const child = rootEl.firstElementChild;
    if (
      child?.tagName === "LIVE-COMPONENT" &&
      child.getAttribute("component") === key
    ) {
      // Transfer value and replace target entirely
      (child as any).value = (target as any).value;
      target.replaceWith(child);
    } else {
      // Standard DOM synchronization - replace children while preserving target element
      let targetChild: ChildNode | null | undefined = target.firstChild ?? undefined;
      let renderChild: ChildNode | null | undefined = rootEl.firstChild ?? undefined;
      while (renderChild || targetChild) {
        if (renderChild && targetChild) {
          // Replace existing child with rendered child
          targetChild.replaceWith(renderChild);
        } else if (renderChild) {
          // Append additional rendered children
          target.appendChild(renderChild);
        } else if (targetChild) {
          // Remove extra target children
          target.removeChild(targetChild);
        }

        targetChild = targetChild?.nextSibling ?? undefined;
        renderChild = renderChild?.nextSibling ?? undefined;
      }
    }
  };

  // Register the wrapped component in the global registry
  window.cc_components ??= {};
  window.cc_components[key] = wrappedComponent;
};
