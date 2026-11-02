// packages/designer/src/conflict-ui.ts
import type { ConflictChoice, ConflictDiagnostic, ConflictSnapshot } from './conflict-types.js';
import './conflict-ui.less';

interface ConflictActions {
  open(id: string): void;
  apply(id: string, choiceId: string): void;
  cancel(): void;
}

let nextDialogId = 0;

function interval(diagnostic: ConflictDiagnostic): string {
  return `Images ${diagnostic.fromFrame} à ${diagnostic.toFrame}${diagnostic.toFrameExclusive ? ` (${diagnostic.toFrame} exclue)` : ' incluses'}`;
}

/** Presents adapter-owned diagnostics and a draft; it never edits project data. */
export class ConflictUi {
  public readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly dialog: HTMLDialogElement;
  private readonly details: HTMLElement;
  private readonly choices: HTMLSelectElement;
  private readonly consequence: HTMLElement;
  private readonly keys: HTMLElement;
  private readonly apply: HTMLButtonElement;
  private readonly abort = new AbortController();
  private rowsAbort = new AbortController();
  private snapshot: ConflictSnapshot | null = null;
  private opened: ConflictDiagnostic | null = null;
  private opener: HTMLElement | null = null;
  private openerId: string | null = null;

  public constructor(container: HTMLElement, private readonly actions: ConflictActions) {
    const document = container.ownerDocument;
    const dialogId = ++nextDialogId;
    this.root = document.createElement('section');
    this.root.className = 'designer-conflicts';
    this.root.setAttribute('aria-label', 'Conflits d’animation');
    this.root.tabIndex = -1;
    const heading = document.createElement('h3'); heading.textContent = 'Conflits d’animation';
    this.summary = document.createElement('p'); this.summary.className = 'designer-conflicts-summary';
    this.list = document.createElement('div'); this.list.className = 'designer-conflicts-list';
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'designer-conflicts-dialog';
    this.dialog.id = `designer-conflict-dialog-${dialogId}`;
    this.dialog.setAttribute('aria-label', 'Résoudre le conflit d’animation');
    this.dialog.setAttribute('aria-modal', 'true');
    const title = document.createElement('h3'); title.textContent = 'Résoudre le conflit d’animation';
    this.details = document.createElement('div'); this.details.className = 'designer-conflicts-details';
    const label = document.createElement('label'); label.textContent = 'Résolution';
    this.choices = document.createElement('select'); this.choices.setAttribute('aria-label', 'Résolution'); label.append(this.choices);
    this.consequence = document.createElement('p'); this.consequence.className = 'designer-conflicts-consequence';
    this.consequence.id = `designer-conflict-consequence-${dialogId}`;
    this.consequence.setAttribute('aria-live', 'polite');
    this.choices.setAttribute('aria-describedby', this.consequence.id);
    this.keys = document.createElement('ul'); this.keys.className = 'designer-conflicts-keys';
    const note = document.createElement('p'); note.className = 'designer-conflicts-note';
    note.textContent = 'Le choix confirmé sera conservé dans le projet. Vous pourrez l’annuler avec l’historique commun.';
    const buttons = document.createElement('div'); buttons.className = 'designer-conflicts-actions';
    this.apply = this.button('Appliquer la résolution', () => {
      const choice = this.selectedChoice();
      if (this.opened && choice) this.actions.apply(this.opened.id, choice.id);
    }, this.abort.signal);
    buttons.append(this.apply, this.button('Annuler', () => this.cancelDraft(), this.abort.signal));
    this.dialog.append(title, this.details, label, this.consequence, this.keys, note, buttons);
    this.root.append(heading, this.summary, this.list, this.dialog);
    container.prepend(this.root);
    this.root.hidden = true;
    this.choices.addEventListener('change', () => this.describeChoice(), { signal: this.abort.signal });
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.cancelDraft(); }, { signal: this.abort.signal });
    this.dialog.addEventListener('keydown', event => this.dialogKey(event), { signal: this.abort.signal });
  }

  private button(label: string, action: () => void, signal: AbortSignal): HTMLButtonElement {
    const button = this.root.ownerDocument.createElement('button'); button.type = 'button'; button.textContent = label;
    button.addEventListener('click', action, { signal });
    return button;
  }

  public render(snapshot: ConflictSnapshot | null): void {
    const focused = this.root.ownerDocument.activeElement;
    const focusedId = focused instanceof HTMLButtonElement && this.list.contains(focused) ? focused.dataset.conflictId : undefined;
    this.snapshot = snapshot;
    this.rowsAbort.abort(); this.rowsAbort = new AbortController(); this.list.replaceChildren();
    this.root.hidden = snapshot === null;
    if (!snapshot) { this.close(); return; }
    this.summary.textContent = snapshot.diagnostics.length ? `${snapshot.diagnostics.length} conflit(s) signalé(s)` : 'Aucun conflit à résoudre.';
    for (const diagnostic of snapshot.diagnostics) this.renderDiagnostic(diagnostic, snapshot);
    if (focusedId) this.actionFor(focusedId)?.focus();
  }

  private renderDiagnostic(diagnostic: ConflictDiagnostic, snapshot: ConflictSnapshot): void {
    const document = this.root.ownerDocument;
    const entry = document.createElement('article'); entry.className = 'designer-conflicts-entry';
    const heading = document.createElement('h4'); heading.textContent = diagnostic.property;
    const decision = snapshot.resolutions.find(resolution => resolution.conflictId === diagnostic.id);
    const status = document.createElement('span'); status.className = 'designer-conflicts-state';
    status.textContent = decision ? decision.signature === diagnostic.signature ? 'Résolution enregistrée' : 'Décision périmée' : diagnostic.blocking ? 'Résolution nécessaire' : 'À vérifier';
    entry.dataset.state = decision ? decision.signature === diagnostic.signature ? 'resolved' : 'stale' : 'unresolved';
    const message = document.createElement('p'); message.textContent = diagnostic.message;
    const targets = document.createElement('p'); targets.className = 'designer-conflicts-targets'; targets.textContent = `Objets : ${diagnostic.targets.join(' / ')}`;
    const affected = document.createElement('p'); affected.textContent = `Éléments concernés : ${diagnostic.affectedTargets.join(', ')}`;
    const period = document.createElement('p'); period.className = 'designer-conflicts-period'; period.textContent = interval(diagnostic);
    const resolve = this.button('Résoudre le conflit', () => this.actions.open(diagnostic.id), this.rowsAbort.signal);
    resolve.dataset.conflictId = diagnostic.id; resolve.disabled = diagnostic.choices.length === 0;
    resolve.setAttribute('aria-haspopup', 'dialog'); resolve.setAttribute('aria-controls', this.dialog.id);
    entry.append(heading, status, message, targets, affected, period, resolve);
    if (decision?.signature === diagnostic.signature) {
      const savedChoice = diagnostic.choices.find(choice => choice.id === decision.choiceId && choice.winnerObjectId === decision.winnerObjectId);
      const saved = document.createElement('p'); saved.textContent = `Choix conservé : ${savedChoice?.label ?? decision.winnerObjectId}`; entry.append(saved);
    }
    if (!diagnostic.choices.length) {
      const unavailable = document.createElement('p'); unavailable.textContent = 'Aucune résolution n’est disponible dans ce contexte. Actualisez les données ou adaptez les pistes concernées.'; entry.append(unavailable);
    }
    this.list.append(entry);
  }

  public open(id: string, preferredObjectId: string | null): void {
    const diagnostic = this.snapshot?.diagnostics.find(candidate => candidate.id === id);
    if (!diagnostic || !diagnostic.choices.length) return;
    this.close();
    const document = this.root.ownerDocument;
    this.opener = this.actionFor(id) ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    this.openerId = id; this.opened = diagnostic;
    this.dialog.setAttribute('role', 'dialog');
    const message = document.createElement('p'); message.textContent = diagnostic.message;
    const property = document.createElement('p'); property.className = 'designer-conflicts-targets'; property.textContent = `${diagnostic.property} · ${diagnostic.targets.join(' / ')}`;
    const affected = document.createElement('p'); affected.textContent = `Éléments concernés : ${diagnostic.affectedTargets.join(', ')}`;
    const period = document.createElement('p'); period.className = 'designer-conflicts-period'; period.textContent = interval(diagnostic);
    this.details.replaceChildren(message, property, affected, period);
    this.choices.replaceChildren();
    const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Choisir une résolution…'; this.choices.append(placeholder);
    for (const choice of diagnostic.choices) {
      const option = document.createElement('option'); option.value = choice.id; option.textContent = choice.label; this.choices.append(option);
    }
    const saved = this.snapshot?.resolutions.find(resolution => resolution.conflictId === id && resolution.signature === diagnostic.signature);
    this.choices.value = diagnostic.choices.find(choice => saved ? choice.id === saved.choiceId : choice.winnerObjectId === preferredObjectId)?.id ?? '';
    this.describeChoice();
    if (typeof this.dialog.showModal === 'function') this.dialog.showModal();
    else this.dialog.setAttribute('open', '');
    this.choices.focus();
  }

  private selectedChoice(): ConflictChoice | undefined { return this.opened?.choices.find(choice => choice.id === this.choices.value); }

  private describeChoice(): void {
    const choice = this.selectedChoice();
    this.apply.disabled = !choice;
    this.consequence.textContent = choice?.description ?? 'Choisissez une résolution pour examiner son effet avant de confirmer.';
    this.keys.replaceChildren();
    this.keys.hidden = !choice?.createsKeys.length;
    if (!choice) return;
    for (const key of choice.createsKeys) {
      const item = this.root.ownerDocument.createElement('li');
      item.textContent = `Clé annoncée · ${key.selector} · ${key.property} = ${key.value} · image ${key.frame}`;
      this.keys.append(item);
    }
  }

  private dialogKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.cancelDraft(); return; }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(this.dialog.querySelectorAll<HTMLElement>('select:not(:disabled), button:not(:disabled)'));
    const first = focusable[0]; const last = focusable.at(-1);
    if (event.shiftKey && this.root.ownerDocument.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && this.root.ownerDocument.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  private cancelDraft(): void { this.close(); this.actions.cancel(); }

  private actionFor(id: string | null): HTMLButtonElement | undefined {
    return Array.from(this.list.querySelectorAll<HTMLButtonElement>('button[data-conflict-id]')).find(button => button.dataset.conflictId === id);
  }

  public close(): void {
    if (!this.opened) return;
    this.opened = null;
    if (typeof this.dialog.close === 'function') this.dialog.close();
    else this.dialog.removeAttribute('open');
    this.dialog.removeAttribute('role');
    const replacement = this.actionFor(this.openerId);
    const focus = this.opener?.isConnected ? this.opener : replacement ?? this.root;
    focus.focus(); this.opener = null; this.openerId = null;
  }

  public destroy(): void { this.close(); this.rowsAbort.abort(); this.abort.abort(); this.root.remove(); }
}
