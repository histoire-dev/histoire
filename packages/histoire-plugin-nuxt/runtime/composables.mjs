import { useNuxtApp as useNuxtAppOriginal } from 'nuxt/app'

function parseOptionalRegexp(_key, value) {
  const regexpMatcher = /^__REGEXP:\/(.*)\/([gimsuy]{0,6})$/
  const m = regexpMatcher.exec(value)
  if (!m) {
    return value
  }
  return new RegExp(m[1], m[2])
}

function shallowClone(obj) {
  return Object.create(
    Object.getPrototypeOf(obj),
    Object.getOwnPropertyDescriptors(obj)
  );
}

function findValueFunc(value) {
  return function(item) {
    if (typeof item === 'string') {
      return (item === value)
    }
    if (item instanceof RegExp) {
      return item.test(value)
    }
    throw new TypeError('Invalid type of entry in include/exclude array')
  }
}

function nuxtAppInclusion(originalApp, include) {
  if (include === '*') {
    return shallowClone(originalApp)
  }

  if (!Array.isArray(include)) {
    throw new TypeError('Include has to be the string \'*\' or an array of strings or RegExps')
  }

  const nuxtAppClone = Object.create(Object.getPrototypeOf(originalApp));
  Object.getOwnPropertyNames(originalApp).forEach((key) => {
    if (include.find(findValueFunc(key))) {
      const descriptor = Object.getOwnPropertyDescriptor(originalApp, key);
      Object.defineProperty(nuxtAppClone, key, descriptor);
    }
  })
  return nuxtAppClone
}

function nuxtAppExclusion(originalApp, exclude) {
  if (!Array.isArray(exclude)) {
    throw new TypeError('Exclude has to be an array of strings or RegExps')
  }

  const nuxtAppClone = Object.create(Object.getPrototypeOf(originalApp));
  Object.getOwnPropertyNames(originalApp).forEach((key) => {
    if (!exclude.find(findValueFunc(key))) {
      const descriptor = Object.getOwnPropertyDescriptor(originalApp, key);
      Object.defineProperty(nuxtAppClone, key, descriptor);
    }
  })
  return nuxtAppClone
}

function deriveNuxtApp(originalApp, settings) {
  if (settings.mock && !settings.include && !settings.exclude) {
    return { ...settings.mock }
  }

  const nuxtAppClone = settings.include
    ? nuxtAppInclusion(originalApp, settings.include)
    : nuxtAppExclusion(originalApp, settings.exclude)

  // @TODO: Do we want a recursive merge strategy for the mock?
  Object.getOwnPropertyNames(settings.mock).forEach((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(settings.mock, key);
    Object.defineProperty(nuxtAppClone, key, descriptor);
  })
  return nuxtAppClone
}

export function useNuxtApp() {
  const nuxtAppOriginal = useNuxtAppOriginal()
  const options = nuxtAppOriginal.$config.public?.histoireNuxtPluginOptions
    ? JSON.parse(nuxtAppOriginal.$config.public.histoireNuxtPluginOptions, parseOptionalRegexp)
    : {}
  const settings = options?.nuxtAppMockSettings ?? { mock: {} }
  const nuxtApp1 = deriveNuxtApp(nuxtAppOriginal, settings)
  nuxtApp1.runWithContext = nuxtAppOriginal.runWithContext
  return nuxtApp1
}
