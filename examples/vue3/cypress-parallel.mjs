// @TODO move to playwright

import fs from 'fs/promises'
import { globby } from 'globby'
import minimatch from 'minimatch'
import { exec } from 'child_process'

const totalRunners = parseInt(process.env.TOTAL_RUNNERS)
const thisRunner = parseInt(process.env.THIS_RUNNER)

// These are the same properties that are set in cypress.config.
// In practice, it's better to export these from another file, and
// import them here and in cypress.config, so that both files use
// the same values.
const specPatterns = {
  specPattern: './cypress/integration/*.{ts,tsx,js,jsx}',
  excludeSpecPattern: ['tsconfig.json'],
}

// used to roughly determine how many tests are in a file
const testPattern = /(^|\s)(it|test)\(/g

async function getTestCount (filePath) {
  const content = await fs.readFile(filePath, 'utf8')
  return content.match(testPattern)?.length || 0
}

// adapated from:
// https://github.com/bahmutov/find-cypress-specs/blob/main/src/index.js
async function getSpecFilePaths () {
  const options = specPatterns

  const files = await globby(options.specPattern, {
    ignore: options.excludeSpecPattern,
  })

  // go through the files again and eliminate files that match
  // the ignore patterns
  const ignorePatterns = [...(options.excludeSpecPattern || [])]

  // a function which returns true if the file does NOT match
  // all of our ignored patterns
  const doesNotMatchAllIgnoredPatterns = (file) => {
    // using {dot: true} here so that folders with a '.' in them are matched
    // as regular characters without needing an '.' in the
    // using {matchBase: true} here so that patterns without a globstar **
    // match against the basename of the file
    const MINIMATCH_OPTIONS = { dot: true, matchBase: true }
    return ignorePatterns.every((pattern) => {
      return !minimatch(file, pattern, MINIMATCH_OPTIONS)
    })
  }

  const filtered = files.filter(doesNotMatchAllIgnoredPatterns)

  return filtered
}

async function sortSpecFilesByTestCount (specPathsOriginal) {
  const specPaths = [...specPathsOriginal]

  const testPerSpec = {}

  for (const specPath of specPaths) {
    testPerSpec[specPath] = await getTestCount(specPath)
  }

  return (
    Object.entries(testPerSpec)
      // Sort by the number of tests per spec file, so that we get a bit closer to
      // splitting up the files evenly between the runners. It won't be perfect,
      // but better than just splitting them randomly. And this will create a
      // consistent file list/ordering so that file division is deterministic.
      .sort((a, b) => b[1] - a[1])
      .map((x) => x[0])
  )
}

export function splitSpecs (specs, totalRunners, thisRunner) {
  return specs.filter((_, index) => index % totalRunners === thisRunner)
}

(async () => {
  try {
    const specFilePaths = await sortSpecFilesByTestCount(await getSpecFilePaths())

    if (!specFilePaths.length) {
      throw Error('No spec files found.')
    }

    const specsToRun = splitSpecs(specFilePaths, totalRunners, thisRunner)

    const command = `yarn cypress run --spec "${specsToRun.join(',')}"`

    console.log(`Running: ${command}`)

    const commandProcess = exec(command)

    // pipe output because we want to see the results of the run

    if (commandProcess.stdout) {
      commandProcess.stdout.pipe(process.stdout)
    }

    if (commandProcess.stderr) {
      commandProcess.stderr.pipe(process.stderr)
    }

    commandProcess.on('exit', (code) => {
      process.exit(code || 0)
    })
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
})()
