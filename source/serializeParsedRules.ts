import { ASTNode, ParsedRules, reduceAST, serializeUnit } from 'publicodes'
import { RawRule, RuleName } from './commons'
//
// type SourceMap = {
//   mecanismName: string
//   args: Record<string, ASTNode | Array<ASTNode>>
// }
//
type SerializedRule = RawRule | number | string

function serializedRuleToRawRule(serializedRule: SerializedRule): RawRule {
  if (typeof serializedRule === 'object') {
    return serializedRule
  }
  return {
    valeur: serializedRule,
  }
}

function serializeValue(node: ASTNode, needParens = false): SerializedRule {
  // console.log('[SERIALIZE_VALUE]:', node.nodeKind, needParens)
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
          return Number(node.nodeValue)
        // TODO: case 'date':
        default: {
          return node.nodeValue?.toLocaleString('fr-FR')
        }
      }
    }

    case 'operation': {
      switch (node?.sourceMap?.mecanismName) {
        /* All these mecanisms are inlined with simplier ones. Therefore,
         * we need to serialize the sourceMap in order to retrieve the
         * original mecanism.
         *
         * Example:
         * [une de ces conditions] is inlined with a composition of disjunctions ('ou')
         * [toutes ces conditions] is inlined with a composition of conjunctions ('et')
         * [somme] is inlined with a sum of values ('+')
         * etc...
         */
        case 'somme':
        case 'moyenne':
        case 'une de ces conditions':
        case 'toutes ces conditions':
        /* The engine parse the mecanism
         * 'est défini: <rule>'
         * as
         * 'est non défini: <rule> = non'
         */
        case 'est défini':
        case 'est applicable': {
          return serializeSourceMap(node)
        }

        default: {
          return (
            (needParens ? '(' : '') +
            `${serializeValue(node.explanation[0], true)} ${
              node.operationKind
            } ${serializeValue(node.explanation[1], true)}` +
            (needParens ? ')' : '')
          )
        }
      }
    }

    case 'unité': {
      const serializedUnit = serializeUnit(node.unit)
      const serializedExplanation = serializeASTNode(node.explanation)

      // Inlined unit (e.g. '10 €/mois')
      if (node?.explanation?.nodeKind === 'constant') {
        return (
          serializedExplanation + (serializedUnit ? ' ' + serializedUnit : '')
        )
      }

      // Explicit [unité] mecanism
      return {
        unité: serializedUnit,
        ...serializedRuleToRawRule(serializedExplanation),
      }
    }

    default: {
      return `TODO: ${node.nodeKind}`
    }
  }
}

function serializeSourceMap(node: ASTNode): SerializedRule {
  const sourceMap = node.sourceMap

  const rawRule = {}
  for (const key in sourceMap.args) {
    const value = sourceMap.args[key]
    const isArray = Array.isArray(value)

    console.log('[SOURCE_MAP]:', key)

    // FIXME: bug with 'une de ses conditions' with 'applicable si'.
    rawRule[sourceMap.mecanismName] = isArray
      ? value.map((v) => serializeASTNode(v))
      : serializeASTNode(value)
  }
  return rawRule
}

