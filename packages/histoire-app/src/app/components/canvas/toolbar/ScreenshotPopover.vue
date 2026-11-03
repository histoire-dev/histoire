<script setup lang="ts">
import type { ScreenshotSetupSnapshot, UiChannelError, UiScreenshotFile, UiScreenshotRequest } from '@histoire/shared'
import { BuiltinIcon, HstButton, HstButtonGroup } from '@histoire/controls/vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useCanvasFrames, useCanvasStore } from '../../../composables/canvas-settings.js'
import { getBackgroundCapture } from '../../../util/background.js'
import { catalogTargetLabel } from '../../../util/catalog-target.js'
import { screenshotFileDetails, screenshotUrl } from '../../../util/screenshot-file.js'
import { snapshotScreenshotTargets } from '../../../util/screenshot-targets.js'
import { onUiDisconnect, onUiEvent, sendUiEvent } from '../../../util/ui-channel.js'
import PopoverDivider from '../../base/popover/PopoverDivider.vue'
import PopoverError from '../../base/popover/PopoverError.vue'

import PopoverTitle from '../../base/popover/PopoverTitle.vue'
import { useCaptureDiscoveryPause } from '../../panes/tests/capture.js'
import { getSelectedCanvasFrame } from '../frame-target.js'
import ScreenshotSetup from './ScreenshotSetup.vue'
import { useCanvasPreviewSettings } from './session-settings.js'
import ToolbarPopover from './ToolbarPopover.vue'
import { useScreenshotSetup } from './use-screenshot-setup.js'

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
const capturedSetup = ref<ScreenshotSetupSnapshot | null>(null)
const screenshotSetup = useScreenshotSetup()
/** A previous ready snapshot cannot admit captures during a check or after its failure. */
const setupReady = computed(() => !screenshotSetup.checking.value && !screenshotSetup.error.value && screenshotSetup.snapshot.value?.state === 'ready')
const message = ref('')
const copied = ref('')
const listRequest = ref('')
const allTargets = computed(() => props.targets ?? [...registry.frames.values()].filter(frame => frame.storyId === props.storyId).map(frame => ({ storyId: frame.storyId, variantId: frame.variantId, ...(frame.propsOverride ? { frameKey: frame.id, propsOverride: frame.propsOverride } : {}) })))
const selectedFrame = computed(() => getSelectedCanvasFrame(registry, canvas, snapshot.value.selection))
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
  if (!setupReady.value || requestId.value || !targets.value.length) return
  const frame = selectedFrame.value
  const settings = snapshot.value.settings
  const viewport = props.viewport ?? { width: frame?.rect.width ?? settings.responsiveWidth ?? 1024, height: frame?.rect.height ?? settings.responsiveHeight ?? 640 }
  const background = frame && canvas.frameBackgrounds[frame.id] ? canvas.frameBackgrounds[frame.id] : settings
  error.value = null
  capturedSetup.value = null
  message.value = ''
  if (targets.value.length > 64) {
    error.value = { code: 'invalid', message: 'Capture up to 64 frames at once' }
    return
  }
  requestId.value = identity()
  try {
    const captured = snapshotScreenshotTargets(targets.value)
    if (sendUiEvent('histoire:ui:screenshot', { requestId: requestId.value, targets: captured, viewport: { width: Math.round(viewport.width), height: Math.round(viewport.height) }, scale: scale.value, format: format.value, background: getBackgroundCapture(background) })) return
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

const disposers = [
  onUiEvent('histoire:ui:screenshot-result', (result) => {
    if (result.requestId !== requestId.value) return
    requestId.value = null
    if ('error' in result) {
      error.value = result.error
      capturedSetup.value = result.error.setup ?? null
      return
    }
    capturedSetup.value = result.setup ?? null
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
watch(capturedSetup, value => screenshotSetup.acceptCaptureSetup(value))
watch(() => open.value === 'screenshot', (opened) => {
  if (!opened) return
  screenshotSetup.checkSetup()
  listRequest.value = identity()
  sendUiEvent('histoire:ui:screenshot-list', { requestId: listRequest.value })
}, { immediate: true })
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
    <div class="htw:p-[2px_8px_8px]">
      <template v-if="setupReady">
        <PopoverTitle>
          Screenshot
        </PopoverTitle>
        <HstButtonGroup v-model="scope" title="Frames" aria-label="Capture frames" layout="horizontal" :options="[{ value: 'selected', label: 'Selected' }, { value: 'all', label: `All ${allTargets.length}` }]" />
        <HstButtonGroup v-model="scale" title="Scale" aria-label="Screenshot scale" layout="horizontal" :options="[1, 2, 3].map(value => ({ value, label: `${value}×` }))" />
        <HstButtonGroup v-model="format" title="Format" aria-label="Screenshot format" layout="horizontal" :options="[{ value: 'png', label: 'PNG' }, { value: 'webp', label: 'WebP' }]" />
        <div class="htw:flex htw:items-center htw:justify-between htw:gap-[14px] htw:min-h-[42px] htw:text-muted htw:text-[12px]">
          <span>Save to</span><code class="htw:text-text htw:text-[11px]">.histoire/screenshots/</code>
        </div>
        <HstButton v-if="!requestId" color="primary" type="button" class="htw:w-full htw:min-h-9 htw:my-2.5 htw:mx-0 htw:font-bold" :disabled="!targets.length" @click="capture">
          <BuiltinIcon icon="camera" :size="15" />Capture {{ targets.length }} frame{{ targets.length === 1 ? '' : 's' }}
        </HstButton>
        <HstButton v-else color="primary" type="button" class="htw:w-full htw:min-h-9 htw:my-2.5 htw:mx-0 htw:font-bold" @click="cancel">
          Cancel capture
        </HstButton>
        <p v-if="message" class="capture-message htw:my-1.5 htw:mx-0 htw:text-muted htw:text-[11px]" role="status">
          {{ message }}
        </p>
        <PopoverError v-if="error" role="alert">
          {{ error.message }}
        </PopoverError>
        <template v-if="recent.length">
          <PopoverDivider /><PopoverTitle>
            Recent
          </PopoverTitle>
          <div v-for="file in recentFiles" :key="file.path" class="recent-capture htw:flex htw:items-center htw:gap-2.5 htw:my-3 htw:mx-0">
            <img class="htw:flex-[0_0_48px] htw:w-12 htw:h-[34px] htw:object-contain htw:border htw:border-solid htw:border-border htw:rounded-[5px] htw:bg-white" :src="screenshotUrl(file.path)" alt="" loading="lazy"><span class="htw:flex-1 htw:min-w-0" :title="file.metadata"><strong class="htw:block htw:[overflow-wrap:anywhere] htw:text-[11px] htw:font-semibold">{{ file.label }}</strong><small class="htw:flex htw:flex-wrap htw:gap-y-0.5 htw:gap-x-2 htw:mt-[3px] htw:text-muted htw:text-[10px]"><time v-if="file.capturedAt" class="htw:whitespace-nowrap htw:[font:inherit]" :datetime="file.capturedAt">{{ file.time }}</time><code class="htw:whitespace-nowrap htw:[font:inherit]">{{ file.shortName }}</code></small></span><HstButton class="htw:grid htw:place-items-center" icon-only color="flat" type="button" :aria-label="`Copy path for ${file.label}`" :title="copied === file.path ? 'Copied' : 'Copy path'" @click="copyPath(file.path)">
              <BuiltinIcon :icon="copied === file.path ? 'checkmark' : 'copy'" :size="14" />
            </HstButton>
          </div>
        </template>
      </template>
      <ScreenshotSetup v-else :controller="screenshotSetup" />
    </div>
  </ToolbarPopover>
</template>
