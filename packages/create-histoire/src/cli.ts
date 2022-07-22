import degit from 'degit'
import fs from 'node:fs'
import path from 'node:path'
import parser from 'yargs-parser'
import prompts from 'prompts'

function isEmpty (dirPath: string) {
  return !fs.existsSync(dirPath) || fs.readdirSync(dirPath).length === 0
}

function emptyDir (dir: string) {
  if (!fs.existsSync(dir)) return
  for (const file of fs.readdirSync(dir)) {
    fs.rmSync(path.resolve(dir, file), { recursive: true, force: true })
  }
}

export async function main () {
  let { _: [name], template } = parser(process.argv.slice(2))
  const templates = fs.readdirSync('../../examples')

  name = (name || (await prompts({
    type: 'text',
    name: 'n',
    message: 'What is the name of your histoire project?',
    initial: 'my-histoire',
  })).n) as string

  template = template && templates.includes(template)
    ? template
    : (await prompts({
      type: 'select',
      name: 't',
      message: 'Select starter template',
      choices: templates.map((t) => ({ title: t, value: t })),
    })).t

  const overwrite = isEmpty(name) || (await prompts({
    type: 'confirm',
    name: 'f',
    message: `Target directory ${name} is not empty.\nRemove existing files and continue?`,
    initial: true,
  })).f

  if (overwrite) {
    emptyDir(name)
  } else if (!fs.existsSync(name)) {
    fs.mkdirSync(name, { recursive: true })
  }

  const emitter = degit(`histoire-dev/histoire/examples/${template}`, { verbose: true })
  emitter.on('warn', (warn) => console.log(warn.message))
  await emitter.clone(name)
    .catch((e) => { console.error(e) })
    .finally(() => { console.log('\nNow go to write your own histoire!') })
}
