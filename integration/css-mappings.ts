// integration/css-mappings.ts
import { namedColorHex } from '@kazo-ca/css-properties';
import type { HtmlPropertyBinding, TimelinePropertyValue } from '@kazo-ca/timeline-runtime';

/**
 * Explicit native property mapping for a Designer CSS write. Native identifiers cannot
 * contain CSS hyphens, so hyphenated declarations use a stable alias with its own
 * binding; nothing is inferred from a camelCase name.
 */
export interface PropertyMapping {
    readonly property: string;
    readonly binding: Extract<HtmlPropertyBinding, { kind: 'style' }>;
    readonly valueKind: TimelinePropertyValue['kind'];
    parse(value: string): TimelinePropertyValue;
}
type Color = Extract<TimelinePropertyValue, { kind: 'color' }>;

const colorMessage = 'Valeur de couleur non prise en charge : utilisez un nom de couleur CSS, #rgb, #rrggbb (avec alpha facultatif), rgb(), rgba() ou transparent.';
const borderStyles = new Set(['none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset']);
const logicalBorderStyles: Readonly<Record<string, string>> = {
    'border-block-start-style': 'borderBlockStartStyle',
    'border-block-end-style': 'borderBlockEndStyle',
    'border-inline-start-style': 'borderInlineStartStyle',
    'border-inline-end-style': 'borderInlineEndStyle',
};

function hexColor(value: string): Color | undefined {
    const match = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value);
    if (!match?.[1]) return undefined;
    const digits = match[1].length <= 4 ? [...match[1]].map(digit => digit + digit) : match[1].match(/../g) ?? [];
    const [r = 0, g = 0, b = 0, a = 255] = digits.map(pair => Number.parseInt(pair, 16));
    return { kind: 'color', r: r / 255, g: g / 255, b: b / 255, a: a / 255 };
}
/** CSS <number> literal only: no hexadecimal/binary forms or trailing dot. */
function cssNumber(token: string): number | undefined {
    return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(token) ? Number(token) : undefined;
}
/** Ratio in 0..1 from a number on `scale` or a percentage; out-of-range values are refused, never clamped. */
function ratio(token: string, scale: number, invalid: string, range: string): number {
    const percent = token.endsWith('%');
    const number = cssNumber(percent ? token.slice(0, -1) : token);
    if (number === undefined) throw new Error(invalid);
    const result = percent ? number / 100 : number / scale;
    if (result < 0 || result > 1) throw new Error(range);
    return result;
}
const colorRange = 'Composante de couleur hors intervalle : les canaux vont de 0 à 255 (ou 0 % à 100 %) et l’alpha de 0 à 1.';
function functionalColor(value: string): Color | undefined {
    const match = /^rgba?\((.*)\)$/i.exec(value);
    if (match?.[1] === undefined) return undefined;
    const body = match[1].trim();
    let channels: readonly string[];
    let alpha: string | undefined;
    if (body.includes(',')) {
        const tokens = body.split(',').map(token => token.trim());
        if (tokens.length !== 3 && tokens.length !== 4) throw new Error(colorMessage);
        channels = tokens.slice(0, 3); alpha = tokens[3];
    } else {
        const parts = body.split('/');
        channels = (parts[0] ?? '').trim().split(/\s+/);
        alpha = parts[1]?.trim();
        if (parts.length > 2 || channels.length !== 3 || parts.length === 2 && !alpha) throw new Error(colorMessage);
    }
    const percent = channels[0]?.endsWith('%') ?? false;
    if (channels.some(token => token.endsWith('%') !== percent)) throw new Error('Les canaux rgb() doivent être tous des nombres ou tous des pourcentages.');
    const [r = 0, g = 0, b = 0] = channels.map(token => ratio(token, 255, colorMessage, colorRange));
    return { kind: 'color', r, g, b, a: alpha === undefined ? 1 : ratio(alpha, 1, colorMessage, colorRange) };
}
export function parseCssColor(value: string): Color {
    const trimmed = value.trim();
    if (trimmed.toLowerCase() === 'transparent') return { kind: 'color', r: 0, g: 0, b: 0, a: 0 };
    const named = namedColorHex(trimmed);
    const color = named ? hexColor(named) : hexColor(trimmed) ?? functionalColor(trimmed);
    if (!color) throw new Error(colorMessage);
    return color;
}
function borderStyle(value: string): TimelinePropertyValue {
    const keyword = value.trim().toLowerCase();
    if (!borderStyles.has(keyword)) throw new Error('Valeur de style de bordure non prise en charge : utilisez un mot-clé explicite (solid, dashed, dotted…), sans valeur CSS globale ni variable.');
    return { kind: 'text', value: keyword };
}

const mappings: ReadonlyMap<string, PropertyMapping> = new Map<string, PropertyMapping>([
    ['opacity', { property: 'opacity', binding: { kind: 'style', cssName: 'opacity' }, valueKind: 'number', parse(value) {
        return { kind: 'number', value: ratio(value.trim(), 1, 'Valeur d’opacité non valide : utilisez un nombre de 0 à 1 ou un pourcentage.', 'Opacité hors intervalle : utilisez une valeur de 0 à 1 (ou 0 % à 100 %).') };
    } }],
    ['color', { property: 'color', binding: { kind: 'style', cssName: 'color' }, valueKind: 'color', parse: parseCssColor }],
    ...Object.entries(logicalBorderStyles).map(([cssName, property]): [string, PropertyMapping] => [cssName, { property, binding: { kind: 'style', cssName }, valueKind: 'text', parse: borderStyle }]),
]);

/** Box dimensions keep the unit of their track; nothing is converted between units. */
export const dimensionProperties = ['width', 'height'] as const;
export type DimensionProperty = typeof dimensionProperties[number];
export const dimensionUnits = ['px', '%', 'em', 'rem', 'vw', 'vh'] as const;
export type DimensionUnit = typeof dimensionUnits[number];
export function isDimensionProperty(property: string): property is DimensionProperty {
    return dimensionProperties.some(candidate => candidate === property);
}
/** A non-negative length; a unitless zero takes the track unit (px for a new track). */
export function parseCssLength(text: string, trackUnit?: string): { readonly value: number; readonly unit: DimensionUnit } {
    const message = 'Dimension non valide : utilisez une longueur positive en px, %, em, rem, vw ou vh.';
    const match = /^(\+?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?)([a-z%]*)$/i.exec(text.trim());
    const value = match?.[1] === undefined ? Number.NaN : Number(match[1]);
    if (!match || !Number.isFinite(value) || value < 0) throw new Error(message);
    const written = (match[2] ?? '').toLowerCase() || (value === 0 ? trackUnit ?? 'px' : '');
    const unit = dimensionUnits.find(candidate => candidate === written);
    if (!unit) throw new Error(message);
    return { value, unit };
}
/** Display text of a typed value for announced writes; the typed value stays authoritative. */
export function formatCssText(value: TimelinePropertyValue): string {
    if (value.kind !== 'color') return String(value.value);
    const [r, g, b] = [value.r, value.g, value.b].map(channel => Math.round(channel * 255));
    return value.a === 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${value.a})`;
}
/** Own entries only: inherited object names never become mappings. */
export function propertyMapping(cssName: string): PropertyMapping | undefined {
    return mappings.get(cssName);
}
