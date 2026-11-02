// packages/css-properties/src/editors/color.ts
import { field } from './fields.js';
import type { EditorContext } from './fields.js';
export interface RgbaColor { readonly red: number; readonly green: number; readonly blue: number; readonly alpha: number }
const NAMED: Readonly<Record<string, string>> = { transparent: '#00000000', black: '#000000', white: '#ffffff', red: '#ff0000', blue: '#0000ff', green: '#008000', lime: '#00ff00', yellow: '#ffff00', orange: '#ffa500', purple: '#800080', rebeccapurple: '#663399', gray: '#808080', grey: '#808080', pink: '#ffc0cb', navy: '#000080', teal: '#008080', aqua: '#00ffff', fuchsia: '#ff00ff', maroon: '#800000', olive: '#808000', silver: '#c0c0c0' };
export function readColor(value: string): RgbaColor | null {
  const normalized = value.trim().toLowerCase(); const hex = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(NAMED[normalized] ?? normalized);
  if (hex) {
    const source = hex[1] ?? ''; const full = source.length < 5 ? [...source].map(char => char + char).join('') : source;
    return { red: Number.parseInt(full.slice(0, 2), 16), green: Number.parseInt(full.slice(2, 4), 16), blue: Number.parseInt(full.slice(4, 6), 16), alpha: full.length === 8 ? Number.parseInt(full.slice(6), 16) / 255 : 1 };
  }
  const rgb = /^rgba?\(([^()]+)\)$/i.exec(normalized); if (!rgb) return null;
  const channels = (rgb[1] ?? '').trim().split(/[\s,/]+/); if (channels.length < 3 || channels.length > 4) return null;
  if (!channels.every(part => /^[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?%?$/i.test(part))) return null;
  const values = channels.map((part, index) => Number.parseFloat(part) * (part.endsWith('%') ? index < 3 ? 2.55 : .01 : 1));
  if (!values.every(Number.isFinite)) return null;
  return { red: values[0] ?? 0, green: values[1] ?? 0, blue: values[2] ?? 0, alpha: values[3] ?? 1 };
}
export function writeColor(value: RgbaColor): string { return `rgba(${value.red}, ${value.green}, ${value.blue}, ${Number(value.alpha.toFixed(4))})`; }
function colorHex(color: RgbaColor): string { return `#${[color.red, color.green, color.blue].map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('')}`; }
export function colorFields(context: EditorContext, value: string, change: (value: string) => void, name = 'la couleur'): boolean {
  let color = readColor(value);
  const suffix = name.startsWith('le ') ? `du ${name.slice(3)}` : `de ${name}`;
  if (!color) { field(context, name === 'la couleur' ? 'Couleur CSS' : `Couleur ${suffix}`, value, change); return false; }
  field(context, name === 'la couleur' ? 'Couleur' : `Couleur ${suffix}`, colorHex(color), value => { const picked = readColor(value); if (!picked || !color) return; color = { ...picked, alpha: color.alpha }; change(writeColor(color)); }, 'color');
  field(context, `Opacité ${suffix}`, String(Number(color.alpha.toFixed(4))), value => { if (!value.trim()) return; const alpha = Number(value); if (!color || !Number.isFinite(alpha) || alpha < 0 || alpha > 1) return; color = { ...color, alpha }; change(writeColor(color)); }, 'number', { min: '0', max: '1', step: '0.01' }); return true;
}
