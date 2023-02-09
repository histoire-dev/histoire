import type { PluginCommand } from '@histoire/shared'
import type { Context } from '../context.js'

const serializedFields: Readonly<(keyof PluginCommand)[]> = ['id', 'label', 'prompts', 'icon', 'searchText'] as const

export const resolvedCommands = (ctx: Context) => {
  const imports: string[] = []
  const commands: string[] = []
  let uid = 0
  for (const command of ctx.registeredCommands) {
    const fields: string[] = []

    for (const field of serializedFields) {
      if (command[field] != null) {
        fields.push(`${field}: ${JSON.stringify(command[field])}`)
      }
    }

    // Add client-side data
    if (command.clientSetupFile) {
      const importedVar = `__setup${uid++}__`
      if (typeof command.clientSetupFile === 'string') {
        imports.push(`import ${importedVar} from '${command.clientSetupFile}'`)
      } else {
        imports.push(`import { ${command.clientSetupFile.importName} as ${importedVar} } from '${command.clientSetupFile.file}'`)
      }
      fields.push(`...${importedVar}`)
    }

    commands.push(`{
${fields.join(',\n  ')}
}`)
  }
  return `${imports.join('\n')}
export const registeredCommands = [${commands.join(',\n')}]`
}
