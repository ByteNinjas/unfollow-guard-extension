// Compatibility shims for the legacy DOM-heavy code. The panel and adapters use
// `querySelector` results (typed as Element) and custom Error flags extensively.
// These declarations keep the existing behavior type-checkable while modules are
// migrated incrementally.
interface Element {
  dataset: DOMStringMap;
  placeholder: string;
  title: string;
  tabIndex: number;
  files: FileList;
  value: string;
  href: string;
  checked: boolean;
  disabled: boolean;
  style: CSSStyleDeclaration;
  click(): void;
  focus(): void;
}

interface Error {
  fatal?: boolean;
  block?: boolean;
  skip?: boolean;
  useUI?: boolean;
  timeout?: boolean;
  stopped?: boolean;
}

interface Window {
  CSS: typeof CSS;
  webkitCSSMatrix?: unknown;
}
