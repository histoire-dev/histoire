import { defineWorkbenchPlugin, installPluginStyles } from '@histoire/plugin-kit'
import { defineWorkbenchComponent } from '@histoire/plugin-kit/vue'
import { defineComponent, h } from 'vue'
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
    api.inspector.addTab({
      id: 'accessibility',
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
    api.shell.addPane({
      id: 'issues',
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
