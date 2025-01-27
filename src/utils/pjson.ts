import fs from 'fs'
import { DEFAULT_BUILD_DIR } from '../commons'

export type PackageJson = {
  name: string
  version: string
  description: string
  main?: string
  type?: string
  types?: string
  files?: string[]
  // TODO: infer from the git config
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
  publishConfig?: {
    access: string
  }
  publicodes?: {
    files?: string[]
    output?: string
  }
}

export const basePackageJson: PackageJson = {
  name: '',
  version: '0.1.0',
  description: '',
  author: '',
  type: 'module',
  main: `${DEFAULT_BUILD_DIR}/index.js`,
  types: `${DEFAULT_BUILD_DIR}/index.d.ts`,
  license: 'MIT',
  files: [DEFAULT_BUILD_DIR],
  peerDependencies: {
    // TODO: how to get the latest version of publicodes?
    publicodes: '^1.5.1',
  },
  scripts: {
    compile: 'publicodes compile',
  },
}

export function readPackageJson(): PackageJson | undefined {
  try {
    return JSON.parse(fs.readFileSync('package.json', 'utf-8'))
  } catch (e) {
    return undefined
  }
}
