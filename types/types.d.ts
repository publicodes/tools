import { Evaluation } from 'publicodes'

export type Situation = {
  [key: string]: string | number
}

export type DottedName = string

export type MigrationType = {
  keysToMigrate: Record<DottedName, DottedName>
  valuesToMigrate: Record<DottedName, Record<string, NodeValue>>
}

export type NodeValue = Evaluation
