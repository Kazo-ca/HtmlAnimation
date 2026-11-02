// packages/css-properties/src/complex-editors.ts
import type { CssEditorKind } from './catalog.js';
import { getCssPropertyMetadata } from './catalog.js';
import { renderBackground } from './editors/background.js';
import { renderBorder, renderBox, renderDimension, renderRadius } from './editors/basic.js';
import { colorFields } from './editors/color.js';
import type { EditorContext } from './editors/fields.js';
import { message } from './editors/fields.js';
import { renderFont } from './editors/font.js';
import { renderFunctions } from './editors/functions.js';
import { renderGradients } from './editors/gradients.js';
import { renderShadows } from './editors/shadows.js';
import { renderStructured } from './editors/structured.js';

export interface ComplexEditorOptions {
  readonly property: string; readonly value: string; readonly kind: CssEditorKind;
  readonly disabled?: boolean; readonly onApply: (value: string) => void; readonly onClose: () => void;
}
export interface ComplexEditor { readonly element: HTMLElement; readonly focus: () => void; readonly destroy: () => void }
const TEMPLATES: Readonly<Partial<Record<CssEditorKind, readonly string[]>>> = {
  color: ['rgba(23, 107, 106, 1)'], number: ['1'], dimension: ['10px'], box: ['0px 0px 0px 0px'], border: ['1px solid #176b6a'], radius: ['8px / 8px'],
  shadow: ['0px 2px 8px 0px rgba(0, 0, 0, 0.25)'], gradient: ['linear-gradient(90deg, #ffffff 0%, #176b6a 100%)', 'radial-gradient(circle at center, #ffffff 0%, #176b6a 100%)', 'conic-gradient(from 0deg at center, #ffffff 0deg, #176b6a 360deg)'],
  transform: ['translate(0px, 0px) rotate(0deg) scale(1, 1)'], font: ['normal 400 16px/1.5 sans-serif'], background: ['none center / cover no-repeat scroll transparent'], list: ['initial'], structured: ['initial'],
};
function templatesFor(options: ComplexEditorOptions): readonly string[] {
  const property = options.property.replace(/^-(?:webkit|moz|ms|o)-/, '');
  const overrides: Readonly<Record<string, readonly string[]>> = {
    'font-family': ['"Arial", sans-serif', 'serif', 'system-ui'], 'text-shadow': ['0px 2px 8px rgba(0, 0, 0, 0.25)'],
    filter: ['blur(0px) brightness(1)'], 'backdrop-filter': ['blur(0px) brightness(1)'], rotate: ['0deg'], rotation: ['0deg'], translate: ['0px 0px'], scale: ['1 1'],
    'background-position': ['center center'], 'background-position-x': ['50%'], 'background-position-y': ['50%'], 'background-size': ['cover'], 'background-repeat': ['no-repeat'], 'background-attachment': ['scroll'], 'background-origin': ['padding-box'], 'background-clip': ['border-box'], 'background-blend-mode': ['normal'],
    'transform-origin': ['50% 50% 0px'], 'perspective-origin': ['50% 50%'], 'place-items': ['center stretch'], 'place-content': ['center stretch'], 'place-self': ['center stretch'], mask: ['none center / contain no-repeat'],
  };
  if (Object.hasOwn(overrides, property)) return overrides[property] ?? ['initial'];
  if (options.kind === 'radius' && property !== 'border-radius' && property !== 'radius') return ['8px 8px'];
  if (options.kind === 'box') {
    if (/^border-.*style$/.test(property)) return ['solid']; if (/^border-.*color$/.test(property)) return ['#176b6a']; if (/^border-.*width$/.test(property)) return ['1px'];
    if (['gap', 'border-spacing'].includes(property) || /-(?:block|inline)$/.test(property)) return ['0px 0px'];
  }
  if (options.kind === 'dimension') {
    const types = getCssPropertyMetadata(property).types;
    if (types.includes('angle')) return ['45deg']; if (types.includes('time')) return ['0.2s']; if (types.includes('resolution')) return ['96dpi']; if (types.includes('flex')) return ['1fr'];
    if (types.includes('percentage') && !types.includes('length')) return ['50%'];
  }
  if (options.kind === 'background' && property !== 'background') return ['initial'];
  return TEMPLATES[options.kind] ?? ['initial'];
}
function specialized(context: EditorContext, kind: CssEditorKind): boolean {
  switch (kind) {
    case 'color': return colorFields(context, context.value, context.update);
    case 'number': return renderDimension(context, false);
    case 'dimension': return renderDimension(context);
    case 'box': return renderBox(context);
    case 'border': return renderBorder(context);
    case 'radius': return renderRadius(context);
    case 'shadow': return renderShadows(context);
    case 'gradient': return renderGradients(context);
    case 'transform': return renderFunctions(context);
    case 'font': return renderFont(context);
    case 'background': return renderBackground(context);
    default: return false;
  }
}

