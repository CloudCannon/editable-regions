/**
 * @fileoverview CloudCannon Editor Components - Astro Integration
 * 
 * This module provides integration utilities for CloudCannon editor components
 * with Astro framework, including React and Astro component registration.
 */

import CloudCannonIntegration from "./cloudcannon-integration.astro";
import { registerReactComponent } from "./react.js";
import { registerAstroComponent } from "./astro.js";

/**
 * Registers an Astro component with the CloudCannon component system.
 * @param key - Unique identifier for the component
 * @param component - The Astro component function to register
 */
export { registerAstroComponent };

/**
 * Registers a React component with the CloudCannon component system.
 * @param key - Unique identifier for the component
 * @param component - The React component to register
 */
export { registerReactComponent };

/**
 * CloudCannon integration component for Astro.
 */
export { CloudCannonIntegration };