// packages/css-properties/src/value-combobox.ts
export interface ValueComboboxOptions {
  readonly property: string;
  readonly suggestions: readonly string[];
  readonly onChoose: (value: string) => void;
  readonly onOpen: (combobox: ValueCombobox) => void;
  readonly supports?: (value: string) => boolean;
}

let listCount = 0;

/** A value suggestion is an explicit whole-value choice, never a validation rule. */
export class ValueCombobox {
  public readonly button: HTMLButtonElement;
  private readonly abort = new AbortController();
  private popupAbort: AbortController | null = null;
  private popup: HTMLUListElement | null = null;
  private candidates: readonly string[] = [];
  private supported: readonly string[] | null = null;
  private active = -1;
  private destroyed = false;
  private readonly listId = `css-value-options-${++listCount}`;

  public constructor(private readonly input: HTMLInputElement, private readonly root: HTMLElement, private readonly options: ValueComboboxOptions) {
    const doc = input.ownerDocument;
    this.button = doc.createElement('button'); this.button.type = 'button'; this.button.className = 'property-values-toggle'; this.button.textContent = '▾';
    this.button.setAttribute('aria-label', `Afficher les valeurs de ${options.property}`);
    this.button.disabled = input.disabled || options.suggestions.length === 0;
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-haspopup', 'listbox'); input.setAttribute('aria-expanded', 'false');
    this.button.addEventListener('click', () => { if (this.popup) this.close(); else { this.show(true); input.focus({ preventScroll: true }); } }, { signal: this.abort.signal });
    input.addEventListener('input', () => this.show(false), { signal: this.abort.signal });
    input.addEventListener('keydown', event => this.key(event), { signal: this.abort.signal });
    input.addEventListener('blur', () => this.close(), { signal: this.abort.signal });
  }

  public close(): void {
    this.popupAbort?.abort(); this.popupAbort = null; this.popup?.remove(); this.popup = null;
    this.input.setAttribute('aria-expanded', 'false'); this.input.removeAttribute('aria-controls'); this.input.removeAttribute('aria-activedescendant'); this.active = -1;
  }

  public destroy(): void { this.destroyed = true; this.close(); this.abort.abort(); }

  private show(all: boolean): void {
    if (this.destroyed || this.input.disabled || !this.options.suggestions.length) return;
    const query = all ? '' : this.input.value.trim().toLocaleLowerCase('en');
    const suggestions = this.supported ??= this.options.supports ? this.options.suggestions.filter(this.options.supports) : this.options.suggestions;
    this.candidates = suggestions.filter(value => !query || value.toLocaleLowerCase('en').includes(query));
    if (!this.candidates.length) { this.close(); return; }
    if (!this.popup) {
      this.options.onOpen(this);
      const popup = this.input.ownerDocument.createElement('ul'); popup.className = 'property-suggestions'; popup.id = this.listId;
      popup.setAttribute('role', 'listbox'); popup.setAttribute('aria-label', `Valeurs de ${this.options.property}`); this.popup = popup; this.root.append(popup);
      this.popupAbort = new AbortController();
      popup.addEventListener('pointerdown', event => { if (event.target !== popup) event.preventDefault(); }, { signal: this.popupAbort.signal });
      this.input.ownerDocument.addEventListener('pointerdown', event => {
        const target = event.target;
        const NodeClass = this.input.ownerDocument.defaultView?.Node;
        if (NodeClass && target instanceof NodeClass && !popup.contains(target) && target !== this.input && !this.button.contains(target)) this.close();
      }, { signal: this.popupAbort.signal });
      this.input.ownerDocument.addEventListener('scroll', event => {
        if (event.target === popup) return;
        const rect = this.input.getBoundingClientRect(); const view = this.input.ownerDocument.defaultView;
        if (rect.bottom <= 0 || rect.top >= (view?.innerHeight ?? 600) || rect.right <= 0 || rect.left >= (view?.innerWidth ?? 800)) this.close();
        else this.position();
      }, { capture: true, signal: this.popupAbort.signal });
      this.input.ownerDocument.defaultView?.addEventListener('resize', () => this.close(), { signal: this.popupAbort.signal });
    }
    this.active = -1; this.popup.replaceChildren();
    this.candidates.forEach((value, index) => {
      const option = this.input.ownerDocument.createElement('li'); option.id = `${this.listId}-${index}`; option.setAttribute('role', 'option'); option.setAttribute('aria-selected', 'false'); option.textContent = value;
      const signal = this.popupAbort?.signal;
      option.addEventListener('click', () => this.choose(value), signal ? { signal } : {}); this.popup?.append(option);
    });
    this.input.setAttribute('aria-expanded', 'true'); this.input.setAttribute('aria-controls', this.listId); this.input.removeAttribute('aria-activedescendant'); this.position();
  }

  private position(): void {
    if (!this.popup) return;
    const rect = this.input.getBoundingClientRect(); const view = this.input.ownerDocument.defaultView;
    const viewportWidth = view?.innerWidth ?? 800; const viewportHeight = view?.innerHeight ?? 600;
    const width = Math.max(1, Math.min(Math.max(rect.width, 230), viewportWidth - 16));
    const below = viewportHeight - rect.bottom - 8; const above = rect.top - 8; const upwards = below < 160 && above > below;
    Object.assign(this.popup.style, { width: `${width}px`, left: `${Math.max(8, Math.min(rect.left, viewportWidth - width - 8))}px`, maxHeight: `${Math.max(64, Math.min(300, upwards ? above : below))}px` });
    if (upwards) { this.popup.style.bottom = `${Math.max(8, viewportHeight - rect.top)}px`; this.popup.style.top = 'auto'; }
    else { this.popup.style.top = `${Math.max(8, rect.bottom + 3)}px`; this.popup.style.bottom = 'auto'; }
  }

  private key(event: KeyboardEvent): void {
    if (this.destroyed || this.input.disabled) return;
    if (event.key === 'Escape') { this.close(); event.preventDefault(); event.stopPropagation(); return; }
    if (event.key === 'Tab') { this.close(); return; }
    if (event.key === 'Enter' && this.popup && this.active >= 0) {
      const value = this.candidates[this.active]; if (value !== undefined) this.choose(value); event.preventDefault(); event.stopPropagation(); return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if (!this.popup) this.show(this.input.value.trim() === '' || this.options.suggestions.includes(this.input.value));
    if (!this.popup) return;
    event.preventDefault(); event.stopPropagation();
    this.active = event.key === 'ArrowDown' ? (this.active + 1) % this.candidates.length : (this.active < 0 ? this.candidates.length - 1 : (this.active - 1 + this.candidates.length) % this.candidates.length);
    Array.from(this.popup.children).forEach((option, index) => option.setAttribute('aria-selected', String(index === this.active)));
    const option = this.popup.children[this.active]; if (option) { this.input.setAttribute('aria-activedescendant', option.id); option.scrollIntoView?.({ block: 'nearest' }); }
  }

  private choose(value: string): void {
    if (this.destroyed || this.input.disabled || !this.popup) return;
    this.input.value = value; this.close(); this.options.onChoose(value);
  }
}