/** Lazy standalone draft. The host alone accepts, persists and undoes its result. */
export function createComplexEditor(document: Document, options: ComplexEditorOptions): ComplexEditor {
  const abort = new AbortController(); let fieldsAbort = new AbortController(); let destroyed = false; let closed = false; let draft = options.value;
  const element = document.createElement('section'); element.className = 'complex-editor'; element.setAttribute('role', 'dialog'); element.setAttribute('aria-label', `Éditer ${options.property}`);
  const title = document.createElement('h3'); title.textContent = `Éditer ${options.property}`;
  const description = document.createElement('p'); description.className = 'complex-message'; description.textContent = 'Les contrôles préparent un brouillon. Appliquer enregistre toute la valeur ; Annuler conserve la valeur reçue.';
  const sourceLabel = document.createElement('label'); sourceLabel.className = 'complex-field'; sourceLabel.textContent = 'Valeur CSS';
  const source = document.createElement('textarea'); source.className = 'complex-source'; source.setAttribute('aria-label', `Valeur CSS de ${options.property}`); source.spellcheck = false; source.value = draft; source.disabled = options.disabled ?? false; sourceLabel.append(source);
  const status = document.createElement('p'); status.className = 'complex-message'; status.setAttribute('role', 'status');
  const fields = document.createElement('fieldset'); fields.className = 'complex-fields'; fields.disabled = options.disabled ?? false; const legend = document.createElement('legend'); legend.textContent = 'Assistant de valeur'; fields.append(legend);
  const refresh = document.createElement('button'); refresh.type = 'button'; refresh.textContent = 'Actualiser les contrôles'; refresh.disabled = options.disabled ?? false;
  const templates = document.createElement('select'); templates.setAttribute('aria-label', 'Modèle CSS'); templates.disabled = options.disabled ?? false;
  for (const value of templatesFor(options)) { const option = document.createElement('option'); option.value = value; option.textContent = value; templates.append(option); }
  const use = document.createElement('button'); use.type = 'button'; use.textContent = 'Utiliser ce modèle'; use.disabled = options.disabled ?? false;
  const modelNote = document.createElement('p'); modelNote.className = 'complex-message'; modelNote.textContent = 'Choisir puis utiliser un modèle remplace explicitement le brouillon. Les expressions et fonctions existantes restent conservées à l’ouverture.';
  const render = (): void => {
    fieldsAbort.abort(); fieldsAbort = new AbortController(); fields.replaceChildren(legend); fields.disabled = options.disabled ?? false; status.textContent = '';
    const context: EditorContext = { document, parent: fields, signal: fieldsAbort.signal, property: options.property, value: draft, update: (value, rebuild) => {
      if (destroyed || closed || options.disabled) return; draft = value; source.value = value; if (rebuild) render();
    } };
    if (!specialized(context, options.kind)) { message(context, 'Cette expression est conservée telle quelle. L’assistant de structure permet de modifier ses composantes et ses fonctions ; la saisie CSS reste disponible.'); renderStructured(context); }
  };
  const sourceChanged = (): void => { if (destroyed || closed || options.disabled) return; draft = source.value; fieldsAbort.abort(); fields.disabled = true; status.textContent = 'Source modifiée. Actualisez les contrôles pour reconstruire leur brouillon.'; };
  source.addEventListener('input', sourceChanged, { signal: abort.signal }); source.addEventListener('change', sourceChanged, { signal: abort.signal });
  refresh.addEventListener('click', render, { signal: abort.signal }); use.addEventListener('click', () => { if (destroyed || closed || options.disabled) return; draft = templates.value; source.value = draft; render(); }, { signal: abort.signal });
  const close = (): void => { if (destroyed || closed) return; closed = true; abort.abort(); fieldsAbort.abort(); element.hidden = true; options.onClose(); };
  const actions = document.createElement('div'); actions.className = 'complex-actions';
  const apply = document.createElement('button'); apply.type = 'button'; apply.textContent = 'Appliquer'; apply.disabled = options.disabled ?? false;
  apply.addEventListener('click', () => { if (destroyed || closed || options.disabled) return; try { if (draft !== options.value) options.onApply(draft); } finally { close(); } }, { signal: abort.signal });
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Annuler'; cancel.addEventListener('click', close, { signal: abort.signal }); actions.append(apply, cancel);
  element.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }, { signal: abort.signal });
  element.append(title, description, sourceLabel, status, refresh, fields, modelNote, templates, use, actions); render();
  return { element, focus: () => { if (!destroyed && !closed) source.focus(); }, destroy: () => { if (destroyed) return; destroyed = true; abort.abort(); fieldsAbort.abort(); element.remove(); } };
}
