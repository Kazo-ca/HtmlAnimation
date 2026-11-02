// packages/designer/src/dom-preview.ts
import { DomOrigin } from './dom-origin.js';
import type { DomPreviewSnapshot } from './dom-origin.js';
import { capturePreviewScroll } from './preview-scroll.js';
import type { PreparedEffect } from './timeline-adapter.js';

/** CSS declarations have already been resolved by the host; element identity is retained. */
export interface ElementProjection {
  readonly element: HTMLElement;
  readonly declarations: Readonly<Record<string, string>>;
}
interface PreviewState {
  readonly committed: readonly ElementProjection[];
  readonly draft: readonly ElementProjection[] | null;
}
const origins = new WeakMap<DomPreviewOwner, DomOrigin>();
const scenes = new WeakMap<DomPreviewOwner, HTMLElement>();

function clone(projection: readonly ElementProjection[]): readonly ElementProjection[] {
  return projection.map(entry => ({ element: entry.element, declarations: { ...entry.declarations } }));
}
function same(left: readonly ElementProjection[], right: readonly ElementProjection[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry.element === right[index]?.element && JSON.stringify(Object.entries(entry.declarations)) === JSON.stringify(Object.entries(right[index]?.declarations ?? {})));
}

/** One temporary CSS writer, constructed before the Editor and shared with the Designer. */
export class DomPreviewOwner {
  private readonly origin: DomOrigin;
  private readonly scrollRoots: readonly HTMLElement[];
  private committed: readonly ElementProjection[] = [];
  private draft: readonly ElementProjection[] | null = null;
  private sourceDepth = 0;

  public constructor(private readonly scene: HTMLElement) {
    this.origin = new DomOrigin(scene);
    this.scrollRoots = [scene, ...scene.querySelectorAll<HTMLElement>('*')];
    origins.set(this, this.origin);
    scenes.set(this, scene);
  }
  public getProjection(): readonly ElementProjection[] { return clone(this.draft ?? this.committed); }
  public getCommittedProjection(): readonly ElementProjection[] { return clone(this.committed); }

  /** Pure preparation; a committed render invalidates a previous local draft when applied. */
  public prepare(projection: readonly ElementProjection[]): PreparedEffect {
    return this.prepareState({ committed: this.validate(projection), draft: null });
  }
  /** Drafts never acquire history; null resumes the existing committed projection. */
  public prepareDraft(projection: readonly ElementProjection[] | null): PreparedEffect {
    return this.prepareState({ committed: clone(this.committed), draft: projection === null ? null : this.validate(projection) });
  }
  public prepareRestore(): PreparedEffect { return this.prepareState({ committed: [], draft: null }); }

  /** Synchronous read-only inspection of source styles, with exact preview reinstatement. */
  public withSource<T>(read: () => T): T {
    const capture = this.origin.capturePreview();
    const restoreScroll = capturePreviewScroll(this.scrollRoots);
    this.sourceDepth++;
    try { this.origin.restore(); return read(); }
    finally {
      try { this.origin.restorePreview(capture); }
      finally { this.sourceDepth--; restoreScroll(); }
    }
  }
  private validate(projection: readonly ElementProjection[]): readonly ElementProjection[] {
    const seen = new Set<HTMLElement>();
    for (const { element, declarations } of projection) {
      if (!this.origin.has(element) || !this.scene.contains(element)) throw new Error('La cible de l’aperçu ne fait plus partie du document capturé.');
      if (seen.has(element)) throw new Error('Chaque élément doit recevoir une seule projection CSS déjà résolue.');
      if (Object.values(declarations).some(value => typeof value !== 'string')) throw new Error('Les valeurs de l’aperçu doivent être des déclarations CSS résolues.');
      seen.add(element);
    }
    return clone(projection);
  }
  private prepareState(next: PreviewState): PreparedEffect {
    if (this.sourceDepth) throw new Error('La lecture des sources doit se terminer avant de préparer un nouvel aperçu.');
    const before: PreviewState = { committed: clone(this.committed), draft: this.draft === null ? null : clone(this.draft) };
    const active = next.draft ?? next.committed;
    const capture = this.origin.capturePreview(active.map(entry => entry.element));
    const restoreScroll = capturePreviewScroll(this.scrollRoots);
    const changed = !same(before.committed, next.committed) || (before.draft === null) !== (next.draft === null) || !same(before.draft ?? [], next.draft ?? []) || (active.length === 0 && capture.previews.size > 0);
    return {
      changed,
      apply: () => {
        if (this.sourceDepth) throw new Error('Un aperçu ne peut pas être appliqué pendant une lecture des sources.');
        try {
          this.origin.restore();
          for (const { element, declarations } of active) for (const [property, value] of Object.entries(declarations)) this.origin.applyPreview(element, property, value);
          this.committed = clone(next.committed); this.draft = next.draft === null ? null : clone(next.draft);
        } finally { restoreScroll(); }
      },
      rollback: () => {
        try { this.restore(capture, before); }
        finally { restoreScroll(); }
      },
    };
  }
  private restore(capture: DomPreviewSnapshot, state: PreviewState): void {
    this.origin.restorePreview(capture);
    this.committed = clone(state.committed); this.draft = state.draft === null ? null : clone(state.draft);
  }
}

/** Package-internal bridge for the Designer's captured CSS/XPath reads; never root-exported. */
export function getDomPreviewOrigin(owner: DomPreviewOwner): DomOrigin {
  const origin = origins.get(owner);
  if (!origin) throw new Error('Le propriétaire de l’aperçu est introuvable.');
  return origin;
}
/** Package-internal identity guard; an owner of an ancestor is not interchangeable. */
export function getDomPreviewScene(owner: DomPreviewOwner): HTMLElement {
  const scene = scenes.get(owner);
  if (!scene) throw new Error('Le propriétaire de l’aperçu est introuvable.');
  return scene;
}
