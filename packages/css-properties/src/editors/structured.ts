// packages/css-properties/src/editors/structured.ts
import { moveItem, readCssFunction, replaceAt, splitCssValue, writeCssFunction } from './css-value.js';
import { button, field, group, message } from './fields.js';
import type { EditorContext } from './fields.js';

/** A structural fallback for every balanced CSS value, including future syntax. */
export function renderStructured(context: EditorContext): void {
  const layers = splitCssValue(context.value, ','); context.parent.setAttribute('data-complex-components', '');
  if (!layers) { message(context, 'La syntaxe n’est pas équilibrée. Corrigez la valeur CSS ou choisissez explicitement un modèle.'); return; }
  let current = layers.length ? layers : [''];
  const updateLayer = (index: number, value: string, rebuild = false): void => { current = replaceAt(current, index, value); context.update(current.join(', '), rebuild); };
  for (const [layerIndex, layer] of current.entries()) {
    const layerUi = group(context, `Calque ${layerIndex + 1}`); let components = splitCssValue(layer, 'space') ?? [layer];
    const updateComponent = (index: number, value: string): void => { components = replaceAt(components, index, value); updateLayer(layerIndex, components.join(' ')); };
    for (const [index, value] of components.entries()) {
      const partUi = group(layerUi, `Composante ${index + 1}`); const fn = readCssFunction(value);
      if (fn) {
        let current = fn; field(partUi, `Fonction ${index + 1} du calque ${layerIndex + 1}`, fn.name, name => { current = { ...current, name }; updateComponent(index, writeCssFunction(current)); });
        for (const [argument, content] of current.args.entries()) field(partUi, `Argument ${argument + 1} de la composante ${index + 1}`, content, value => { current = { ...current, args: replaceAt(current.args, argument, value) }; updateComponent(index, writeCssFunction(current)); });
      } else field(partUi, `Composante ${index + 1} du calque ${layerIndex + 1}`, value, content => updateComponent(index, content));
      button(partUi, 'Supprimer la composante', () => updateLayer(layerIndex, components.filter((_, current) => current !== index).join(' '), true));
      button(partUi, 'Monter la composante', () => updateLayer(layerIndex, moveItem(components, index, -1).join(' '), true));
      button(partUi, 'Descendre la composante', () => updateLayer(layerIndex, moveItem(components, index, 1).join(' '), true));
    }
    button(layerUi, 'Ajouter une composante', () => updateLayer(layerIndex, [...components, '0'].join(' '), true));
    button(layerUi, 'Supprimer le calque', () => context.update(current.filter((_, index) => index !== layerIndex).join(', '), true));
    button(layerUi, 'Monter le calque', () => context.update(moveItem(current, layerIndex, -1).join(', '), true));
    button(layerUi, 'Descendre le calque', () => context.update(moveItem(current, layerIndex, 1).join(', '), true));
  }
  button(context, 'Ajouter un calque', () => context.update([...current, 'none'].join(', '), true));
}
