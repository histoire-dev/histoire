import { describe, expect, it } from 'vitest'
import { compareVersions, satisfiesVersion } from '../../marketplace/catalog/version.js'

describe('catalog npm version selection', () => {
  it.each([
    ['^0.2.3', ['0.2.2', '0.2.3', '0.2.9', '0.3.0'], ['0.2.3', '0.2.9']],
    ['~0.2.3', ['0.2.2', '0.2.3', '0.2.9', '0.3.0'], ['0.2.3', '0.2.9']],
    ['~>0.2.3', ['0.2.2', '0.2.3', '0.2.9', '0.3.0'], ['0.2.3', '0.2.9']],
    ['^0.0', ['0.0.0', '0.0.9', '0.1.0'], ['0.0.0', '0.0.9']],
    ['1.2.3 - 2.3.4', ['1.2.2', '1.2.3', '2.3.4', '2.3.5'], ['1.2.3', '2.3.4']],
    ['>=1 <2', ['0.9.9', '1.0.0', '1.9.9', '2.0.0'], ['1.0.0', '1.9.9']],
    ['1.2.x || >=3 <4', ['1.2.9', '1.3.0', '3.0.0', '4.0.0'], ['1.2.9', '3.0.0']],
    ['1.*', ['0.9.9', '1.0.0', '1.9.9', '2.0.0'], ['1.0.0', '1.9.9']],
    ['*.*', ['0.0.0', '2.0.0', '2.1.0-beta.1'], ['0.0.0', '2.0.0']],
    ['x.x', ['0.0.0', '2.0.0', '2.1.0-beta.1'], ['0.0.0', '2.0.0']],
    ['v1.2.3', ['1.2.2', '1.2.3', '1.2.4'], ['1.2.3']],
    ['=v1.2.3', ['1.2.2', '1.2.3', '1.2.4'], ['1.2.3']],
    ['', ['0.0.0', '2.0.0', '2.1.0-beta.1'], ['0.0.0', '2.0.0']],
  ])('selects exactly npm-compatible releases for %s', (range, versions, expected) => {
    expect(versions.filter(version => satisfiesVersion(version, range))).toEqual(expected)
  })

  it('admits prereleases only for a tuple explicitly named in its matching comparator set', () => {
    const versions = ['1.0.0', '1.1.0-beta.1', '1.1.0-beta.2', '1.1.0', '1.2.0-beta.1', '2.0.0']
    expect(versions.filter(version => satisfiesVersion(version, '^1.0.0'))).toEqual(['1.0.0', '1.1.0'])
    expect(versions.filter(version => satisfiesVersion(version, '^1.1.0-beta.1'))).toEqual([
      '1.1.0-beta.1',
      '1.1.0-beta.2',
      '1.1.0',
    ])
    expect(satisfiesVersion('1.1.0-beta.2', '>1.1.0-beta.1 <1.1.0 || >=2')).toBe(true)
    expect(satisfiesVersion('1.1.0-beta.2', '>1.1.0-beta.1 <1.1.0-beta.2 || >=1')).toBe(false)
  })

  it('ignores build metadata when selecting and comparing releases', () => {
    expect(satisfiesVersion('1.2.3+linux.1', '=1.2.3+macos.2')).toBe(true)
    expect(compareVersions('1.2.3+linux.1', '1.2.3+macos.2')).toBe(0)
    expect(compareVersions('1.2.4+build.1', '1.2.3+build.999')).toBe(1)
  })

  it('orders release tuples, numeric prereleases, and alphanumeric identifiers', () => {
    const versions = ['1.1.0', '1.0.0-beta.2', '1.0.0-beta.1', '1.0.0-2', '1.0.0', '1.0.0-alpha']
    expect(versions.sort(compareVersions)).toEqual([
      '1.0.0-2',
      '1.0.0-alpha',
      '1.0.0-beta.1',
      '1.0.0-beta.2',
      '1.0.0',
      '1.1.0',
    ])
  })

  it.each(['', 'latest', '1.2', '01.2.3', '1.2.3-beta.01', '9007199254740992.0.0'])('keeps invalid version %j non-throwing', (version) => {
    expect(satisfiesVersion(version, '*')).toBe(false)
    expect(compareVersions(version, '1.2.3')).toBe(0)
    expect(compareVersions('1.2.3', version)).toBe(0)
  })

  it.each(['latest', 'workspace:*', '>=1.0.0 <', '01.2.x', '>=1 || invalid', 'invalid || >=1'])('rejects invalid range %j without throwing', (range) => {
    expect(satisfiesVersion('1.2.3', range)).toBe(false)
  })
})
