// tests/gradient-editor.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GradientEditor } from '../packages/css-properties/src/gradient-editor.js';
import type { GradientDefinition } from '../packages/css-properties/src/gradient-types.js';

const controls: GradientEditor[] = [];
afterEach(() => { for (const control of controls.splice(0)) control.destroy(); document.body.replaceChildren(); });

function definition(): GradientDefinition {
  return { id: 'main', cssName: 'background-image', type: 'linear', angle: 90, centerX: 50, centerY: 50, radiusX: 50, radiusY: 50, stops: [
    { id: 'first', color: { kind: 'color', r: 1, g: 0, b: 0, a: 1 }, opacity: 1, position: 0, present: true },
    { id: 'middle', color: { kind: 'color', r: 0, g: 1, b: 0, a: 1 }, opacity: 0.4, position: 50, present: true },
    { id: 'last', color: { kind: 'color', r: 0, g: 0, b: 1, a: 1 }, opacity: 1, position: 100, present: true },
  ] };
}
function setup(): { control: GradientEditor; container: HTMLElement; change: ReturnType<typeof vi.fn>; preview: ReturnType<typeof vi.fn>; selection: ReturnType<typeof vi.fn> } {
  const container = document.createElement('section'); document.body.append(container);
  const change = vi.fn(); const preview = vi.fn(); const selection = vi.fn();
  const control = new GradientEditor(container, { onChange: change, onPreview: preview, onSelectionChange: selection }); controls.push(control);
  control.setGradients([definition()]); return { control, container, change, preview, selection };
}
function field(container: ParentNode, label: string): HTMLInputElement | HTMLSelectElement {
  const value = [...container.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select')].find(element => element.getAttribute('aria-label') === label);
  if (!value) throw new Error(`Missing field ${label}`); return value;
}
function action(container: ParentNode, label: string): HTMLButtonElement {
  const value = [...container.querySelectorAll('button')].find(element => element.textContent === label);
  if (!value) throw new Error(`Missing action ${label}`); return value;
}

describe('autonomous controlled gradient editor', () => {
  it('moves the selected bar marker during a range draft and restores it on pointer cancellation', () => {
    const { control, container, change } = setup(); control.setSelection('main', 'middle');
    const range = field(container, 'Déplacer le point dans la barre');
    const marker = container.querySelector<HTMLButtonElement>('[data-gradient-stop="middle"]'); if (!marker) throw new Error('Missing marker');
    range.value = '75'; range.dispatchEvent(new Event('input'));
    expect(marker.style.left).toBe('75%'); expect(marker.getAttribute('aria-label')).toContain('75 %');
    range.dispatchEvent(new Event('pointercancel'));
    expect(marker.style.left).toBe('50%'); expect(marker.getAttribute('aria-label')).toContain('50 %');
    expect(change).not.toHaveBeenCalled();
  });
  it('disables only structural addition when the host lacks its atomic capability', () => {
    const { control, container, change } = setup();
    control.setGradients([definition()], { addDisabled: true, addDiagnostic: 'Ajout structurel atomique indisponible.' });
    expect(action(container, 'Ajouter un point').disabled).toBe(true);
    expect(container.textContent).toContain('Ajout structurel atomique indisponible.');
    expect(field(container, 'Angle du dégradé').disabled).toBe(false);
    action(container, 'Ajouter un point').click(); expect(change).not.toHaveBeenCalled();
  });
  it('refreshes and selects silently while a user point selection remains view state', () => {
    const { control, container, change, selection } = setup();
    control.setSelection('main', 'middle'); expect(control.getSelection()).toEqual({ gradientId: 'main', stopId: 'middle' });
    expect(change).not.toHaveBeenCalled(); expect(selection).not.toHaveBeenCalled();
    container.querySelector<HTMLButtonElement>('[data-stop-id="last"]')?.click();
    expect(control.getSelection()).toEqual({ gradientId: 'main', stopId: 'last' }); expect(selection).toHaveBeenCalledOnce(); expect(change).not.toHaveBeenCalled();
  });

  it('emits one independent component request and leaves host values unchanged until accepted', () => {
    const { control, container, change } = setup(); control.setSelection('main', 'middle');
    const opacity = field(container, 'Opacité du point'); opacity.value = '0.7'; opacity.dispatchEvent(new Event('change'));
    expect(change).toHaveBeenCalledExactlyOnceWith({ kind: 'edit', changes: [{ gradientId: 'main', stopId: 'middle', component: 'opacity', value: 0.7 }] });
    control.setGradients([definition()]); expect(field(container, 'Opacité du point').value).toBe('0.4');
  });

  it('preserves focused field and stable point selection on accepted host refresh', () => {
    const { control, container, change } = setup(); control.setSelection('main', 'middle');
    field(container, 'Position du point').focus();
    control.setGradients([{ ...definition(), stops: definition().stops.map(stop => stop.id === 'middle' ? { ...stop, position: 60 } : stop) }]);
    expect(control.getSelection().stopId).toBe('middle'); expect(document.activeElement?.getAttribute('aria-label')).toBe('Position du point'); expect(field(container, 'Position du point').value).toBe('60'); expect(change).not.toHaveBeenCalled();
  });

  it('exposes alpha separately from an opaque color edit', () => {
    const { control, container, change } = setup(); control.setSelection('main', 'middle');
    const color = field(container, 'Couleur du point'); color.value = '#336699'; color.dispatchEvent(new Event('change'));
    expect(change).toHaveBeenLastCalledWith({ kind: 'edit', changes: [{ gradientId: 'main', stopId: 'middle', component: 'color', value: { kind: 'color', r: 0.2, g: 0.4, b: 0.6, a: 1 } }] });
    expect(field(container, 'Opacité du point').value).toBe('0.4');
  });

  it('requires explicit confirmation of an added point and never allocates an identity', () => {
    const { container, change } = setup(); action(container, 'Ajouter un point').click(); expect(change).not.toHaveBeenCalled();
    const position = field(container, 'Position du nouveau point'); position.value = '35';
    const color = field(container, 'Couleur du nouveau point'); color.value = '#ff8000';
    const opacity = field(container, 'Opacité du nouveau point'); opacity.value = '0.5';
    action(container, 'Ajouter ce point').click();
    expect(change).toHaveBeenCalledExactlyOnceWith({ kind: 'add-stop', gradientId: 'main', position: 35, color: { kind: 'color', r: 1, g: 128 / 255, b: 0, a: 1 }, opacity: 0.5 });
  });

  it('cancels an add-point draft without a change and removes only through presence intent', () => {
    const { control, container, change } = setup(); action(container, 'Ajouter un point').click(); action(container, 'Annuler l’ajout').click(); expect(change).not.toHaveBeenCalled();
    control.setSelection('main', 'middle'); action(container, 'Supprimer le point').click();
    expect(change).toHaveBeenCalledExactlyOnceWith({ kind: 'edit', changes: [{ gradientId: 'main', stopId: 'middle', component: 'present', value: false }] });
  });

  it('retains absent point selection and supports explicit restoration without renumbering', () => {
    const { control, container, change } = setup();
    control.setGradients([{ ...definition(), stops: definition().stops.map(stop => stop.id === 'middle' ? { ...stop, present: false } : stop) }]); control.setSelection('main', 'middle');
    action(container, 'Rétablir le point').click();
    expect(change).toHaveBeenCalledExactlyOnceWith({ kind: 'edit', changes: [{ gradientId: 'main', stopId: 'middle', component: 'present', value: true }] });
    control.setSelection('main', 'first'); expect(action(container, 'Supprimer le point').disabled).toBe(true);
  });

  it('previews a range draft and Escape discards it without accepting a component', () => {
    const { control, container, change, preview } = setup(); control.setSelection('main', 'middle');
    const range = field(container, 'Déplacer le point dans la barre'); range.value = '75'; range.dispatchEvent(new Event('input', { bubbles: true }));
    expect(preview).toHaveBeenCalledWith([{ gradientId: 'main', stopId: 'middle', component: 'position', value: 75 }]); expect(change).not.toHaveBeenCalled();
    range.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(preview).toHaveBeenLastCalledWith(null); expect(change).not.toHaveBeenCalled(); expect(field(container, 'Position du point').value).toBe('50');
  });

  it('commits one range draft and aborts obsolete field handlers after refresh', () => {
    const { control, container, change, preview } = setup(); control.setSelection('main', 'middle');
    const range = field(container, 'Déplacer le point dans la barre'); range.value = '75'; range.dispatchEvent(new Event('input')); range.dispatchEvent(new Event('change'));
    expect(change).toHaveBeenCalledExactlyOnceWith({ kind: 'edit', changes: [{ gradientId: 'main', stopId: 'middle', component: 'position', value: 75 }] }); expect(preview).toHaveBeenLastCalledWith(null);
    const obsolete = field(container, 'Position du point'); control.setGradients([definition()]);
    obsolete.value = '90'; obsolete.dispatchEvent(new Event('change')); expect(change).toHaveBeenCalledOnce();
  });

  it('commits a range while its preview ticket is current, then cleans up after synchronous acceptance', () => {
    const container = document.createElement('div'); document.body.append(container); const calls: string[] = [];
    const control = new GradientEditor(container, { onPreview: edits => { calls.push(edits ? 'preview' : 'cleanup'); }, onChange: () => {
      calls.push('commit'); expect(calls).toEqual(['preview', 'commit']);
      control.setGradients([{ ...definition(), stops: definition().stops.map(stop => stop.id === 'middle' ? { ...stop, position: 75 } : stop) }]);
    } }); controls.push(control); control.setGradients([definition()]); control.setSelection('main', 'middle');
    const range = field(container, 'Déplacer le point dans la barre'); range.value = '75'; range.dispatchEvent(new Event('input')); range.dispatchEvent(new Event('change')); range.dispatchEvent(new Event('change'));
    expect(calls).toEqual(['preview', 'commit', 'cleanup']); expect(field(container, 'Position du point').value).toBe('75');
  });

  it('restores a pointer-cancelled range and notifies cleanup when destroyed during preview', () => {
    const { control, container, change, preview } = setup(); control.setSelection('main', 'middle');
    const range = field(container, 'Déplacer le point dans la barre'); range.value = '75'; range.dispatchEvent(new Event('input'));
    range.dispatchEvent(new Event('pointercancel')); expect(field(container, 'Position du point').value).toBe('50'); expect(preview).toHaveBeenLastCalledWith(null); expect(change).not.toHaveBeenCalled();
    range.value = '60'; range.dispatchEvent(new Event('input')); control.destroy(); expect(preview).toHaveBeenLastCalledWith(null); expect(change).not.toHaveBeenCalled();
  });

  it('does not accept empty numeric values and resets an uncommitted field on Escape', () => {
    const { container, change, control } = setup(); control.setSelection('main', 'middle');
    const opacity = field(container, 'Opacité du point'); opacity.value = ''; opacity.dispatchEvent(new Event('change')); expect(change).not.toHaveBeenCalled(); expect(opacity.value).toBe('0.4');
    opacity.value = '0.9'; opacity.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); expect(field(container, 'Opacité du point').value).toBe('0.4'); expect(change).not.toHaveBeenCalled();
  });

  it('supports keyboard point movement without changing selection or accepting unsupported keys', () => {
    const { container, control, change } = setup(); control.setSelection('main', 'middle');
    const point = container.querySelector<HTMLButtonElement>('[data-gradient-stop="middle"]'); if (!point) throw new Error('Missing point');
    point.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); expect(change).toHaveBeenLastCalledWith({ kind: 'edit', changes: [{ gradientId: 'main', stopId: 'middle', component: 'position', value: 49 }] });
    point.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true })); expect(change).toHaveBeenLastCalledWith({ kind: 'edit', changes: [{ gradientId: 'main', stopId: 'middle', component: 'position', value: 60 }] });
    point.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); expect(change).toHaveBeenCalledTimes(2); expect(control.getSelection().stopId).toBe('middle');
  });

  it('exposes the independent radial geometry only after a silent host type refresh', () => {
    const { control, container, change } = setup(); const type = field(container, 'Type de dégradé'); type.value = 'radial'; type.dispatchEvent(new Event('change'));
    expect(change).toHaveBeenLastCalledWith({ kind: 'edit', changes: [{ gradientId: 'main', component: 'type', value: 'radial' }] });
    control.setGradients([{ ...definition(), type: 'radial' }]); const x = field(container, 'Centre X du dégradé'); x.value = '30'; x.dispatchEvent(new Event('change'));
    expect(change).toHaveBeenLastCalledWith({ kind: 'edit', changes: [{ gradientId: 'main', component: 'centerX', value: 30 }] });
    const radius = field(container, 'Rayon vertical du dégradé'); radius.value = '70'; radius.dispatchEvent(new Event('change'));
    expect(change).toHaveBeenLastCalledWith({ kind: 'edit', changes: [{ gradientId: 'main', component: 'radiusY', value: 70 }] });
  });

  it('disables incompatible state and destroys listeners without touching neighboring content', () => {
    const { control, container, change } = setup(); const neighbor = document.createElement('p'); neighbor.textContent = 'Hôte'; container.append(neighbor);
    control.setGradients([definition()], { disabled: true, diagnostic: 'Dégradés sources différents.' });
    const angle = field(container, 'Angle du dégradé'); expect(angle.disabled).toBe(true); angle.value = '30'; angle.dispatchEvent(new Event('change')); expect(change).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Dégradés sources différents.'); control.destroy(); expect(container.textContent).toBe('Hôte');
  });

  it('shows empty and invalid host state without injecting markup', () => {
    const { control, container, change } = setup(); control.setGradients([]); expect(container.textContent).toContain('Aucun dégradé structuré');
    const unsafe = { ...definition(), id: '<img src=x onerror=alert(1)>' }; control.setGradients([unsafe]);
    expect(container.querySelector('img')).toBeNull(); expect(change).not.toHaveBeenCalled();
  });
});
