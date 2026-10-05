<script setup lang="ts">
import { HstButton } from '@histoire/controls/vue'
import { computed, ref } from 'vue'
import { mcpClientConfig, mcpStdioClientConfig } from '../../../stores/mcp-activity.js'
import { useMcpStore } from '../../../stores/mcp.js'

const mcp = useMcpStore()
const copied = ref<'http' | 'stdio'>()
const httpConfig = computed(() => mcp.endpoint ? mcpClientConfig(mcp.endpoint) : undefined)
const stdioConfig = computed(() => mcp.stdio ? mcpStdioClientConfig(mcp.stdio) : undefined)
/** Copy only existing safe serializers, including stdio-only server metadata. */
async function copy(kind: 'http' | 'stdio', value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    copied.value = kind
  }
  catch { copied.value = undefined }
}
</script>

<template>
  <section>
    <h1>MCP server</h1><div class="histoire-settings-card">
      <div class="histoire-settings-row">
        <strong>Status</strong><span>{{ mcp.status === 'enabled' ? 'Enabled' : mcp.status === 'unavailable' ? 'Unavailable' : 'Disabled' }}</span>
      </div><template v-if="mcp.endpoint">
        <div class="histoire-settings-row">
          <strong>Endpoint</strong><code>{{ mcp.endpoint }}</code>
        </div>
      </template><template v-if="httpConfig || stdioConfig">
        <div v-if="httpConfig" class="histoire-settings-row">
          <strong>HTTP client configuration</strong><HstButton color="default" type="button" class="histoire-settings-action" @click="copy('http', httpConfig)">
            {{ copied === 'http' ? 'Copied' : 'Copy HTTP config' }}
          </HstButton>
        </div><pre v-if="httpConfig" class="histoire-settings-diff" style="padding: 0 20px 20px">{{ httpConfig }}</pre>
        <div v-if="stdioConfig" class="histoire-settings-row">
          <strong>Stdio client configuration</strong><HstButton color="default" type="button" class="histoire-settings-action" @click="copy('stdio', stdioConfig)">
            {{ copied === 'stdio' ? 'Copied' : 'Copy stdio config' }}
          </HstButton>
        </div><pre v-if="stdioConfig" class="histoire-settings-diff" style="padding: 0 20px 20px">{{ stdioConfig }}</pre>
      </template>
    </div>
  </section>
</template>
