import { ASTNode, ParsedRules, reduceAST, serializeUnit } from 'publicodes'
import { RawRule, RuleName } from './commons'

type SourceMap = {
  mecanismName: string
  args: Record<string, ASTNode | Array<ASTNode>>
}

function serializeValue(
  node: ASTNode,
  parentSourceMap?: SourceMap,
  needParens = false,
): any {
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
      return (
        (needParens ? '(' : '') +
        `${serializeValue(node.explanation[0], node.sourceMap, true)} ${
          node.operationKind
        } ${serializeValue(node.explanation[1], node.sourceMap, true)}` +
        (needParens ? ')' : '')
      )
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

    // FIXME: bug with 'une de ses conditions' with 'applicable si'.
    rawRule[sourceMap.mecanismName] = isArray
      ? value.map((v) => serializeValue(v, sourceMap))
      : serializeValue(value, sourceMap)
  }
  return rawRule
}

function serializeASTNode(node: ASTNode): RawRule {
  return reduceAST<RawRule>(
    (rawRule, node: ASTNode) => {
      console.log(`\n----- serializing `, node.nodeKind)
      switch (node.nodeKind) {
        case 'constant': {
          const serializedValue = serializeValue(node)
          console.log(`serializing constant`, node)
          return serializedValue
        }
        default: {
          if (node?.sourceMap) {
            switch (node.sourceMap.mecanismName) {
              case 'dans la situation': {
                if (node.nodeKind === 'condition') {
                  const serializedNode = serializeASTNode(
                    node.explanation.alors,
                  )
                  if (typeof serializedNode !== 'object') {
                    return {
                      valeur: serializedNode,
                    }
                  }
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
              default: {
                return { ...rawRule, ...serializeMechanism(node) }
              }
            }
          }
          return { ...rawRule, ...serializeMechanism(node) }
        }
      }
    },
    {} as RawRule,
    node,
  )
}

export function serializeParsedRules(
  parsedRules: ParsedRules<RuleName>,
): Record<RuleName, RawRule> {
  const rawRules = {}

  for (const [rule, node] of Object.entries(parsedRules)) {
    console.log(`serializing rule ${node.nodeKind}`)
    rawRules[rule] = {
      ...node.rawNode,
      ...serializeASTNode(node.explanation.valeur),
    }
    delete rawRules[rule].nom
  }

  return rawRules
}
