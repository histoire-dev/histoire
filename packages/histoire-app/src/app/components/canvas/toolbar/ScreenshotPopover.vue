<script setup lang="ts">
import type { UiChannelError, UiScreenshotFile, UiScreenshotRequest } from '@histoire/shared'
import { HstButton, HstButtonGroup } from '@histoire/controls/vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useCanvasFrames, useCanvasStore } from '../../../composables/canvas-settings.js'
import { catalogTargetLabel } from '../../../util/catalog-target.js'
import { screenshotFileDetails } from '../../../util/screenshot-file.js'
import { snapshotScreenshotTargets } from '../../../util/screenshot-targets.js'
import { onUiDisconnect, onUiEvent, sendUiEvent } from '../../../util/ui-channel.js'
import { useCaptureDiscoveryPause } from '../../panes/tests/capture.js'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'
import { useCanvasPreviewSettings } from './session-settings.js'
import ToolbarPopover from './ToolbarPopover.vue'

/** Canvas selection supplies exact story identity without route/global coupling. */
const props = defineProps<{
  /** Current story identifier. */
  storyId: string
  /** Current selected variant. */
  variantId?: string
  /** Optional target list including budget placeholders. */
  targets?: UiScreenshotRequest['targets']
  /** Optional explicit CSS capture viewport. */
  viewport?: { width: number, height: number }
  /** Shared toolbar popover identity. */
  open?: string | null
  /** Context menu request counter. */
  trigger?: number
}>()
const emit = defineEmits<{ 'update:open': [value: string | null] }>()
const canvas = useCanvasStore()
const registry = useCanvasFrames()
const { snapshot } = useCanvasPreviewSettings()
const localOpen = ref<string | null>(null)
const open = computed(() => props.open === undefined ? localOpen.value : props.open)
const scope = ref<'selected' | 'all'>('selected')
const scale = ref<1 | 2 | 3>(1)
const format = ref<'png' | 'webp'>('png')
const requestId = ref<string | null>(null)
useCaptureDiscoveryPause(requestId)
const recent = ref<UiScreenshotFile[]>([])
const error = ref<UiChannelError | null>(null)
const message = ref('')
const copied = ref('')
const listRequest = ref('')
const allTargets = computed(() => props.targets ?? [...registry.frames.values()].filter(frame => frame.storyId === props.storyId).map(frame => ({ storyId: frame.storyId, variantId: frame.variantId, ...(frame.propsOverride ? { frameKey: frame.id, propsOverride: frame.propsOverride } : {}) })))
const selectedFrame = computed(() => canvas.selectedFrame ? registry.getFrame(canvas.selectedFrame) : null)
const targets = computed(() => scope.value === 'all' ? allTargets.value : selectedFrame.value ? allTargets.value.filter(target => target.frameKey ? target.frameKey === selectedFrame.value?.id : target.variantId === selectedFrame.value?.variantId).slice(0, 1) : [{ storyId: props.storyId, variantId: props.variantId ?? '' }].filter(target => target.variantId))
const recentFiles = computed(() => recent.value.slice(0, 5).map((file) => {
  const details = screenshotFileDetails(file.path)
  const label = catalogTargetLabel(file, snapshot.value.catalog)
  const date = details.capturedAt ? new Date(details.capturedAt) : null
  return { ...file, ...details, label, time: date?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }), metadata: [label, `${file.storyId} · ${file.variantId}`, file.frameKey, file.path, date?.toLocaleString()].filter(Boolean).join('\n') }
}))

/** Shared toolbar owns dismissal when supplied; standalone slot can own it locally. */
function setOpen(value: string | null) {
  localOpen.value = value
  emit('update:open', value)
}

/** Random correlation prevents another browser's reply settling this request. */
function identity() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Submit CSS size, device scale, and preview background through the shared lane. */
function capture() {
  if (requestId.value || !targets.value.length) return
  const frame = selectedFrame.value
  const settings = snapshot.value.settings
  const viewport = props.viewport ?? { width: frame?.rect.width ?? settings.responsiveWidth ?? 1024, height: frame?.rect.height ?? settings.responsiveHeight ?? 640 }
  const background = frame && canvas.frameBackgrounds[frame.id] ? canvas.frameBackgrounds[frame.id] : settings
  error.value = null
  message.value = ''
  if (targets.value.length > 64) {
    error.value = { code: 'invalid', message: 'Capture up to 64 frames at once' }
    return
  }
  requestId.value = identity()
  try {
    const captured = snapshotScreenshotTargets(targets.value)
    if (sendUiEvent('histoire:ui:screenshot', { requestId: requestId.value, targets: captured, viewport: { width: Math.round(viewport.width), height: Math.round(viewport.height) }, scale: scale.value, format: format.value, background: background.checkerboard ? '$checkerboard' : background.backgroundColor })) return
    requestId.value = null
    error.value = { code: 'unavailable', message: 'Screenshot service unavailable' }
  }
  catch {
    requestId.value = null
    error.value = { code: 'invalid', message: 'Capture request must fit 64 KB with JSON props under 16 KB per frame' }
  }
}

/** Cancel this exact browser request, leaving MCP and other tabs untouched. */
function cancel() {
  if (requestId.value) sendUiEvent('histoire:ui:screenshot-cancel', { requestId: requestId.value })
}

/** Clipboard failures remain visible without claiming successful copying. */
async function copyPath(path: string) {
  try {
    await navigator.clipboard.writeText(path)
    copied.value = path
  }
  catch { message.value = 'Copy unavailable' }
}

