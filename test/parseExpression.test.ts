import {
  BinaryOp,
  ConstantNode,
  serializeParsedExprAST,
  substituteInParsedExpr,
} from '../source/commons'

describe('substituteInParsedExpr', () => {
  it('should return the same parsed expression if no occurence of the variable is found', () => {
    const parsedExpr: ConstantNode<'number'> = {
      constant: { type: 'number', nodeValue: '10' },
    }
    expect(substituteInParsedExpr(parsedExpr, 'A', '10')).toStrictEqual(
      parsedExpr
    )
  })

  it('should substitute the variable with the constant value in a binary operation', () => {
    const parsedExpr: BinaryOp = {
      '+': [{ variable: 'A' }, { variable: 'B' }],
    }
    const expected: BinaryOp = {
      '+': [
        { constant: { type: 'number', nodeValue: '10' } },
        { variable: 'B' },
      ],
    }
    expect(substituteInParsedExpr(parsedExpr, 'A', '10')).toStrictEqual(
      expected
    )
  })
})

describe('serializeParsedExprAST', () => {
  it('should serialize a simple constant node', () => {
    expect(
      serializeParsedExprAST({ constant: { type: 'number', nodeValue: '10' } })
    ).toStrictEqual('10')
  })

  it('should serialize a simple variable node', () => {
    expect(serializeParsedExprAST({ variable: 'A' })).toStrictEqual('A')
  })

  it('should serialize a simple binary operation', () => {
    expect(
      serializeParsedExprAST({ '+': [{ variable: 'A' }, { variable: 'B' }] })
    ).toStrictEqual('(A + B)')
  })

  it('should serialize a complex binary operation', () => {
    expect(
      serializeParsedExprAST({
        '+': [
          { variable: 'A' },
          {
            '*': [{ variable: 'B' }, { variable: 'C' }],
          },
        ],
      })
    ).toStrictEqual('(A + (B * C))')
  })

  it('should serialize a complex binary operation with constants and units', () => {
    expect(
      serializeParsedExprAST({
        '+': [
          { variable: 'A' },
          {
            '*': [
              { constant: { type: 'number', nodeValue: '10' } },
              {
                '+': [
                  { variable: 'C' },
                  {
                    constant: { type: 'number', nodeValue: '50.5' },
                    unité: 'km',
                  },
                ],
              },
            ],
          },
        ],
      })
    ).toStrictEqual('(A + (10 * (C + 50.5km)))')
  })
})
