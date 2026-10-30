// packages/css-properties/src/index.ts
import './styles.less';
import { getCssPropertyMetadata } from './catalog.js';
import type { CssEditorKind } from './catalog.js';
import { ValueCombobox } from './value-combobox.js';
import { createComplexEditor } from './complex-editors.js';
export { CSS_CATALOG_REVISION, getCssPropertyMetadata, getCssPropertyNames } from './catalog.js';
export type { CssPropertyMetadata, CssEditorKind } from './catalog.js';

export interface CssProperty {
  readonly name: string;
  readonly label?: string;
  readonly value: string;
  readonly disabled?: boolean;
  readonly diagnostic?: string;
  readonly capability?: 'instant' | 'interpolable';
  readonly suggestions?: readonly string[];
  readonly editor?: CssEditorKind;
}

export interface PropertyChange {
  readonly property: string;
  readonly oldValue: string;
  readonly newValue: string;
}

export interface CssPropertiesOptions {
  readonly commonProperties?: boolean;
}

const LABELS: Readonly<Record<string, string>> = {
  opacity: 'Opacité', width: 'Largeur', height: 'Hauteur', position: 'Position',
  top: 'Haut', left: 'Gauche', transform: 'Transformation', color: 'Couleur',
  'background-color': 'Fond', 'background-image': 'Image de fond',
  'margin-top': 'Marge haute', margin: 'Marges', padding: 'Espacement intérieur',
  border: 'Bordure', 'border-radius': 'Arrondis', 'box-shadow': 'Ombre',
  'font-family': 'Police', 'font-size': 'Taille du texte', 'font-weight': 'Graisse',
};

let panelCount = 0;

/** Controlled CSS editor: only the host accepts and persists an edit. */
export class CssPropertiesPanel {
  private readonly root: HTMLDivElement;
  private readonly rows: HTMLDivElement;
  private readonly search: HTMLInputElement;
  private readonly listeners = new Set<(change: PropertyChange) => void>();
  private readonly prefix = `css-properties-${++panelCount}`;
  private properties: readonly CssProperty[] = [];
  private destroyed = false;
  private rowAbort = new AbortController();
  private readonly comboboxes: ValueCombobox[] = [];
  private activeCombobox: ValueCombobox | null = null;
  private activeEditor: { readonly control: ReturnType<typeof createComplexEditor>; readonly launcher: HTMLButtonElement; readonly abort: AbortController } | null = null;
  private readonly requested = new WeakMap<HTMLInputElement, string>();

  public constructor(container: HTMLElement, private readonly options: CssPropertiesOptions = {}) {
    const document = container.ownerDocument;
    this.root = document.createElement('div');
    this.root.className = 'CssPropertiesPanel';
    this.search = document.createElement('input');
    this.search.className = 'properties-search';
    this.search.type = 'search';
    this.search.placeholder = 'Rechercher une propriété';
    this.search.setAttribute('aria-label', 'Rechercher une propriété CSS');
    this.search.addEventListener('input', () => this.filterRows());
    this.rows = document.createElement('div');
    this.root.append(this.search, this.rows);
    container.append(this.root);
    this.setProperties([]);
  }

  public setProperties(properties: readonly CssProperty[]): void {
    if (this.destroyed) return;
    const focus = this.root.ownerDocument.activeElement;
    const focusedProperty = focus instanceof HTMLInputElement && this.rows.contains(focus) ? focus.dataset.property : undefined;
    this.closeEditor(false); this.rowAbort.abort(); this.rowAbort = new AbortController();
    for (const combobox of this.comboboxes.splice(0)) combobox.destroy(); this.activeCombobox = null;
    this.properties = properties.map((property) => ({ ...property }));
    this.rows.replaceChildren();
    if (properties.length === 0) {
      const empty = this.root.ownerDocument.createElement('p');
      empty.className = 'properties-empty';
      empty.textContent = 'Sélectionnez un élément pour inspecter ses propriétés.';
      this.rows.append(empty);
      return;
    }
    const common = this.properties.filter((property) => Object.hasOwn(LABELS, property.name));
    const other = this.properties.filter((property) => !Object.hasOwn(LABELS, property.name));
    if (this.options.commonProperties) {
      this.addGroup('Propriétés courantes', common);
      this.addGroup('Autres propriétés', other);
    } else {
      this.properties.forEach((property, index) => this.rows.append(this.createRow(property, index)));
    }
    this.filterRows();
    if (focusedProperty) [...this.rows.querySelectorAll<HTMLInputElement>('input[data-property]')].find(input => input.dataset.property === focusedProperty)?.focus({ preventScroll: true });
  }

