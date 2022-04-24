import { BasePluginApi, Plugin } from '../plugin.js'
import { findUp } from '../util/find-up.js'

export interface TailwindTokensOptions {
  configFile?: string
}

export function tailwindTokens (options: TailwindTokensOptions = {}): Plugin {
  const tailwindConfigFile = options.configFile ?? findUp(process.cwd(), [
    'tailwind.config.js',
    'tailwind.config.cjs',
    'tailwind.config.mjs',
    'tailwind.config.ts',
    'tailwind-config.js',
    'tailwind-config.cjs',
    'tailwind-config.mjs',
    'tailwind-config.ts',
  ])

  async function generate (api: BasePluginApi) {
    try {
      await api.fs.ensureDir(api.pluginTempDir)
      await api.fs.emptyDir(api.pluginTempDir)
      api.moduleLoader.clearCache()
      const tailwindConfig = await api.moduleLoader.loadModule(tailwindConfigFile)
      const { default: resolveConfig } = await import('tailwindcss/resolveConfig.js')
      const resolvedTailwindConfig = resolveConfig(tailwindConfig)
      const storyFile = api.path.resolve(api.pluginTempDir, 'Tailwind.story.vue')
      await api.fs.writeFile(storyFile, storyTemplate(resolvedTailwindConfig))
      api.addStoryFile(storyFile)
    } catch (e) {
      api.error(e.stack ?? e.message)
    }
  }

  return {
    name: 'tailwind-tokens',

    config (config) {
      if (tailwindConfigFile) {
        // Add 'design-system' group
        if (!config.tree) {
          config.tree = {}
        }
        if (!config.tree.groups) {
          config.tree.groups = []
        }
        if (!config.tree.groups.some(g => g.id === 'design-system')) {
          let index = 0
          // After 'top' group
          const topIndex = config.tree.groups.findIndex(g => g.id === 'top')
          if (topIndex > -1) {
            index = topIndex + 1
          }
          // Insert group
          config.tree.groups.splice(index, 0, {
            id: 'design-system',
            title: 'Design System',
          })
        }
      }
    },

    onDev (api, onCleanup) {
      if (tailwindConfigFile) {
        const watcher = api.watcher.watch(tailwindConfigFile)
          .on('change', () => generate(api))
          .on('add', () => generate(api))
        onCleanup(() => {
          watcher.close()
        })
      }
    },

    async onBuild (api) {
      if (tailwindConfigFile) {
        await generate(api)
      }
    },
  }
}