function serializeASTNode(node: ASTNode): SerializedRule {
  return reduceAST<SerializedRule>(
    (rawRule, node: ASTNode) => {
      // if (node?.nodeKind) {
      console.log('[NODE_KIND]:', node.nodeKind)
      console.log('[MECANISME_NAME]:', node?.sourceMap?.mecanismName)
      // } else {
      //   console.log('[NODE_KIND]:', node)
      //   return rawRule
      // }
      switch (node?.nodeKind) {
        case 'reference':
        case 'constant':
        case 'unité':
        case 'operation': {
          return serializeValue(node)
        }

        case 'est non défini':
        case 'est non applicable': {
          return {
            [node.nodeKind]: serializeASTNode(node.explanation),
          }
        }

        // [produit] is parsed as a one big multiplication, so we need to
        // gets the sourceMap to get the real mecanismName
        case 'simplifier unité': {
          return serializeSourceMap(node)
        }

        case 'variations': {
          return {
            variations: node.explanation.map(({ condition, consequence }) => {
              if (
                'type' in condition &&
                condition.type === 'boolean' &&
                condition.nodeValue
              ) {
                return { sinon: serializeASTNode(consequence) }
              }
              return {
                si: serializeASTNode(condition),
                alors: serializeASTNode(consequence),
              }
            }),
          }
        }

        case 'arrondi': {
          return {
            arrondi: serializeASTNode(node.explanation.arrondi),
            valeur: serializeASTNode(node.explanation.valeur),
          }
        }

        case 'durée': {
          return {
            durée: {
              depuis: serializeASTNode(node.explanation.depuis),
              "jusqu'à": serializeASTNode(node.explanation["jusqu'à"]),
            },
          }
        }

        case 'taux progressif':
        case 'barème': {
          const serializedNode = {
            assiette: serializeASTNode(node.explanation.assiette),
            tranches: node.explanation.tranches.map((tranche) => {
              const res = {}

              for (const key in tranche) {
                const val = tranche[key]
                if (key !== 'plafond' || val.nodeValue !== Infinity) {
                  res[key] = serializeASTNode(tranche[key])
                }
              }

              return res
            }),
          }

          const serializedMultiplicateur = serializeASTNode(
            node.explanation.multiplicateur,
          )

          if (serializedMultiplicateur !== 1) {
            serializedNode['multiplicateur'] = serializeASTNode(
              node.explanation.multiplicateur,
            )
          }

          return { [node.nodeKind]: serializedNode }
        }

        case 'contexte': {
          const contexte = node.explanation.contexte.reduce(
            (currCtx, [ref, node]) => {
              currCtx[ref.name] = serializeASTNode(node)
              return currCtx
            },
            {},
          )
          const serializedExplanationNode = serializedRuleToRawRule(
            serializeASTNode(node.explanation.node),
          )
          return {
            contexte,
            ...serializedExplanationNode,
          }
        }

        case 'condition': {
          const sourceMap = node?.sourceMap
          const mecanismName = sourceMap?.mecanismName
          switch (mecanismName) {
            case 'dans la situation': {
              // The engine parse all rules into a root condition:
              //
              // - si:
              //   est non défini: <rule> . $SITUATION
              // - alors: <rule>
              // - sinon: <rule> . $SITUATION
              //
              if (
                sourceMap.args['dans la situation']['title'] === '$SITUATION'
              ) {
                return serializeASTNode(node.explanation.alors)
              }
            }

            case 'applicable si':
            case 'non applicable si': {
              const serializedExplanationNode = serializedRuleToRawRule(
                serializeASTNode(node.explanation.alors),
              )
              return {
                [mecanismName]: serializeASTNode(
                  sourceMap.args[mecanismName] as ASTNode,
                ),
                ...serializedExplanationNode,
              }
            }

            // Needs to the serialize the source map in order to retrieve the
            // original mecanism.
            case 'le maximum de':
            case 'le minimum de': {
              return serializeSourceMap(node)
            }

            case 'abattement':
            case 'plancher':
            case 'plafond': {
              const serializedExplanationNode = serializedRuleToRawRule(
                serializeASTNode(node.sourceMap.args.valeur as ASTNode),
              )

              return {
                [mecanismName]: serializeASTNode(
                  node.sourceMap.args[mecanismName] as ASTNode,
                ),
                ...serializedExplanationNode,
              }
            }
          }
        }

        default: {
          // console.log('[DEFAULT]:', node.nodeKind)
          // console.log('[KIND]:', node.nodeKind)
          // console.log('[SOURCE_MAP]:', node.sourceMap)
          // if (node?.sourceMap) {
          //   switch (node.sourceMap.mecanismName) {
          //     case 'dans la situation': {
          //       if (node.nodeKind === 'condition') {
          //         console.log(`\n----- serializing `, node.nodeKind)
          //         console.log(`----- node `, node)
          //         const serializedNode = serializeASTNode(
          //           node.explanation.alors,
          //         )
          //         if (typeof serializedNode !== 'object') {
          //           return {
          //             valeur: serializedNode,
          //           }
          //         }
          //         return {
          //           ...rawRule,
          //           ...serializeASTNode(node.explanation.alors),
          //         }
          //       } else {
          //         console.error(
          //           `'dans la situation' expect be resolved to a condition got ${node.nodeKind}`,
          //         )
          //       }
          //     }
          //     default: {
          //       return { ...rawRule, ...serializeMechanism(node) }
          //     }
          //   }
          // } else {
          //   return { ...rawRule, ...serializeMechanism(node) }
          // }
          // return { ...rawRule, ...serializeSourceMap(node) }
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
    console.log(`serializing ${rule}`)
    const serializedNode = serializedRuleToRawRule(
      serializeASTNode(node.explanation.valeur),
    )

    rawRules[rule] = {
      ...node.rawNode,
      ...serializedNode,
    }

    delete rawRules[rule].nom
  }

  return rawRules
}
