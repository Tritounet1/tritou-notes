/**
 * Evaluates a spreadsheet arithmetic expression (numbers, + - * / %, parentheses, unary signs)
 * without `eval`/`new Function`: formulas come from shared documents and must never run code.
 * Throws on anything else.
 */
export const evaluateArithmetic = (input: string): number => {
  const tokens = input.match(/\d*\.?\d+(?:e[+-]?\d+)?|\S/gi) ?? [];
  let position = 0;

  const peek = () => tokens[position];
  const next = () => tokens[position++];

  const factor = (): number => {
    const token = next();
    if (token === "+") return factor();
    if (token === "-") return -factor();
    if (token === "(") {
      const value = expression();
      if (next() !== ")") throw new Error("Parenthèse manquante");
      return value;
    }
    if (token === undefined || !/^\d*\.?\d+(?:e[+-]?\d+)?$/i.test(token)) throw new Error(`Jeton inattendu : ${token}`);
    return Number(token);
  };

  const term = (): number => {
    let value = factor();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const operator = next();
      const right = factor();
      value = operator === "*" ? value * right : operator === "/" ? value / right : value % right;
    }
    return value;
  };

  const expression = (): number => {
    let value = term();
    while (peek() === "+" || peek() === "-") {
      value = next() === "+" ? value + term() : value - term();
    }
    return value;
  };

  const value = expression();
  if (position !== tokens.length) throw new Error(`Jeton inattendu : ${peek()}`);
  return value;
};