const storyTemplate = (tailwindConfig: any) => `<script setup>
import 'histoire/dist/style.css'
import { ref } from 'vue'
const config = ${JSON.stringify(tailwindConfig, null, 2)}
const search = ref('')
const sampleText = ref('Cat sit like bread eat prawns daintily with a claw then lick paws clean wash down prawns with a lap of carnation milk then retire to the warmest spot on the couch to claw at the fabric before taking a catnap mrow cat cat moo moo lick ears lick paws')
const fontSize = ref(16)
defineExpose({
  search,
  sampleText,
  fontSize,
})
</script>
<template>
  <Story id="tailwind" title="Tailwind" group="design-system" icon="mdi:tailwind" responsiveDisabled>
    <Variant id="background-color" title="Background Color" icon="carbon:color-palette">
      <HstColorShades
        v-for="(shades, key) of config.theme.backgroundColor"
        :key="key"
        :shades="typeof shades === 'object' ? shades : { DEFAULT: shades }"
        :get-name="shade => (config.prefix ?? '') + (shade === 'DEFAULT' ? \`bg-\${key}\` : \`bg-\${key}-\${shade}\`)"
        :search="search"
      >
        <template #default="{ color }">
          <div
            class="shade"
            :style="{
              backgroundColor: color,
            }"
          />
        </template>
      </HstColorShades>
      <template #controls>
        <HstText
          v-model="search"
          title="Filter..."
        />
      </template>
    </Variant>
    <Variant id="text-color" title="Text Color" icon="carbon:text-color">
      <HstColorShades
        v-for="(shades, key) of config.theme.textColor"
        :key="key"
        :shades="typeof shades === 'object' ? shades : { DEFAULT: shades }"
        :get-name="shade => (config.prefix ?? '') + (shade === 'DEFAULT' ? \`text-\${key}\` : \`text-\${key}-\${shade}\`)"
        :search="search"
      >
        <template #default="{ color }">
          <div
            class="shade text"
            :style="{
              color: color,
            }"
          >
            Aa
          </div>
        </template>
      </HstColorShades>
      <template #controls>
        <HstText
          v-model="search"
          title="Filter..."
        />
      </template>
    </Variant>
    <Variant id="border-color" title="Border Color" icon="carbon:color-palette">
      <HstColorShades
        v-for="(shades, key) of config.theme.borderColor"
        :key="key"
        :shades="typeof shades === 'object' ? shades : { DEFAULT: shades }"
        :get-name="shade => (config.prefix ?? '') + (shade === 'DEFAULT' ? \`border-\${key}\` : \`border-\${key}-\${shade}\`)"
        :search="search"
      >
        <template #default="{ color }">
          <div
            class="shade border"
            :style="{
              borderColor: color,
            }"
          />
        </template>
      </HstColorShades>
      <template #controls>
        <HstText
          v-model="search"
          title="Filter..."
        />
      </template>
    </Variant>
    <Variant id="padding" title="Padding" icon="carbon:area">
      <HstTokenList
        :tokens="config.theme.padding"
        :get-name="key => \`\${config.prefix ?? ''}p-\${key}\`"
      >
        <template #default="{ token }">
          <div class="padding"
            :style="{
              padding: token.value,
            }"
          >
            <div
              class="padding-box"
            />
          </div>
        </template>
      </HstTokenList>
    </Variant>
    <Variant id="margin" title="Margin" icon="carbon:area">
      <HstTokenList
        :tokens="config.theme.margin"
        :get-name="key => \`\${config.prefix ?? ''}m-\${key}\`"
      >
        <template #default="{ token }">
          <div class="margin"
            :style="{
              padding: token.value,
            }"
          >
            <div
              class="margin-box"
            />
          </div>
        </template>
      </HstTokenList>
    </Variant>
    <Variant id="font-size" title="Font Size" icon="carbon:text-font">
      <HstTokenList
        :tokens="config.theme.fontSize"
        :get-name="key => \`\${config.prefix ?? ''}text-\${key}\`"
      >
        <template #default="{ token }">
          <div
            class="truncate"
            :style="{
              fontSize: token.value[0],
              ...token.value[1],
            }"
          >
            {{ sampleText }}
          </div>
        </template>
      </HstTokenList>
      <template #controls>
        <HstTextarea
          v-model="sampleText"
          title="Sample text"
          rows="5"
        />
      </template>
    </Variant>
    <Variant id="font-weight" title="Font Weight" icon="carbon:text-font">
      <HstTokenList
        :tokens="config.theme.fontWeight"
        :get-name="key => \`\${config.prefix ?? ''}font-\${key}\`"
      >
        <template #default="{ token }">
          <div
            class="truncate"
            :style="{
              fontWeight: token.value,
              fontSize: \`\${fontSize}px\`,
            }"
          >
            {{ sampleText }}
          </div>
        </template>
      </HstTokenList>
      <template #controls>
        <HstTextarea
          v-model="sampleText"
          title="Sample text"
          rows="5"
        />
        <HstNumber
          v-model="fontSize"
          title="Font size"
          min="1"
        />
      </template>
    </Variant>
    <Variant id="font-family" title="Font Family" icon="carbon:text-font">
      <HstTokenList
        :tokens="config.theme.fontFamily"
        :get-name="key => \`\${config.prefix ?? ''}font-\${key}\`"
      >
        <template #default="{ token }">
          <div
            class="truncate"
            :style="{
              fontFamily: token.value,
              fontSize: \`\${fontSize}px\`,
            }"
          >
            {{ sampleText }}
          </div>
        </template>
      </HstTokenList>
      <template #controls>
        <HstTextarea
          v-model="sampleText"
          title="Sample text"
          rows="5"
        />
        <HstNumber
          v-model="fontSize"
          title="Font size"
          min="1"
        />
      </template>
    </Variant>
    <Variant id="letter-spacing" title="Letter Spacing" icon="carbon:text-font">
      <HstTokenList
        :tokens="config.theme.letterSpacing"
        :get-name="key => \`\${config.prefix ?? ''}tracking-\${key}\`"
      >
        <template #default="{ token }">
          <div
            class="truncate"
            :style="{
              letterSpacing: token.value,
              fontSize: \`\${fontSize}px\`,
            }"
          >
            {{ sampleText }}
          </div>
        </template>
      </HstTokenList>
      <template #controls>
        <HstTextarea
          v-model="sampleText"
          title="Sample text"
          rows="5"
        />
        <HstNumber
          v-model="fontSize"
          title="Font size"
          min="1"
        />
      </template>
    </Variant>
    <Variant id="line-height" title="Line Height" icon="carbon:text-font">
      <HstTokenList
        :tokens="config.theme.lineHeight"
        :get-name="key => \`\${config.prefix ?? ''}leading-\${key}\`"
      >
        <template #default="{ token }">
          <div
            :style="{
              lineHeight: token.value,
              fontSize: \`\${fontSize}px\`,
            }"
          >
            {{ sampleText }}
          </div>
        </template>
      </HstTokenList>
      <template #controls>
        <HstTextarea
          v-model="sampleText"
          title="Sample text"
          rows="5"
        />
        <HstNumber
          v-model="fontSize"
          title="Font size"
          min="1"
        />
      </template>
    </Variant>
    <Variant id="drop-shadow" title="Drop Shadow" icon="carbon:shape-except">
      <HstTokenGrid
        :tokens="config.theme.dropShadow"
        :get-name="key => (config.prefix ?? '') + (key === 'DEFAULT' ? 'drop-shadow' : \`drop-shadow-\${key}\`)"
        :col-size="180"
      >
        <template #default="{ token }">
          <div
            class="drop-shadow"
            :style="{
              filter: \`\${(Array.isArray(token.value) ? token.value : [token.value]).map(v => \`drop-shadow(\${v})\`).join(' ')}\`,
            }"
          />
        </template>
      </HstTokenGrid>
    </Variant>
    <Variant id="border-radius" title="Border Radius" icon="carbon:condition-wait-point">
      <HstTokenGrid
        :tokens="config.theme.borderRadius"
        :get-name="key => (config.prefix ?? '') + (key === 'DEFAULT' ? 'rounded' : \`rounded-\${key}\`)"
        :col-size="180"
      >
        <template #default="{ token }">
          <div
            class="border-radius"
            :style="{
              borderRadius: token.value,
            }"
          />
        </template>
      </HstTokenGrid>
    </Variant>
    <Variant id="border-width" title="Border Width" icon="carbon:checkbox">
      <HstTokenGrid
        :tokens="config.theme.borderWidth"
        :get-name="key => (config.prefix ?? '') + (key === 'DEFAULT' ? 'border' : \`border-\${key}\`)"
        :col-size="180"
      >
        <template #default="{ token }">
          <div
            class="border-width"
            :style="{
              borderWidth: token.value,
            }"
          />
        </template>
      </HstTokenGrid>
    </Variant>
    <Variant id="width" title="Width" icon="carbon:pan-horizontal">
      <HstTokenList
        :tokens="config.theme.width"
        :get-name="key => (config.prefix ?? '') + (key === 'DEFAULT' ? 'w' : \`w-\${key}\`)"
      >
        <template #default="{ token }">
          <div class="width">
            <div
              class="width-box"
              :style="{
                width: token.value,
              }"
            />
          </div>
        </template>
      </HstTokenList>
    </Variant>
    <Variant id="height" title="Height" icon="carbon:pan-vertical">
      <HstTokenList
        :tokens="config.theme.height"
        :get-name="key => (config.prefix ?? '') + (key === 'DEFAULT' ? 'h' : \`h-\${key}\`)"
      >
        <template #default="{ token }">
          <div
            class="height"
            :style="{
              height: token.value,
            }"
          />
        </template>
      </HstTokenList>
    </Variant>
    <Variant id="full-config" title="Full Config" icon="carbon:code">
      <pre>{{ config }}</pre>
    </Variant>
  </Story>
</template>
<style scoped>
.shade {
  height: 80px;
  border-radius: 4px;
}

.text {
  font-size: 4rem;
  display: flex;
  align-items: flex-end;
}

.border {
  border-style: solid;
  border-width: 2px;
}

.padding {
  background-color: rgb(113 113 122 / 0.1);
  width: min-content;
}

.margin {
  border: dashed 1px rgb(113 113 122 / 0.5);
  width: min-content;
}

.padding-box,
.margin-box {
  width: 5rem;
  height: 5rem;
  background-color: rgb(113 113 122 / 0.5);
}

.padding,
.padding-box,
.margin,
.margin-box,
.drop-shadow {
  border-radius: 4px;
}

.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drop-shadow {
  width: 8rem;
  height: 8rem;
  background: white;
  margin-bottom: 0.5rem;
}

.dark .drop-shadow {
  background: #4e4e57;
}

.border-radius {
  width: 8rem;
  height: 8rem;
  background-color: rgb(113 113 122 / 0.5);
}

.border-width {
  width: 8rem;
  height: 8rem;
  border-color: rgb(113 113 122 / 0.5);
  background-color: rgb(113 113 122 / 0.1);
}

.width {
  background-color: rgb(113 113 122 / 0.1);
}

.width-box,
.height {
  background-color: rgb(113 113 122 / 0.5);
}

.width-box {
  height: 5rem;
}
</style>`
