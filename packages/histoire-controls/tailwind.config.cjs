const inheritedConfig = require('../../tailwind.config.cjs')

module.exports = {
  ...inheritedConfig,
  content: [
    './src/**/*.{vue,js,ts,jsx,tsx,md}',
  ],
  // corePlugins: {
  //   preflight: false,
  // },
}
