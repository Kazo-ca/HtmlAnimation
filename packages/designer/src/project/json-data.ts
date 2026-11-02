// packages/designer/src/project/json-data.ts
import { ProjectValidationError } from './types.js';
import type { JsonObject, JsonValue, ProjectCodecLimits } from './types.js';

interface Limits { readonly maxDepth: number; readonly maxNodes: number; readonly maxBytes: number }
const defaults: Limits = { maxDepth: 64, maxNodes: 1_000_000, maxBytes: 10 * 1024 * 1024 };
const encoder = new TextEncoder();

function fail(code: string, path: string, message: string): never {
  throw new ProjectValidationError([{ code, path, message, severity: 'error' }]);
}
export function projectLimits(input: ProjectCodecLimits = {}): Limits {
  const limits = { ...defaults, ...input };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < (name === 'maxDepth' ? 0 : 1)) fail('project-limits', '$', 'Les limites du codec doivent être des entiers valides.');
  }
  return limits;
}
export function checkProjectTextSize(text: string, input?: ProjectCodecLimits): void {
  const { maxBytes } = projectLimits(input);
  if (text.length > maxBytes || encoder.encode(text).length > maxBytes) fail('json-limit', '$', 'Le projet dépasse la taille JSON autorisée.');
}
function numberText(value: number): string { return Object.is(value, -0) ? '-0' : String(value); }
function childPath(path: string, key: string): string { return `${path}[${JSON.stringify(key)}]`; }

/** A bounded data-only copy. Reading property descriptors never invokes a getter. */
export function cloneProjectJson(input: unknown, options?: ProjectCodecLimits): JsonValue {
  const limits = projectLimits(options); const ancestors = new WeakSet<object>();
  let nodes = 0; let bytes = 0;
  const count = (size: number, path: string): void => {
    bytes += size;
    if (bytes > limits.maxBytes) fail('json-limit', path, 'Le projet dépasse la taille JSON autorisée.');
  };
  const quoted = (text: string, path: string): void => {
    if (text.length > limits.maxBytes) fail('json-limit', path, 'Le projet dépasse la taille JSON autorisée.');
    count(encoder.encode(JSON.stringify(text)).length, path);
  };
  const visit = (value: unknown, path: string, depth: number): JsonValue => {
    if (++nodes > limits.maxNodes || depth > limits.maxDepth) fail('json-limit', path, 'Le projet dépasse les limites de profondeur ou de données autorisées.');
    if (value === null) { count(4, path); return null; }
    if (typeof value === 'string') { quoted(value, path); return value; }
    if (typeof value === 'boolean') { count(value ? 4 : 5, path); return value; }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) fail('json-number', path, 'Les nombres du projet doivent être finis.');
      count(numberText(value).length, path); return value;
    }
    if (typeof value !== 'object') fail('json-type', path, 'Le projet accepte uniquement des données JSON, sans code ni valeur indéfinie.');
    if (ancestors.has(value)) fail('json-cycle', path, 'Le projet contient une référence cyclique.');
    const array = Array.isArray(value); const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== (array ? Array.prototype : Object.prototype) && prototype !== null) fail('json-prototype', path, 'Le projet accepte uniquement des objets JSON simples.');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string')) fail('json-symbol', path, 'Les clés de symbole ne peuvent pas être conservées dans le projet JSON.');
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!('value' in descriptor)) fail('json-accessor', childPath(path, key), 'Les accesseurs ne sont pas exécutés par le codec du projet.');
      if (!descriptor.enumerable && !(array && key === 'length')) fail('json-property', childPath(path, key), 'Les propriétés non énumérables ne sont pas des données JSON.');
    }
    ancestors.add(value);
    try {
      count(2, path);
      if (array) {
        const length: unknown = descriptors.length?.value;
        if (typeof length !== 'number' || length > limits.maxNodes - nodes) fail('json-limit', path, 'Le tableau dépasse la taille de données autorisée.');
        const keys = Object.keys(descriptors).filter(key => key !== 'length');
        if (keys.length !== length || keys.some(key => !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length)) fail('json-array', path, 'Les tableaux du projet doivent être denses et sans propriété supplémentaire.');
        const result: JsonValue[] = [];
        for (let index = 0; index < length; index++) {
          const descriptor = descriptors[String(index)];
          if (!descriptor) fail('json-array', path, 'Les tableaux du projet doivent être denses.');
          if (index) count(1, path);
          result.push(visit(descriptor.value, `${path}[${index}]`, depth + 1));
        }
        return Object.freeze(result);
      }
      // A null prototype preserves keys such as __proto__ as ordinary data.
      const result: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
      for (const [index, [key, descriptor]] of Object.entries(descriptors).entries()) {
        if (index) count(1, path); quoted(key, path); count(1, path);
        result[key] = visit(descriptor.value, childPath(path, key), depth + 1);
      }
      return Object.freeze(result);
    } finally { ancestors.delete(value); }
  };
  try { return visit(input, '$', 0); }
  catch (error) {
    if (error instanceof ProjectValidationError) throw error;
    return fail('json-read', '$', 'Les données du projet ne peuvent pas être inspectées en toute sécurité.');
  }
}

/** Input has already been copied as JSON data; no toJSON or accessor is invoked. */
export function stringifyProjectJson(value: JsonValue): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return numberText(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return `[${value.map(item => stringifyProjectJson(item)).join(',')}]`;
  return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}:${stringifyProjectJson(item)}`).join(',')}}`;
}
export function isJsonObject(value: JsonValue | undefined): value is JsonObject { return value !== null && typeof value === 'object' && !Array.isArray(value); }
