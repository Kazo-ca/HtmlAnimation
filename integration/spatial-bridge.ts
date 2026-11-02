// integration/spatial-bridge.ts
import type { HtmlSpatialBinding, HtmlSpatialCoordinate, HtmlSpatialLengthUnit, IHtmlSpatialDefinition, IHtmlSpatialSourceCapture, TimelinePropertyValue } from '@kazo-ca/timeline-runtime';

/** Layer-local projection identity; identical ids never prove two sources compatible. */
export const spatialProjectionId = 'geometry';
const components = ['translateX', 'translateY', 'rotation', 'scaleX', 'scaleY', 'pivotX', 'pivotY'] as const;
export type SpatialComponent = typeof components[number];
/** Stable native aliases: HA4 builtins such as `rotation` keep their absolute meaning. */
const aliases: Readonly<Record<SpatialComponent, string>> = {
    translateX: 'spatialTranslateX', translateY: 'spatialTranslateY', rotation: 'spatialRotation',
    scaleX: 'spatialScaleX', scaleY: 'spatialScaleY', pivotX: 'spatialPivotX', pivotY: 'spatialPivotY',
};
const lengths: readonly HtmlSpatialLengthUnit[] = ['px', '%', 'em', 'rem', 'vw', 'vh'];
const angles = ['deg', 'rad', 'turn'] as const;
const groupMessage = 'Les éléments de ce groupe n’ont pas une source spatiale identique et démontrable ; choisissez des objets individuels ou une source explicite commune.';

export interface SpatialWrite {
    readonly property: string;
    readonly binding: HtmlSpatialBinding;
    readonly value: TimelinePropertyValue;
}
export function isSpatialComponent(property: string): property is SpatialComponent {
    return components.some(component => component === property);
}
function quantity(text: string, message: string): { readonly number: number; readonly unit: string } {
    const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?)([a-z%]*)$/i.exec(text.trim());
    const number = match?.[1] === undefined ? Number.NaN : Number(match[1]);
    if (!match || !Number.isFinite(number)) throw new Error(message);
    return { number, unit: (match[2] ?? '').toLowerCase() };
}
/**
 * Parses one Designer geometry value; the unit becomes the track's own and is never converted.
 * A unitless zero (valid CSS for lengths and angles) takes the existing track unit, if any.
 */
export function parseSpatialWrite(component: SpatialComponent, text: string, trackUnit?: string): SpatialWrite {
    const property = aliases[component];
    const value = (number: number): TimelinePropertyValue => ({ kind: 'number', value: number });
    if (component === 'scaleX' || component === 'scaleY') {
        const parsed = quantity(text, 'Échelle non valide : utilisez un nombre sans unité.');
        if (parsed.unit) throw new Error('Échelle non valide : utilisez un nombre sans unité.');
        return { property, binding: { kind: 'spatial', projectionId: spatialProjectionId, component }, value: value(parsed.number) };
    }
    const angle = component === 'rotation';
    const message = angle ? 'Rotation non valide : utilisez une valeur en deg, rad ou turn.' : 'Longueur spatiale non valide : utilisez px, %, em, rem, vw ou vh.';
    const parsed = quantity(text, message);
    const written = parsed.unit === '' && parsed.number === 0 ? trackUnit ?? (angle ? 'deg' : 'px') : parsed.unit;
    if (angle) {
        const unit = angles.find(candidate => candidate === written);
        if (!unit) throw new Error(message);
        return { property, binding: { kind: 'spatial', projectionId: spatialProjectionId, component, unit }, value: value(parsed.number) };
    }
    const unit = lengths.find(candidate => candidate === written);
    if (!unit) throw new Error(message);
    return { property, binding: { kind: 'spatial', projectionId: spatialProjectionId, component, unit }, value: value(parsed.number) };
}
export function spatialAlias(component: SpatialComponent): string { return aliases[component]; }

