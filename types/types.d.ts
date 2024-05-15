import { Evaluation } from 'publicodes'

export type NodeValue = Evaluation

export type Situation = {
  [key: string]: NodeValue
}

export type DottedName = string

export type MigrationType = {
  keysToMigrate: Record<DottedName, DottedName>
  valuesToMigrate: Record<DottedName, Record<string, NodeValue>>
}
