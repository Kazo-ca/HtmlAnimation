// packages/designer/src/inspector-ui.ts
import type { DocumentChange } from './events.js';

interface InspectorActions {
  chooseTarget(selector: string): void;
  cancelTarget(): void;
  changeAttribute(attribute: 'id' | 'class', value: string): void;
}
export class InspectorUi {
  public readonly root: HTMLElement;
  public readonly panelContainer: HTMLElement;
  private readonly selection: HTMLElement;
  private readonly status: HTMLElement;
  private readonly target: HTMLFieldSetElement;
  private readonly targetSelect: HTMLSelectElement;
  private readonly targetInput: HTMLInputElement;
  private readonly count: HTMLElement;
  private readonly attributes: HTMLFieldSetElement;
  private readonly journal: HTMLElement;
  private readonly abort = new AbortController();
  public constructor(container: HTMLElement, actions: InspectorActions) {
    const doc = container.ownerDocument;
    this.root = doc.createElement('div'); this.root.className = 'HtmlDesigner';
    const context = doc.createElement('div'); context.className = 'designer-context';
    this.selection = doc.createElement('strong'); this.selection.className = 'designer-selection';
    this.status = doc.createElement('output'); this.status.className = 'designer-status'; this.status.setAttribute('aria-live', 'polite');
    this.target = doc.createElement('fieldset');
    const legend = doc.createElement('legend'); legend.textContent = 'Choisir la cible pour enregistrer';
    this.targetSelect = doc.createElement('select'); this.targetSelect.setAttribute('aria-label', 'Cibles existantes');
    this.targetInput = doc.createElement('input'); this.targetInput.setAttribute('aria-label', 'Sélecteur cible'); this.targetInput.placeholder = '#identifiant ou .classe';
    this.count = doc.createElement('output');
    const save = this.button('Enregistrer', () => actions.chooseTarget(this.targetInput.value));
    const cancel = this.button('Annuler le choix', () => actions.cancelTarget());
    this.targetSelect.addEventListener('change', () => { this.targetInput.value = this.targetSelect.value; this.targetInput.dispatchEvent(new Event('input')); }, { signal: this.abort.signal });
    this.target.append(legend, this.targetSelect, this.targetInput, this.count, save, cancel); this.target.hidden = true;
    this.attributes = doc.createElement('fieldset');
    const title = doc.createElement('legend'); title.textContent = 'Attributs du document'; this.attributes.append(title);
    for (const attribute of ['id', 'class'] as const) {
      const label = doc.createElement('label'); label.textContent = attribute === 'id' ? 'Nouvel identifiant' : 'Classes du document';
      const input = doc.createElement('input'); input.setAttribute('aria-label', label.textContent); input.dataset.attribute = attribute;
      label.append(input); this.attributes.append(label, this.button(attribute === 'id' ? 'Appliquer l’ID' : 'Appliquer les classes', () => actions.changeAttribute(attribute, input.value)));
    }
    this.attributes.hidden = true;
    context.append(this.selection, this.status, this.target, this.attributes);
    this.panelContainer = doc.createElement('div');
    this.journal = doc.createElement('section'); this.journal.className = 'designer-changes'; this.journal.setAttribute('aria-label', 'Modifications du document original');
    this.root.append(context, this.panelContainer, this.journal); container.append(this.root);
  }
  private button(text: string, action: () => void): HTMLButtonElement {
    const button = this.root.ownerDocument.createElement('button'); button.type = 'button'; button.textContent = text;
    button.addEventListener('click', action, { signal: this.abort.signal }); return button;
  }
  public setSelection(label: string, element: HTMLElement | undefined): void {
    this.selection.textContent = label; this.attributes.hidden = !element;
    for (const input of this.attributes.querySelectorAll<HTMLInputElement>('input')) input.value = element?.getAttribute(input.dataset.attribute ?? '') ?? '';
  }
  public setStatus(message: string): void { this.status.textContent = message; }
  public showTargets(choices: readonly string[], count: (selector: string) => number): void {
    const doc = this.root.ownerDocument;
    this.targetSelect.replaceChildren();
    for (const value of ['', ...choices]) {
      const option = doc.createElement('option'); option.value = value; option.textContent = value || 'Choisir un ID ou une classe…'; this.targetSelect.append(option);
    }
    this.targetInput.value = ''; this.count.textContent = 'Aucun objet ne sera créé avant l’enregistrement.';
    this.targetInput.oninput = () => {
      const total = count(this.targetInput.value);
      this.count.textContent = total > 1 ? `Attention : ${total} éléments seront ciblés.` : `${total} élément ciblé.`;
    };
    this.target.hidden = false; this.targetSelect.focus();
  }
  public hideTargets(): void { this.target.hidden = true; }
  public setChanges(changes: readonly DocumentChange[]): void {
    const doc = this.root.ownerDocument; const title = doc.createElement('strong');
    title.textContent = changes.length ? `Document original modifié · ${changes.length}` : 'Document original inchangé';
    const list = doc.createElement('ol');
    for (const change of changes) {
      const item = doc.createElement('li'); item.textContent = `${change.fullXPath} · ${change.attribute} : ${change.oldValue ?? '(absent)'} → ${change.newValue ?? '(absent)'}`; list.append(item);
    }
    this.journal.replaceChildren(title, list);
  }
  public destroy(): void { this.abort.abort(); this.root.remove(); }
}