const originMessage = 'L’origine de transformation source n’est pas prise en charge ; une source explicite est nécessaire.';
/** Whitespace-separated tokens at parenthesis depth zero, so calc()/var() stay whole. */
function originTokens(text: string): readonly string[] {
    const tokens: string[] = []; let depth = 0; let current = '';
    for (const character of text.trim()) {
        if (character === '(') depth++;
        if (character === ')') depth--;
        if (depth < 0) throw new Error(originMessage);
        if (/\s/.test(character) && depth === 0) { if (current) tokens.push(current); current = ''; } else current += character;
    }
    if (depth !== 0) throw new Error(originMessage);
    if (current) tokens.push(current);
    return tokens;
}
const vertical = (token: string | undefined): boolean => token === 'top' || token === 'bottom';
const horizontal = (token: string | undefined): boolean => token === 'left' || token === 'right';
/** CSS transform-origin grammar: one value, keyword pairs in either order, optional z length. */
function originParts(text: string): { readonly x: string; readonly y: string; readonly z: string } {
    const tokens = originTokens(text).map(token => /^[a-z]+$/i.test(token) ? token.toLowerCase() : token);
    const [first, second, z = '0px'] = tokens;
    if (!first || tokens.length > 3) throw new Error(originMessage);
    if (tokens.length === 1) return vertical(first) ? { x: 'center', y: first, z } : { x: first, y: 'center', z };
    const swap = vertical(first) || horizontal(second);
    const [x, y] = swap ? [second, first] : [first, second];
    if (!x || !y || vertical(x) || horizontal(y)) throw new Error(originMessage);
    return { x, y, z };
}
function coordinate(text: string): HtmlSpatialCoordinate {
    const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(px|%|em|rem|vw|vh)$/i.exec(text);
    const unit = lengths.find(candidate => candidate === match?.[2]?.toLowerCase());
    return match?.[1] !== undefined && unit ? { value: Number(match[1]), unit } : { css: text };
}
/** Depth has no percentage: a `%` z value is refused instead of being cast. */
function depth(text: string): HtmlSpatialCoordinate<Exclude<HtmlSpatialLengthUnit, '%'>> {
    const value = coordinate(text);
    if ('unit' in value) {
        if (value.unit === '%') throw new Error('La profondeur de l’origine ne peut pas être un pourcentage.');
        return { value: value.value, unit: value.unit };
    }
    if (value.css.includes('%')) throw new Error('La profondeur de l’origine ne peut pas être un pourcentage.');
    return value;
}
function capture(authored: string, computed: string): IHtmlSpatialSourceCapture {
    return authored ? { kind: 'authored', authoredValue: authored, computedValue: computed } : { kind: 'computed', computedValue: computed };
}
interface MemberSource { readonly transform: string; readonly origin: string; readonly computedTransform: string; readonly computedOrigin: string; readonly centered: boolean }
function memberSource(element: Element): MemberSource {
    const view = element.ownerDocument.defaultView;
    if (!view || !('style' in element)) throw new Error('La source spatiale de cette cible est indisponible.');
    const inline = (element as HTMLElement).style;
    const computed = view.getComputedStyle(element);
    const computedOrigin = computed.getPropertyValue('transform-origin').trim();
    // A computed origin at the untransformed box centre is the CSS initial 50% 50%, not a
    // layout-dependent pixel pivot to bake into the projection.
    const box = element instanceof HTMLElement ? { width: element.offsetWidth, height: element.offsetHeight } : undefined;
    const pixels = computedOrigin.split(/\s+/).map(token => /^-?[\d.]+px$/.test(token) ? Number.parseFloat(token) : Number.NaN);
    const centered = !computedOrigin || box !== undefined && Math.abs((pixels[0] ?? Number.NaN) - box.width / 2) < 0.01 && Math.abs((pixels[1] ?? Number.NaN) - box.height / 2) < 0.01 && (pixels[2] === undefined || pixels[2] === 0);
    return { transform: inline.getPropertyValue('transform').trim(), origin: inline.getPropertyValue('transform-origin').trim(), computedTransform: computed.getPropertyValue('transform').trim() || 'none', computedOrigin, centered };
}
/**
 * Captures the projection from the original source only (the caller supplies the preview
 * owner's source window). This is a pre-filter for groups: the inline cascade must match.
 * Timeline's transaction proves the complete group cascade (stylesheets, variables) and
 * refuses an undemonstrable one before any mutation.
 */
export function captureSpatialDefinition(elements: readonly Element[], withSource: <T>(read: () => T) => T): IHtmlSpatialDefinition {
    const sources = withSource(() => elements.map(memberSource));
    const [first] = sources;
    if (!first) throw new Error('La cible spatiale ne correspond à aucun élément.');
    if (sources.length > 1 && (sources.some(source => JSON.stringify(source) !== JSON.stringify(first)) || /\b(?:var|env|attr)\s*\(/i.test(`${first.transform} ${first.origin}`))) throw new Error(groupMessage);
    const parts = originParts(first.origin || (first.centered ? '50% 50% 0px' : first.computedOrigin));
    return {
        id: spatialProjectionId, version: 1, composition: 'prepend-trs',
        sourceTransform: first.transform || first.computedTransform,
        origin: { x: coordinate(parts.x), y: coordinate(parts.y), z: depth(parts.z) },
        provenance: { transform: capture(first.transform, first.computedTransform), origin: capture(first.origin, first.computedOrigin) },
    };
}
/**
 * Identity adjustments (0, or 1 for scale) or, for a pivot, the captured source origin in the
 * track's own unit. A different origin unit or expression needs an explicit conversion.
 */
export function spatialBase(binding: HtmlSpatialBinding, definition: IHtmlSpatialDefinition): TimelinePropertyValue {
    if (binding.component === 'sourceTransform') return { kind: 'text', value: definition.sourceTransform };
    if (binding.component !== 'pivotX' && binding.component !== 'pivotY') return { kind: 'number', value: binding.component === 'scaleX' || binding.component === 'scaleY' ? 1 : 0 };
    const origin = binding.component === 'pivotX' ? definition.origin.x : definition.origin.y;
    if (!('unit' in origin) || origin.unit !== binding.unit) throw new Error('L’origine source n’utilise pas l’unité de ce pivot ; une conversion explicite est nécessaire et n’est jamais déduite.');
    return { kind: 'number', value: origin.value };
}
