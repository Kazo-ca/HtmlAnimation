// Genuine installed packages: faithful playback outputs through public Timeline compilers.
import { afterEach, describe, expect, it } from 'vitest';
import { createGradientScene } from '../fixtures/gradient-scene.js';
import { createRealGradientHost } from '../integration/timeline-real.js';

const cleanup: (() => void)[] = [];
afterEach(() => { for (const dispose of cleanup.splice(0).reverse()) dispose(); document.body.replaceChildren(); });

function setup(sceneId?: string) {
    const scene = createGradientScene(document);
    if (sceneId) scene.id = sceneId;
    const editorContainer = document.createElement('div');
    document.body.append(editorContainer, scene);
    const host = createRealGradientHost(editorContainer, scene);
    cleanup.push(() => host.dispose());
    host.navigate(50);
    expect(host.adapter.execute('Opacity', [{ objectId: 'html:#gradient-peer', selector: '#gradient-peer', property: 'opacity', value: '0.4', frame: 50 }]).status).toBe('changed');
    return { host, scene };
}

describe('playback outputs from the genuine Timeline compilers', () => {
    it('exports frame-sampled JSON with proven groups and the authored source', () => {
        const { host } = setup();
        const output = host.exportPlayback('json');
        if (output.status !== 'exported') throw new Error(output.message);
        expect(output).toMatchObject({ format: 'json', fidelity: 'frames', filename: 'animation.playback.json', mimeType: 'application/json' });
        const data = JSON.parse(output.text) as { version: number; sampling: string; frames: Record<string, Record<string, Record<string, string>>>; source: unknown };
        expect(data).toMatchObject({ version: 1, sampling: 'frames' });
        expect(Object.keys(data.frames)).toHaveLength(100);
        expect(Object.values(data.frames['50'] ?? {})).toContainEqual({ opacity: '0.4' });
        expect(data.source).toBeDefined();
    });
    it('exports a standalone JavaScript player module from the same compiled document', () => {
        const { host } = setup();
        const output = host.exportPlayback('javascript');
        if (output.status !== 'exported') throw new Error(output.message);
        expect(output).toMatchObject({ format: 'javascript', fidelity: 'frames', filename: 'animation.player.js', mimeType: 'text/javascript' });
        expect(output.text).toContain('export function createPlayer');
        expect(output.text).not.toMatch(/\beval\s*\(|new Function/);
    });
    it('exports continuous CSS when the scene root has a selector', () => {
        const { host } = setup('playback-scene');
        const output = host.exportPlayback('css');
        if (output.status !== 'exported') throw new Error(output.message);
        expect(output).toMatchObject({ format: 'css', fidelity: 'continuous', filename: 'animation.css', mimeType: 'text/css' });
        expect(output.text).toContain('@keyframes');
        expect(output.text).toContain('#playback-scene');
    });
    it('explains a refused CSS export with Timeline diagnostics and its alternatives, never a partial sheet', () => {
        const { host } = setup();
        const output = host.exportPlayback('css');
        expect(output).toMatchObject({ status: 'refused', format: 'css', alternatives: ['javascript', 'json'] });
        if (output.status !== 'refused') throw new Error('Expected a refusal');
        expect(output.message).toContain('conteneur');
        expect(output.diagnostics.length).toBeGreaterThan(0);
    });
    it('does not change the document, context, history or rendered preview', () => {
        const { host, scene } = setup('playback-scene');
        const before = { document: host.editor.document, context: structuredClone(host.stage.animationContext), html: scene.innerHTML, undo: host.editor.canUndo };
        for (const format of ['json', 'javascript', 'css'] as const) host.exportPlayback(format);
        expect(host.editor.document).toBe(before.document); expect(host.stage.animationContext).toEqual(before.context);
        expect(scene.innerHTML).toBe(before.html); expect(host.editor.canUndo).toBe(before.undo);
    });
    it('keeps hostile identifiers inert in the JavaScript and CSS outputs', () => {
        const hostile = 'x"\\</script>\u2028y';
        const scene = createGradientScene(document); scene.id = 'playback-scene';
        const peer = scene.querySelector<HTMLElement>('#gradient-peer'); if (!peer) throw new Error('Missing peer');
        peer.id = hostile;
        const editorContainer = document.createElement('div'); document.body.append(editorContainer, scene);
        const host = createRealGradientHost(editorContainer, scene); cleanup.push(() => host.dispose());
        // Escaped selectors are unsupported targets, so the hostile ID reaches the outputs through a group.
        expect(host.adapter.execute('Opacity', [{ objectId: 'html:.gradient-subject', selector: '.gradient-subject', property: 'opacity', value: '0.4', frame: 1 }]).status).toBe('changed');
        const json = host.exportPlayback('json');
        if (json.status !== 'exported') throw new Error(json.message);
        expect(() => JSON.parse(json.text) as unknown).not.toThrow(); expect(json.text).not.toContain('</script>');
        const javascript = host.exportPlayback('javascript');
        if (javascript.status !== 'exported') throw new Error(javascript.message);
        expect(javascript.text).not.toContain('</script>'); expect(javascript.text).not.toContain('\u2028');
        const css = host.exportPlayback('css');
        if (css.status === 'exported') { expect(css.text).not.toContain('</script>'); expect(css.text.split('{').length).toBe(css.text.split('}').length); }
        else expect(css.message.length).toBeGreaterThan(0);
    });
    it('refuses while the host is faulted or closed', () => {
        const { host } = setup();
        host.dispose();
        expect(host.exportPlayback('json')).toMatchObject({ status: 'refused', message: expect.stringContaining('export') });
    });
});