  public onChange(listener: (change: PropertyChange) => void): () => void {
    if (this.destroyed) return () => undefined;
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  public destroy(): void {
    this.destroyed = true;
    this.closeEditor(false); this.rowAbort.abort();
    for (const combobox of this.comboboxes.splice(0)) combobox.destroy(); this.activeCombobox = null;
    this.listeners.clear();
    this.properties = [];
    this.root.remove();
  }

  private addGroup(label: string, properties: readonly CssProperty[]): void {
    if (properties.length === 0) return;
    const heading = this.root.ownerDocument.createElement('h3');
    heading.className = 'properties-heading';
    heading.textContent = label;
    this.rows.append(heading);
    properties.forEach((property) => this.rows.append(this.createRow(property, this.properties.indexOf(property))));
  }

  private createRow(property: CssProperty, index: number): HTMLDivElement {
    const document = this.root.ownerDocument;
    const row = document.createElement('div');
    row.className = 'property-row';
    row.dataset.propertyRow = property.name;
    const label = document.createElement('label');
    label.textContent = property.label ?? (Object.hasOwn(LABELS, property.name) ? LABELS[property.name] ?? property.name : property.name);
    const input = document.createElement('input');
    input.id = `${this.prefix}-${index}`;
    input.dataset.property = property.name;
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.value = property.value;
    input.disabled = property.disabled ?? false;
    input.title = property.name;
    label.htmlFor = input.id;
    input.addEventListener('change', () => this.requestChange(property, input), { signal: this.rowAbort.signal });
    input.addEventListener('input', () => { if (this.requested.get(input) !== input.value) this.requested.delete(input); }, { signal: this.rowAbort.signal });
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      input.value = property.value;
      this.requested.delete(input);
    }, { signal: this.rowAbort.signal });
    const name = document.createElement('div'); name.className = 'property-name'; name.append(label);
    const metadata = getCssPropertyMetadata(property.name); const kind = property.editor ?? metadata.editor;
    if (kind !== 'keyword' && kind !== 'text') {
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'property-editor-toggle'; edit.textContent = '⋯'; edit.disabled = property.disabled ?? false;
      edit.setAttribute('aria-label', `Modifier ${property.name} avec un éditeur`); edit.title = `Modifier ${property.name} avec un éditeur`;
      edit.addEventListener('click', () => this.openEditor(property, input, edit, kind), { signal: this.rowAbort.signal }); name.append(edit);
    }
    const value = document.createElement('div'); value.className = 'property-value';
    const css = document.defaultView?.CSS;
    const suggestions = [...new Set(property.suggestions ?? metadata.keywords)];
    const combobox = new ValueCombobox(input, this.root, { property: property.name, suggestions, supports: candidate => !css?.supports || css.supports(property.name, candidate), onChoose: () => this.requestChange(property, input), onOpen: active => { if (this.activeCombobox !== active) this.activeCombobox?.close(); this.closeEditor(false); this.activeCombobox = active; } });
    this.comboboxes.push(combobox); value.append(input, combobox.button); row.append(name, value);
    this.addInfo(row, input, property);
    return row;
  }

  private addInfo(row: HTMLDivElement, input: HTMLInputElement, property: CssProperty): void {
    const document = this.root.ownerDocument;
    const info = document.createElement('span');
    info.className = 'property-info';
    const capability = property.capability === 'instant' ? 'Changement instantané' : 'Interpolation possible';
    info.textContent = property.diagnostic ? 'ⓘ' : property.capability ? '◇' : '';
    info.title = property.diagnostic ?? (property.capability ? capability : '');
    if (info.title) info.setAttribute('aria-label', info.title);
    row.append(info);
    if (!property.diagnostic) return;
    const diagnostic = document.createElement('p');
    diagnostic.id = `${input.id}-diagnostic`;
    diagnostic.className = 'property-diagnostic';
    diagnostic.textContent = property.diagnostic;
    input.setAttribute('aria-describedby', diagnostic.id);
    row.append(diagnostic);
  }

  private requestChange(property: CssProperty, input: HTMLInputElement): void {
    if (this.destroyed || property.disabled || input.value === property.value || this.requested.get(input) === input.value) return;
    this.requested.set(input, input.value);
    const change: PropertyChange = { property: property.name, oldValue: property.value, newValue: input.value };
    this.listeners.forEach((listener) => listener(change));
  }

  private filterRows(): void {
    if (this.destroyed) return;
    this.activeCombobox?.close();
    const query = this.search.value.trim().toLocaleLowerCase('fr');
    this.rows.querySelectorAll<HTMLElement>('[data-property-row]').forEach((row) => {
      const searchable = `${row.dataset.propertyRow ?? ''} ${row.querySelector('label')?.textContent ?? ''}`;
      row.hidden = !searchable.toLocaleLowerCase('fr').includes(query);
    });
  }

  private openEditor(property: CssProperty, input: HTMLInputElement, launcher: HTMLButtonElement, kind: CssEditorKind): void {
    if (this.destroyed || property.disabled) return;
    this.closeEditor(false); this.activeCombobox?.close();
    const control = createComplexEditor(this.root.ownerDocument, { property: property.name, value: property.value, kind,
      onApply: value => { this.closeEditor(false); if (this.destroyed || !input.isConnected) return; input.value = value; input.focus({ preventScroll: true }); this.requestChange(property, input); },
      onClose: () => this.closeEditor(true),
    });
    control.element.classList.add('property-complex-editor'); control.element.setAttribute('aria-modal', 'false');
    const abort = new AbortController(); this.activeEditor = { control, launcher, abort }; this.root.append(control.element);
    this.root.ownerDocument.addEventListener('pointerdown', event => {
      const NodeClass = this.root.ownerDocument.defaultView?.Node;
      if (NodeClass && event.target instanceof NodeClass && !control.element.contains(event.target) && !launcher.contains(event.target)) this.closeEditor(false);
    }, { signal: abort.signal });
    control.focus();
  }

  private closeEditor(restoreFocus: boolean): void {
    const active = this.activeEditor; this.activeEditor = null;
    if (!active) return;
    active.abort.abort(); active.control.destroy(); active.control.element.remove();
    if (restoreFocus && active.launcher.isConnected) active.launcher.focus({ preventScroll: true });
  }
}
