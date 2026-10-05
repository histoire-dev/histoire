<script setup lang="ts">
import { HstButton } from '@histoire/controls/vue'
import { useClipboard } from '@vueuse/core'
import { computed, ref } from 'vue'
import { mcpClientConfig, mcpStdioClientConfig } from '../../../stores/mcp-activity.js'
import { useMcpStore } from '../../../stores/mcp.js'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'

const store = useMcpStore()
const { copy, copied } = useClipboard({ legacy: true })
const copyKind = ref<'endpoint' | 'http' | 'stdio'>('endpoint')
const copyError = ref(false)
const config = computed(() => store.endpoint ? mcpClientConfig(store.endpoint) : undefined)
const stdioConfig = computed(() => store.stdio ? mcpStdioClientConfig(store.stdio) : undefined)

/** Clipboard failure remains visible and does not claim a successful copy. */
async function copyValue(kind: 'endpoint' | 'http' | 'stdio') {
  const value = { endpoint: store.endpoint, http: config.value, stdio: stdioConfig.value }[kind]
  if (!value) return
  copyKind.value = kind
  copyError.value = false
  try {
    await copy(value)
  }
  catch {
    copyError.value = true
  }
}
</script>

<template>
  <section class="histoire-mcp-endpoint" aria-label="MCP endpoint">
    <h3>{{ store.endpoint ? 'Endpoint' : 'Client config' }}</h3>
    <div v-if="store.endpoint">
      <code :title="store.endpoint">{{ store.endpoint }}</code>
      <HstButton color="flat" type="button" :aria-label="copied && copyKind === 'endpoint' ? 'Endpoint copied' : 'Copy endpoint'" @click="copyValue('endpoint')">
        <WorkbenchIcon :name="copied && copyKind === 'endpoint' ? 'checkmark' : 'copy'" />
      </HstButton>
    </div>
    <nav aria-label="Copy MCP client configuration">
      <HstButton v-if="config" color="flat" type="button" class="histoire-mcp-copy-config" @click="copyValue('http')">
        {{ copied && copyKind === 'http' ? 'HTTP config copied' : 'Copy HTTP config' }}
      </HstButton>
      <HstButton v-if="stdioConfig" color="flat" type="button" class="histoire-mcp-copy-config" @click="copyValue('stdio')">
        {{ copied && copyKind === 'stdio' ? 'Stdio config copied' : 'Copy stdio config' }}
      </HstButton>
    </nav>
    <span v-if="copyError" class="histoire-mcp-copy-error" role="alert">Copy unavailable.</span>
  </section>
</template>

<style scoped>
.histoire-mcp-endpoint { padding: 12px; border-radius: 12px; background: var(--histoire-chip); margin-bottom: 20px; }
h3 { margin: 0 0 8px; color: var(--histoire-muted); font-size: 12px; font-weight: 600; }
.histoire-mcp-endpoint > div { display: flex; align-items: center; gap: 10px; }
code { flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: 11px; line-height: 1.6; }
button { flex: none; display: grid; place-items: center; width: 28px; height: 28px; padding: 0; color: var(--histoire-muted); }
button:hover { color: var(--histoire-text); }
button.histoire-mcp-copy-config { display: inline-flex; width: auto; height: auto; margin-top: 8px; padding: 0; background: transparent; font-size: 11px; color: var(--histoire-accent-link); }
nav { display: flex; flex-wrap: wrap; gap: 12px; }
.histoire-mcp-copy-error { display: block; margin-top: 8px; font-size: 11px; color: var(--histoire-danger-text); }
</style>
