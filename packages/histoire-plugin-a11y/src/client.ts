import type { WorkbenchContext } from '@histoire/plugin-kit'
import { defineWorkbenchPlugin, installPluginStyles } from '@histoire/plugin-kit'
import { defineWorkbenchComponent } from '@histoire/plugin-kit/vue'
import { defineComponent, h, nextTick } from 'vue'
import AuditPanel from './workbench/AuditPanel.vue'
import { createAuditModel } from './workbench/model.js'
import { violationBadge } from './workbench/project-model.js'
import { createProjectSource, createReportLookup } from './workbench/project-source.js'
import ProjectPanel from './workbench/ProjectPanel.vue'
import css from './workbench/styles.css?inline'

export default defineWorkbenchPlugin({
  id: 'a11y',
  apiVersion: 1,
  setup(api) {
    installPluginStyles(document, 'a11y', css, api.signal)
    const model = createAuditModel(api)
    /** Attached actor of the captured selection, never a different variant's frame. */
    function auditFrame(context: WorkbenchContext) {
      const target = context.selection.target
      return target && api.frames.list().find(frame => frame.target.storyId === target.storyId && frame.target.variantId === target.variantId)
    }
    api.commands.add({
      id: 'run-audit',
      label: 'Run audit',
      icon: 'play-filled-alt',
      /** Manual scans require an attached, idle actor of the selected variant. */
      available(context) {
        const frame = auditFrame(context)
        return !!frame && !model.get(frame.key)?.running
      },
      /** Open the channel-owning tab and scan only the originally captured actor. */
      async run(context, { signal }) {
        const frame = auditFrame(context)
        if (!frame) return
        context.navigation.openInspectorTab('a11y:accessibility')
        // The tab owns the audit channel visit; wait for its Vue view before sending a scan.
        await nextTick()
        if (!signal.aborted && api.frames.list().some(current => current.key === frame.key && current.actorId === frame.actorId)) model.run(frame.key)
      },
    })
    api.inspector.addTab({
      id: 'accessibility',
      primaryCommand: 'run-audit',
      label: 'Accessibility',
      icon: 'list-checked',
      badge: context => model.get(context.frame.key)?.report?.violationsCount || null,
      component: defineWorkbenchComponent(defineComponent({
        name: 'AccessibilityInspector',
        props: {
          /** Current frame scope. */
          context: { type: Object, required: true },
        },
        setup: props => () => h(AuditPanel, { context: props.context as any, model }),
      })),
    })
    const flags = (api.options ?? {}) as { tests?: boolean, report?: boolean }
    const tests = flags.tests === true && api.context.capabilities.has('tests')
    const report = flags.report === true && api.context.source.mode === 'static'
    // Project-wide results: live test runs on the dev server, the build report in static books.
    const source = tests || report ? createProjectSource(api, { tests, report }) : undefined
    const projectReport = source && createReportLookup(source)
    api.canvas.addFrameBadge({
      id: 'violations',
      // A live audit of the frame is freshest; other frames show their latest project result.
      badge: context => violationBadge(model.get(context.frame.key)?.report ?? projectReport?.(context.frame.target)),
    })
    if (!source) return
    api.commands.add({
      id: 'run-all',
      label: 'Run all',
      icon: 'play-filled-alt',
      available: () => source.get().canRun && !source.get().running,
      run: () => source.runAll(),
    })
    api.shell.addPane({
      id: 'issues',
      primaryCommand: 'run-all',
      label: 'Accessibility',
      icon: 'list-checked',
      // The view renders its own header holding the Run all action.
      header: false,
      badge: () => source.get().results.filter(result => result.report?.violationsCount).length || null,
      component: defineWorkbenchComponent(defineComponent({
        name: 'AccessibilityProject',
        props: {
          /** Root workbench scope. */
          context: { type: Object, required: true },
        },
        setup: props => () => h(ProjectPanel, { context: props.context as any, source, preferences: api.preferences, model }),
      })),
    })
  },
})
