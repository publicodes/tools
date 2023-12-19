import { ASTNode, ParsedRules, reduceAST, serializeUnit } from 'publicodes'
import { RawRule, RuleName } from './commons'

type SourceMap = {
  mecanismName: string
  args: Record<string, ASTNode | Array<ASTNode>>
}

function serializeValue(node: ASTNode, parentSourceMap: SourceMap): any {
  switch (node.nodeKind) {
    case 'reference': {
      return node.name
    }
    case 'constant': {
      switch (node.type) {
        case 'boolean':
          return node.nodeValue ? 'oui' : 'non'
        case 'string':
          return `'${node.nodeValue}'`
        case 'number':
          return node.nodeValue
        default:
          // There is some 'constant' without node.type, is it a bug?
          return node.nodeValue
      }
    }
    case 'condition': {
      return {
        si: serializeASTNode(node.explanation.si),
        alors: serializeASTNode(node.explanation.alors),
        sinon: serializeASTNode(node.explanation.sinon),
      }
    }
    case 'operation': {
      if (node?.sourceMap?.mecanismName === 'est défini') {
        return serializeMechanism(node)
      }
      return `${serializeValue(node.explanation[0], node.sourceMap)} ${
        node.operationKind
      } ${serializeValue(node.explanation[1], node.sourceMap)}`
    }
    case 'unité': {
      const unit = serializeUnit(node.unit)
      const nodeValue = serializeValue(node.explanation, node.sourceMap)

      return nodeValue + (unit ? unit : '')
    }
    default: {
      return `TODO: ${node.nodeKind}`
    }
  }
}

function serializeMechanism(node: ASTNode): Record<string, any> {
  const sourceMap = node.sourceMap

  const rawRule = {}
  for (const key in sourceMap.args) {
    const value = sourceMap.args[key]
    const isArray = Array.isArray(value)

    rawRule[sourceMap.mecanismName] = isArray
      ? value.map((v) => serializeValue(v, sourceMap))
      : serializeValue(value, sourceMap)
  }
  return rawRule
}

function serializeASTNode(node: ASTNode): RawRule {
  return reduceAST<RawRule>(
    (rawRule, node: ASTNode) => {
      switch (node.nodeKind) {
        default: {
          if (node?.sourceMap) {
            switch (node.sourceMap.mecanismName) {
              case 'dans la situation': {
                if (node.nodeKind === 'condition') {
                  return {
                    ...rawRule,
                    ...serializeASTNode(node.explanation.alors),
                  }
                } else {
                  console.error(
                    `'dans la situation' expect be resolved to a condition got ${node.nodeKind}`,
                  )
                }
              }
              case 'une de de ces conditions': {
                console.log(node.sourceMap)
              }
              default: {
                return { ...rawRule, ...serializeMechanism(node) }
              }
            }
          }
        }
      }
    },
    {},
    node,
  )
}

export function serializeParsedRules(
  parsedRules: ParsedRules<RuleName>,
): Record<RuleName, RawRule> {
  const rawRules = {}

  for (const [rule, node] of Object.entries(parsedRules)) {
    rawRules[rule] = {
      ...serializeASTNode(node.explanation.valeur),
    }
    delete rawRules[rule].nom
  }

  return rawRules
}
