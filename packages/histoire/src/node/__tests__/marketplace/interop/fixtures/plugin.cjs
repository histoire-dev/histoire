/** Produce a real loadable plugin; options survive config migrations. */
exports.TestPlugin = function TestPlugin(options = {}) {
  return { name: 'interop-test-plugin', options }
}