/** File inventory uses project-relative names; image delivery stays same-origin dev-only. */
function imageUrl(file: UiScreenshotFile) {
  return `${import.meta.env.BASE_URL}__histoire/screenshots/${encodeURIComponent(file.path.split('/').pop()!)}`
}

const disposers = [
  onUiEvent('histoire:ui:screenshot-result', (result) => {
    if (result.requestId !== requestId.value) return
    requestId.value = null
    if ('error' in result) {
      error.value = result.error
      return
    }
    recent.value = [...result.files.slice().reverse(), ...recent.value].slice(0, 20)
    message.value = result.errors?.length ? `${result.files.length} captured, ${result.errors.length} failed` : `${result.files.length} frame${result.files.length === 1 ? '' : 's'} captured`
    error.value = result.errors?.[0]?.error ?? null
  }),
  onUiEvent('histoire:ui:screenshot-list-result', (result) => { if (result.requestId === listRequest.value) recent.value = result.files }),
  onUiDisconnect(() => {
    requestId.value = null
    error.value = { code: 'unavailable', message: 'Screenshot service unavailable' }
  }),
]
watch(() => open.value === 'screenshot', (opened) => {
  if (!opened) return
  listRequest.value = identity()
  sendUiEvent('histoire:ui:screenshot-list', { requestId: listRequest.value })
})
watch(() => props.trigger, () => {
  scope.value = 'selected'
  setOpen('screenshot')
})
onBeforeUnmount(() => {
  cancel()
  disposers.forEach(dispose => dispose())
})
</script>

<template>
  <ToolbarPopover id="screenshot" :open="open" label="Screenshot" icon="camera" :width="330" @update:open="setOpen">
    <div class="screenshot-content">
      <p class="popover-title">
        Screenshot
      </p>
      <HstButtonGroup v-model="scope" title="Frames" aria-label="Capture frames" layout="horizontal" :options="[{ value: 'selected', label: 'Selected' }, { value: 'all', label: `All ${allTargets.length}` }]" />
      <HstButtonGroup v-model="scale" title="Scale" aria-label="Screenshot scale" layout="horizontal" :options="[1, 2, 3].map(value => ({ value, label: `${value}×` }))" />
      <HstButtonGroup v-model="format" title="Format" aria-label="Screenshot format" layout="horizontal" :options="[{ value: 'png', label: 'PNG' }, { value: 'webp', label: 'WebP' }]" />
      <div class="screenshot-option">
        <span>Save to</span><code>.histoire/screenshots/</code>
      </div>
      <HstButton v-if="!requestId" color="primary" type="button" class="screenshot-capture" :disabled="!targets.length" @click="capture">
        <WorkbenchIcon name="camera" />Capture {{ targets.length }} frame{{ targets.length === 1 ? '' : 's' }}
      </HstButton>
      <HstButton v-else color="primary" type="button" class="screenshot-capture" @click="cancel">
        Cancel capture
      </HstButton>
      <p v-if="message" class="capture-message" role="status">
        {{ message }}
      </p>
      <p v-if="error" class="popover-error" role="alert">
        {{ error.message }}
      </p>
      <template v-if="recent.length">
        <div class="popover-divider" /><p class="popover-title">
          Recent
        </p>
        <div v-for="file in recentFiles" :key="file.path" class="recent-capture">
          <img :src="imageUrl(file)" alt="" loading="lazy"><span :title="file.metadata"><strong>{{ file.label }}</strong><small><time v-if="file.capturedAt" :datetime="file.capturedAt">{{ file.time }}</time><code>{{ file.shortName }}</code></small></span><HstButton color="flat" type="button" :aria-label="`Copy path for ${file.label}`" :title="copied === file.path ? 'Copied' : 'Copy path'" @click="copyPath(file.path)">
            <WorkbenchIcon :name="copied === file.path ? 'checkmark' : 'copy'" />
          </HstButton>
        </div>
      </template>
    </div>
  </ToolbarPopover>
</template>

<style scoped>
.screenshot-content { padding: 2px 8px 8px; }
.screenshot-option { display: flex; align-items: center; justify-content: space-between; gap: 14px; min-height: 42px; color: var(--histoire-muted); font-size: 12px; }
.screenshot-option code { color: var(--histoire-text); font-size: 11px; }
.screenshot-capture { width: 100%; min-height: 36px; margin: 10px 0; font-weight: 700; }
.screenshot-capture :deep(svg) { width: 15px; height: 15px; }
.capture-message { margin: 6px 0; color: var(--histoire-muted); font-size: 11px; }
.recent-capture { display: flex; align-items: center; gap: 10px; margin: 12px 0; }
.recent-capture img { flex: 0 0 48px; width: 48px; height: 34px; object-fit: contain; border: 1px solid var(--histoire-border); border-radius: 5px; background: white; }
.recent-capture > span { flex: 1; min-width: 0; }
.recent-capture strong { display: block; overflow-wrap: anywhere; font-size: 11px; font-weight: 600; }
.recent-capture small { display: flex; flex-wrap: wrap; gap: 2px 8px; margin-top: 3px; color: var(--histoire-muted); font-size: 10px; }
.recent-capture code, .recent-capture time { white-space: nowrap; font: inherit; }
.recent-capture button { display: grid; place-items: center; }
.recent-capture button :deep(svg) { width: 14px; height: 14px; }
</style>
