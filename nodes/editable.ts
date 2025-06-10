export interface EditableListener {
  editable: Editable;
  key?: string;
  path?: string;
}

export default class Editable {
  listeners: EditableListener[] = [];
  value: unknown = undefined;
  parent: Editable | null = null;
  element: HTMLElement;

  propsBase: unknown;
  props: Record<string, unknown> = {};

  constructor(element: HTMLElement) {
    this.element = element;
  }

  getNewValue(value: unknown, listener?: EditableListener): unknown {
    const { key, path } = listener ?? {};
    if (!key) {
      this.propsBase = path ? (value as any)[path] : value;
    } else {
      this.props[key] = path ? (value as any)[path] : value;
    }

    const newValue = Object.entries(this.props).reduce((acc, [key, val]) => {
      (acc as any)[key] = structuredClone(val);
      return acc;
    }, structuredClone(this.propsBase));

    return this.validateValue(newValue);
  }

  pushValue(value: unknown, listener?: EditableListener): void {
    const newValue = this.getNewValue(value, listener);

    if (typeof newValue === "undefined") {
      return;
    }

    this.value = newValue;
    this.update();
  }

  update(): void {
    this.listeners.forEach((listener) =>
      listener.editable.pushValue(this.value, listener),
    );
  }

  validateValue(value: unknown): unknown {
    return value;
  }

  registerListener(listener: EditableListener): void {
    if (
      this.listeners.find(
        ({ editable: other }) => listener.editable.element === other.element,
      )
    ) {
      return;
    }

    listener.editable.pushValue(this.value, listener);

    this.listeners.push(listener);
  }

  deregisterListener(target: Editable): void {
    this.listeners = this.listeners.filter(
      ({ editable }) => editable.element !== target.element,
    );
  }

  disconnect(): void {
    this.parent?.deregisterListener(this);
    this.parent = null;
  }

  resolveSource(source?: string): string | undefined {
    const propKey = source?.split(".")[0];
    const newSource =
      this.element.dataset[`prop-${propKey}`] ?? this.element.dataset["prop"];

    if (typeof newSource === "string" && typeof source === "string") {
      source = `${newSource}.${source}`;
    } else if (typeof newSource === "string") {
      source = newSource;
    }

    // TODO: If source is absolute, return it as is

    if (this.parent) {
      return this.parent.resolveSource(source);
    } else {
      return source;
    }
  }

  connect(): void {
    Promise.all([
      customElements.whenDefined("array-item"),
      customElements.whenDefined("array-editable"),
      customElements.whenDefined("inline-editable"),
      customElements.whenDefined("block-editable"),
      customElements.whenDefined("live-component"),
    ]).then(() => {
      if (this.validateConfiguration()) {
        this.setupListeners();
        this.mount();
      }
    });
  }

  setupListeners(): void {
    let parentEditable: Editable | undefined;
    let parent = this.element.parentElement;
    while (parent) {
      if ("editable" in parent && (parent as any).editable instanceof Editable) {
        parentEditable = (parent as any).editable;
        break;
      }
      parent = parent.parentElement;
    }

    this.parent = parentEditable || null;

    Object.entries(this.element.dataset).forEach(([propName, propPath]) => {
      if (!propName.startsWith("prop")) {
        return;
      }

      // TODO: Parse the propPath
      // TODO: If the propPath is absolute listen to the API
      if (!parentEditable) {
        const loadCloudCannonValue = async (CloudCannon: any) => {
          console.log("Loading value...");
          const value = await CloudCannon.value();
          console.log("Loaded", value);
          this.pushValue(value, {
            editable: this,
            // key: propName.substring(5),
            path: propPath,
          });
        };

        document.addEventListener("cloudcannon:load", function (e) {
          (e as any).detail.CloudCannon.enableEvents();
          return loadCloudCannonValue((e as any).detail.CloudCannon);
        });

        document.addEventListener("cloudcannon:update", async (e) => {
          return loadCloudCannonValue((e as any).detail.CloudCannon);
        });
        return;
      }

      if (propName.startsWith("prop-")) {
        parentEditable.registerListener({
          editable: this,
          key: propName.substring(5),
          path: propPath,
        });
      } else {
        parentEditable.registerListener({
          editable: this,
          path: propPath,
        });
      }
    });
  }

  mount(): void {
  }

  validateConfiguration(): boolean {
    return true;
  }
}
