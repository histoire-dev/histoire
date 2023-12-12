module.exports = process.env.HISTOIRE_DEV
  ? {
    plugins: [
      require('postcss-import'),
      require('tailwindcss/nesting'),
      require('tailwindcss')('./tailwind.config.cjs'),
      require('autoprefixer'),
    ],
  }
  : {
    plugins: [],
  }
