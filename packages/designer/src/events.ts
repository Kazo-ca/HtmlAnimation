// packages/designer/src/events.ts
export interface DocumentChange {
  readonly fullXPath: string;
  readonly attribute: 'id' | 'class';
  readonly oldValue: string | null;
  readonly newValue: string | null;
}
export interface DesignerEvents {
  selectionchange: { readonly elements: readonly HTMLElement[]; readonly objectId: string | null };
  propertychange: { readonly property: string; readonly oldValue: string; readonly newValue: string; readonly frame: number };
  documentchange: { readonly changes: readonly DocumentChange[]; readonly direction: 'execute' | 'undo' | 'redo' };
  diagnostic: { readonly message: string };
}
export class DesignerEmitter {
  private readonly listeners = new Map<keyof DesignerEvents, Set<(event: never) => void>>();
  public on<K extends keyof DesignerEvents>(type: K, listener: (event: DesignerEvents[K]) => void): () => void {
    const group = this.listeners.get(type) ?? new Set<(event: never) => void>();
    group.add(listener); this.listeners.set(type, group);
    return () => { group.delete(listener); };
  }
  public emit<K extends keyof DesignerEvents>(type: K, event: DesignerEvents[K]): void {
    for (const listener of this.listeners.get(type) ?? []) {
      try { listener(event as never); }
      catch {
        if (type !== 'diagnostic') this.emit('diagnostic', { message: 'Un observateur de l’hôte n’a pas pu traiter un événement. La commande reste annulable.' });
      }
    }
  }
  public clear(): void { this.listeners.clear(); }
}
