import { ASTNode, ParsedRules, reduceAST, serializeUnit } from 'publicodes'
import { RawRule, RuleName } from './commons'

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
        /*
         * All these mecanisms are inlined with simplier ones. Therefore,
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
        /*
         * The engine parse the mecanism
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
      throw new Error(`[SERIALIZE_VALUE]: '${node.nodeKind}' not implemented`)
    }
  }
}

// TODO: this function might be refactored
function serializeSourceMap(node: ASTNode): SerializedRule {
  const sourceMap = node.sourceMap

  const rawRule = {}
  for (const key in sourceMap.args) {
    const value = sourceMap.args[key]
    const isArray = Array.isArray(value)

    rawRule[sourceMap.mecanismName] = isArray
      ? value.map((v) => serializeASTNode(v))
      : serializeASTNode(value)
  }
  return rawRule
}

function serializeASTNode(node: ASTNode): SerializedRule {
  return reduceAST<SerializedRule>(
    (_, node: ASTNode) => {
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
          const serializedValeur = serializedRuleToRawRule(
            serializeASTNode(node.explanation.valeur),
          )
          return {
            ...serializedValeur,
            arrondi: serializeASTNode(node.explanation.arrondi),
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

        case 'barème':
        case 'grille':
        case 'taux progressif': {
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
            ...serializedExplanationNode,
            contexte,
          }
        }

        case 'condition': {
          const sourceMap = node?.sourceMap
          const mecanismName = sourceMap?.mecanismName
          switch (mecanismName) {
            case 'dans la situation': {
              /*
               * The engine parse all rules into a root condition:
               *
               * - si:
               *   est non défini: <rule> . $SITUATION
               * - alors: <rule>
               * - sinon: <rule> . $SITUATION
               */
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
                ...serializedExplanationNode,
                [mecanismName]: serializeASTNode(
                  sourceMap.args[mecanismName] as ASTNode,
                ),
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
            case 'plafond':
            case 'par défaut': {
              const serializedExplanationNode = serializedRuleToRawRule(
                serializeASTNode(node.sourceMap.args.valeur as ASTNode),
              )

              return {
                ...serializedExplanationNode,
                [mecanismName]: serializeASTNode(
                  node.sourceMap.args[mecanismName] as ASTNode,
                ),
              }
            }

            default: {
              throw new Error(
                `[SERIALIZE_AST_NODE]: mecanism '${mecanismName}' found in a '${node.nodeKind}`,
              )
            }
          }
        }

        case 'variable manquante': {
          // Simple need to unwrap the explanation node
          return serializeASTNode(node.explanation)
        }

        case 'texte': {
          const serializedText = node.explanation.reduce(
            (currText: string, node: ASTNode | string) => {
              if (typeof node === 'string') {
                return currText + node
              }

              const serializedNode = serializeASTNode(node)
              if (typeof serializedNode !== 'string') {
                throw new Error(`[SERIALIZE_AST_NODE > 'texte']: all childs of 'texte' expect to be serializable as string.
				Got '${serializedNode}'`)
              }
              return currText + '{{ ' + serializedNode + ' }}'
            },
            '',
          )
          return { texte: serializedText }
        }

        case 'une possibilité': {
          return {
            'une possibilité': {
              'choix obligatoire': node['choix obligatoire'],
              possibilités: node.explanation.map(serializeASTNode),
            },
          }
        }

        default: {
          throw new Error(
            `[SERIALIZE_AST_NODE]: '${node.nodeKind}' not implemented.
		Node:\n${JSON.stringify(node, null, 2)}`,
          )
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
  /**
   * This mecanisms are syntaxic sugars that are inlined with simplier ones.
   * Consequently, we need to remove them from the rawNode in order to avoid
   * duplicate mecanisms.
   *
   *
   * NOTE: for now, the [avec] mecanism is unfolded as full rules. Therefore,
   * we need to remove the [avec] mecanism from the rawNode in order to
   * avoid duplicate rule definitions.
   *
   * TODO: a way to keep the [avec] mecanism in the rawNode could be investigated but
   * for now it's not a priority.
   */
  const syntaxicSugars = ['avec', 'formule', 'valeur']
  const rawRules = {}

  for (const [rule, node] of Object.entries(parsedRules)) {
    if (Object.keys(node.rawNode).length === 0) {
      // Empty rule should be null not {}
      rawRules[rule] = null
      continue
    }

    const serializedNode = serializedRuleToRawRule(
      serializeASTNode(node.explanation.valeur),
    )

    rawRules[rule] = { ...node.rawNode }
    syntaxicSugars.forEach((attr) => {
      if (attr in rawRules[rule]) {
        delete rawRules[rule][attr]
      }
    })

    rawRules[rule] = {
      ...rawRules[rule],
      ...serializedNode,
    }
  }

  return rawRules
}
