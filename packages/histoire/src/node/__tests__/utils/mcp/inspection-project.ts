import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createMcpCaptureProject } from './capture-project.js'

/** One real Vue variant exercises state, runtime prop metadata, DOM, ARIA and failures. */
export async function createMcpInspectionProject() {
  const fixture = await createMcpCaptureProject()
  await writeFile(resolve(fixture.root, 'Deterministic.story.vue'), `<script setup lang="ts">
import { defineComponent, h, onMounted, toRaw } from 'vue'
const InspectButton = defineComponent({ name: 'InspectButton', props: { label: { type: String, default: 'Save' }, disabled: { type: Boolean, default: false } }, setup: props => () => h('button', { 'aria-label': props.label, 'data-test-id': 'inspect-button', disabled: props.disabled }, props.label) })
const GetterState = defineComponent({ props: ['state'], setup: props => { onMounted(() => Object.defineProperty(toRaw(props.state), 'computed', { enumerable: true, get: () => 'private-computed' })); return () => null } })
function initState() { return { count: 3, nested: { enabled: true } } }
onMounted(() => { console.warn('inspection fixture warning'); void fetch('/inspection-missing.json?token=hidden').catch(() => {}) })
</script>
<template><Story id="deterministic" title="Inspection fixture" :init-state="initState"><Variant id="normal"><template #default="{ state }"><GetterState :state="state" /><section id="inspection-root"><InspectButton label="Save" /><label>Name<input aria-label="Name" /></label><input type="password" value="private-password" /><p>Ready</p></section></template></Variant></Story></template>`)
  return fixture
}
