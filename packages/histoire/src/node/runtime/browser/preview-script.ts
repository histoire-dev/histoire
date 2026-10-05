import type { HistoireGlobals } from '@histoire/protocol'
import { PREVIEW_SETTINGS_SYNC, PROPS_OVERRIDE, RUNTIME_RESULT, SANDBOX_READY, VARIANT_READY } from '@histoire/shared'
import { renderPreviewTestScript } from './preview-test-script.js'
import { matchesPreviewMessage } from './readiness.js'

/** Document-only options with no source, secret or filesystem paths. */
export interface PreviewScriptOptions {
  /** Captured target and generation authority. */
  authority: { origin: string, storyId: string, variantId: string, nonce: string, epoch: string, active: boolean }
  /** Same-origin sandbox URL using shared preview URL construction. */
  sandboxUrl: string
  /** Existing preview settings message payload. */
  settings: { responsiveWidth: number, responsiveHeight: number, rotate: false, backgroundColor: string, checkerboard: false, textDirection: 'ltr' | 'rtl', globals?: HistoireGlobals }
  /** Existing Histoire preference, written before sandbox creation. */
  colorScheme?: 'light' | 'dark'
  /** Complete isolated cell props; readiness includes their existing runtime acknowledgement. */
  propsOverride?: Record<string, unknown>
}

/** Escape JSON for executable script text rather than an HTML attribute. */
export function serializePreviewScriptData(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029')
}

/** Fixed trusted bootstrap; listener is installed before iframe insertion. */
export function renderPreviewScript(options: PreviewScriptOptions): string {
  const data = serializePreviewScriptData({ ...options, types: [SANDBOX_READY, VARIANT_READY, RUNTIME_RESULT], settingsType: PREVIEW_SETTINGS_SYNC, propsType: PROPS_OVERRIDE })
  // The guard is a self-contained function. Supply its message constants so its
  // serialized body never depends on imports or a transpiler's local binding.
  return `(() => {
    const options = ${data};
    const matches = ${matchesPreviewMessage.toString()};
    const state = window.__HST_MCP_PREVIEW__ = { ...options.authority, ready: false, sandbox: false, variant: false, propsApplied: !options.propsOverride, propsRequest: '', propsVersion: 0, propsFailed: false };
    const frame = document.createElement('iframe');
    frame.id = 'histoire-mcp-preview';
    frame.title = 'Histoire preview';
    frame.style.cssText = 'display:block;border:0;width:100vw;height:100vh';
    frame.style.backgroundColor = options.settings.backgroundColor;
    state.currentDocumentId = () => {
      try { return frame.contentWindow?.__HST_PREVIEW_DOCUMENT_ID__; }
      catch (error) {
        if (error.name === 'SecurityError') return undefined;
        throw error;
      }
    };
    window.addEventListener('message', event => {
      if (!matches(event, frame.contentWindow, state, options.authority, options.types)) return;
      const documentId = state.currentDocumentId();
      if (!documentId || event.data?.documentId !== documentId) return;
      if (state.documentId !== documentId) {
        state.documentId = documentId;
        state.sandbox = false;
        state.variant = false;
        state.ready = false;
        state.propsApplied = !options.propsOverride;
        state.propsRequest = '';
        state.propsFailed = false;
      }
      if (event.data.type === options.types[0]) {
        state.sandbox = true;
        frame.contentWindow.postMessage({ __histoire: true, type: options.settingsType, settings: { ...options.settings, ...(options.colorScheme ? { colorScheme: options.colorScheme } : {}) } }, options.authority.origin);
      }
      if (event.data.type === options.types[1]) state.variant = true;
      if (event.data.type === options.types[2] && state.propsRequest && event.data.requestId === state.propsRequest) {
        state.propsFailed = Boolean(event.data.error || !event.data.result?.supported);
        state.propsApplied = !state.propsFailed;
        state.propsRequest = '';
      }
      // Capture never claims base pixels while a displayed cell override is pending.
      if (state.sandbox && state.variant && options.propsOverride && !state.propsApplied && !state.propsRequest && !state.propsFailed) {
        state.propsRequest = 'capture-' + state.nonce + '-' + (++state.propsVersion);
        frame.contentWindow.postMessage({ __histoire: true, type: options.propsType, props: options.propsOverride, requestId: state.propsRequest, documentId, storyId: state.storyId, variantId: state.variantId, mcpNonce: state.nonce, mcpEpoch: state.epoch }, options.authority.origin);
      }
      state.ready = state.sandbox && state.variant && state.propsApplied && !state.propsFailed;
    });
    window.addEventListener('pagehide', () => { state.active = false; state.ready = false; });
    ${renderPreviewTestScript()}
    frame.src = options.sandboxUrl;
    document.body.appendChild(frame);
  })();`
}
