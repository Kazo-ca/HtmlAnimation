// packages/css-properties/src/editors/fields.ts
export interface EditorContext {
  readonly document: Document; readonly parent: HTMLElement; readonly signal: AbortSignal;
  readonly property: string; readonly value: string;
  readonly update: (value: string, rebuild?: boolean) => void;
}
function label(context: EditorContext, name: string, control: HTMLElement): void {
  const wrapper = context.document.createElement('label'); wrapper.className = 'complex-field';
  const text = context.document.createElement('span'); text.textContent = name; control.setAttribute('aria-label', name); wrapper.append(text, control); context.parent.append(wrapper);
}
export function field(context: EditorContext, name: string, value: string, change: (value: string) => void, type = 'text', attributes: Readonly<Record<string, string>> = {}): HTMLInputElement {
  const input = context.document.createElement('input'); input.type = type; input.value = value; input.spellcheck = false;
  for (const [key, content] of Object.entries(attributes)) input.setAttribute(key, content);
  const update = (): void => change(input.value); input.addEventListener('input', update, { signal: context.signal }); input.addEventListener('change', update, { signal: context.signal }); label(context, name, input); return input;
}
export function choice(context: EditorContext, name: string, value: string, values: readonly string[], change: (value: string) => void): HTMLSelectElement {
  const select = context.document.createElement('select');
  for (const item of [...new Set([value, ...values])]) { const option = context.document.createElement('option'); option.value = item; option.textContent = item || 'Aucun'; select.append(option); }
  select.value = value; select.addEventListener('change', () => change(select.value), { signal: context.signal }); label(context, name, select); return select;
}
export function button(context: EditorContext, name: string, action: () => void): HTMLButtonElement {
  const result = context.document.createElement('button'); result.type = 'button'; result.textContent = name;
  result.addEventListener('click', action, { signal: context.signal }); context.parent.append(result); return result;
}
export function toggle(context: EditorContext, name: string, value: boolean, change: (value: boolean) => void): void {
  const input = context.document.createElement('input'); input.type = 'checkbox'; input.checked = value;
  input.addEventListener('change', () => change(input.checked), { signal: context.signal }); label(context, name, input);
}
export function group(context: EditorContext, name: string): EditorContext {
  const parent = context.document.createElement('fieldset'); parent.className = 'complex-group'; const title = context.document.createElement('legend'); title.textContent = name; parent.append(title); context.parent.append(parent); return { ...context, parent };
}
export function message(context: EditorContext, text: string): void { const element = context.document.createElement('p'); element.className = 'complex-message'; element.textContent = text; context.parent.append(element); }
