// integration/playback-outputs.ts
import { compileHtmlPlayback, exportHtmlJavascript } from '@kazo-ca/timeline-runtime';
import type { IHtmlAnimationContext, ITimelineDocument, PropertyRegistry } from '@kazo-ca/timeline-runtime';
import { exportHtmlCss } from '@kazo-ca/timeline-export-css';

export type PlaybackFormat = 'json' | 'javascript' | 'css';
/** Fidelity is the exporter's own claim: frames are held between samples, CSS is continuous. */
export type PlaybackOutput = {
    readonly status: 'exported';
    readonly format: PlaybackFormat;
    readonly fidelity: 'frames' | 'continuous';
    readonly filename: string;
    readonly mimeType: string;
    readonly text: string;
    readonly diagnostics: readonly string[];
} | {
    readonly status: 'refused';
    readonly format: PlaybackFormat;
    readonly message: string;
    readonly diagnostics: readonly string[];
    readonly alternatives: readonly PlaybackFormat[];
};
export interface PlaybackOutputSource {
    /** Exports read authoring data only while it is coherent (no fault, group or closed editor). */
    readonly available: () => boolean;
    readonly document: () => ITimelineDocument;
    readonly context: () => IHtmlAnimationContext;
    readonly registry: PropertyRegistry;
    readonly root: HTMLElement;
    /** Original source styles, never the shared preview's rendered declarations. */
    readonly withSource: <T>(read: () => T) => T;
}

const files: Readonly<Record<PlaybackFormat, { readonly filename: string; readonly mimeType: string }>> = {
    json: { filename: 'animation.playback.json', mimeType: 'application/json' },
    javascript: { filename: 'animation.player.js', mimeType: 'text/javascript' },
    css: { filename: 'animation.css', mimeType: 'text/css' },
};
function refused(format: PlaybackFormat, diagnostics: readonly string[], alternatives: readonly PlaybackFormat[] = []): PlaybackOutput {
    const message = diagnostics.join(' ') || 'Cette sortie de lecture a été refusée.';
    return { status: 'refused', format, message, diagnostics, alternatives };
}

/**
 * Faithful outputs from the public Timeline compilers only. Nothing is sampled, fitted or
 * rewritten here, and a refused export never yields a partial file. Editable saving stays
 * independent of these capabilities.
 */
export function exportPlayback(source: PlaybackOutputSource, format: PlaybackFormat): PlaybackOutput {
    if (!source.available()) return refused(format, ['L’export est indisponible : terminez la transaction en cours ou rouvrez un éditeur cohérent.']);
    const sourceStage = { withSourceStyles: source.withSource };
    try {
        if (format === 'css') {
            const result = exportHtmlCss(source.document(), { root: source.root, animationContext: source.context(), registry: source.registry, sourceStage, ...(source.root.id ? { rootSelector: `#${CSS.escape(source.root.id)}` } : {}) });
            const diagnostics = result.diagnostics.map(diagnostic => diagnostic.message);
            if (result.status === 'refused') return refused(format, diagnostics, result.alternatives);
            return { status: 'exported', format, fidelity: result.fidelity, ...files.css, text: result.css, diagnostics };
        }
        const compiled = compileHtmlPlayback(source.document(), { root: source.root, animationContext: source.context(), registry: source.registry, sourceStage });
        const diagnostics = compiled.diagnostics.map(diagnostic => diagnostic.message);
        if (compiled.status === 'refused') return refused(format, diagnostics);
        const text = format === 'json' ? `${JSON.stringify(compiled.data, null, 2)}\n` : exportHtmlJavascript(compiled.data);
        return { status: 'exported', format, fidelity: 'frames', ...files[format], text, diagnostics };
    } catch (error) {
        return refused(format, [error instanceof Error && error.message.trim() ? error.message : 'La compilation de la sortie de lecture a échoué.']);
    }
}
