module.exports = {
  ...require('../../tailwind.config.cjs'),
  content: [
    './src/**/*.{vue,js,ts,jsx,tsx,md}',
  ],
  corePlugins: {
    preflight: false,
  },
}
