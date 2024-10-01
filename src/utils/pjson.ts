import fs from 'fs'

export type PackageJson = {
  name: string
  version: string
  description: string
  main?: string
  type?: string
  types?: string
  files?: string[]
  repository?: {
    url: string
    type: string
  }
  author: string
  license: string
  scripts?: {
    [key: string]: string
  }
  peerDependencies?: {
    [key: string]: string
  }
  dependencies?: {
    [key: string]: string
  }
  devDependencies?: {
    [key: string]: string
  }
}

export const basePackageJson: PackageJson = {
  name: '',
  version: '1.0.0',
  description: '',
  author: '',
  type: 'module',
  main: 'build/index.js',
  types: 'build/index.d.ts',
  license: 'MIT',
  files: ['build'],
  peerDependencies: {
    // TODO: how to get the latest version of publicodes?
    publicodes: '^1.5.1',
  },
}

export function getPackageJson(): PackageJson | undefined {
  try {
    return JSON.parse(fs.readFileSync('package.json', 'utf8'))
  } catch (error) {
    return undefined
  }
}
