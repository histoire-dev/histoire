// https://github.com/vitejs/vite/issues/9661
const alias = {
  '@histoire/vendors/vue': 'histoire/dist/node/vendors/vue.js',
  '@histoire/controls': 'histoire/dist/node/vendors/controls.js',
}

export function getInjectedImport (request: string) {
  let id: string = request

  if (alias[id]) {
    id = alias[id]
  }

  return JSON.stringify(id)
}
