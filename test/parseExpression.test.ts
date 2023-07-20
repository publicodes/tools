import {
  BinaryOp,
  ConstantNode,
  ParsedExprAST,
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
