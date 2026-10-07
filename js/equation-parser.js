'use strict';

// Tokenization, safe expression evaluation, and explicit/implicit equation compilation.
// Parser wyrażeń: bez eval(), Function() ani zewnętrznych zależności.
const FUNCTIONS = {
  sin: [Math.sin, 1],
  cos: [Math.cos, 1],
  tan: [Math.tan, 1],
  asin: [Math.asin, 1],
  acos: [Math.acos, 1],
  atan: [Math.atan, 1],
  atan2: [Math.atan2, 2],
  sinh: [Math.sinh, 1],
  cosh: [Math.cosh, 1],
  tanh: [Math.tanh, 1],
  sqrt: [Math.sqrt, 1],
  abs: [Math.abs, 1],
  exp: [Math.exp, 1],
  log: [Math.log, 1],
  ln: [Math.log, 1],
  log10: [Math.log10, 1],
  floor: [Math.floor, 1],
  ceil: [Math.ceil, 1],
  round: [Math.round, 1],
  sign: [Math.sign, 1],
  min: [Math.min, 2],
  max: [Math.max, 2],
  pow: [Math.pow, 2],
};
function parseExpression(source, allowed) {
  source = source
    .toLowerCase()
    .replace(/π/g, 'pi')
    .replace(/−/g, '-')
    .replace(/×|·/g, '*')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/\*\*/g, '^');
  const tokens = [];
  let p = 0;
  while (p < source.length) {
    const s = source.slice(p);
    if (/^\s/.test(s)) {
      p++;
      continue;
    }
    const number = s.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/);
    if (number) {
      tokens.push({ type: 'num', value: Number(number[0]) });
      p += number[0].length;
      continue;
    }
    const name = s.match(/^[a-z]+/);
    if (name) {
      const word = name[0];
      if (/^[xyz]+$/.test(word)) {
        for (const c of word) tokens.push({ type: 'name', value: c });
      } else tokens.push({ type: 'name', value: word });
      p += word.length;
      continue;
    }
    if ('+-*/^(),'.includes(source[p])) {
      tokens.push({ type: source[p], value: source[p] });
      p++;
      continue;
    }
    throw Error('Nieznany znak: „' + source[p] + '”.');
  }
  if (!tokens.length) throw Error('Wpisz równanie.');
  if (tokens.length > 350) throw Error('Równanie jest zbyt długie.');
  let i = 0;
  const isAtom = (t) => t && (t.type === 'num' || t.type === 'name' || t.type === '(');
  const take = (t) => {
    if (tokens[i]?.type !== t) throw Error('Oczekiwano „' + t + '”.');
    i++;
  };
  function atom() {
    const token = tokens[i++];
    if (!token) throw Error('Niepełne równanie.');
    if (token.type === 'num') {
      const v = token.value;
      return () => v;
    }
    if (token.type === '(') {
      const f = add();
      take(')');
      return f;
    }
    if (token.type === 'name') {
      const name = token.value;
      if (allowed.includes(name)) return (x, y, z) => (name === 'x' ? x : name === 'y' ? y : z);
      if (name === 'pi') return () => Math.PI;
      if (name === 'e') return () => Math.E;
      if (Object.hasOwn(FUNCTIONS, name)) {
        take('(');
        const args = [add()];
        while (tokens[i]?.type === ',') {
          i++;
          args.push(add());
        }
        take(')');
        const [fn, n] = FUNCTIONS[name];
        if (args.length !== n)
          throw Error(name + ' wymaga ' + n + ' argument' + (n === 1 ? 'u' : 'ów') + '.');
        return (x, y, z) => fn(...args.map((a) => a(x, y, z)));
      }
      throw Error('Nieznana nazwa: „' + name + '”.');
    }
    throw Error('Nieoczekiwany znak: „' + token.value + '”.');
  }
  function power() {
    const a = atom();
    if (tokens[i]?.type === '^') {
      i++;
      const b = unary();
      return (x, y, z) => Math.pow(a(x, y, z), b(x, y, z));
    }
    return a;
  }
  function unary() {
    if (tokens[i]?.type === '+') {
      i++;
      return unary();
    }
    if (tokens[i]?.type === '-') {
      i++;
      const f = unary();
      return (x, y, z) => -f(x, y, z);
    }
    return power();
  }
  function multiply() {
    let a = unary();
    while (tokens[i]?.type === '*' || tokens[i]?.type === '/' || isAtom(tokens[i])) {
      const divide = tokens[i].type === '/';
      if (tokens[i].type === '*' || divide) i++;
      const b = unary(),
        prev = a;
      a = divide
        ? (x, y, z) => prev(x, y, z) / b(x, y, z)
        : (x, y, z) => prev(x, y, z) * b(x, y, z);
    }
    return a;
  }
  function add() {
    let a = multiply();
    while (tokens[i]?.type === '+' || tokens[i]?.type === '-') {
      const minus = tokens[i++].type === '-',
        b = multiply(),
        prev = a;
      a = minus ? (x, y, z) => prev(x, y, z) - b(x, y, z) : (x, y, z) => prev(x, y, z) + b(x, y, z);
    }
    return a;
  }
  const f = add();
  if (i !== tokens.length) throw Error('Nieoczekiwany znak: „' + tokens[i].value + '”.');
  return f;
}
function compileEquation(input, mode) {
  const pieces = input.split('=');
  if (pieces.length > 2) throw Error('Równanie może mieć tylko jeden znak =.');
  if (mode === 'explicit') {
    if (pieces.length === 2 && pieces[0].trim().toLowerCase() !== 'z')
      throw Error('Użyj z = f(x, y) albo wybierz tryb F(x, y, z).');
    return parseExpression(pieces.length === 2 ? pieces[1] : pieces[0], ['x', 'y']);
  }
  const a = parseExpression(pieces[0], ['x', 'y', 'z']);
  if (pieces.length === 1) return a;
  const b = parseExpression(pieces[1], ['x', 'y', 'z']);
  return (x, y, z) => a(x, y, z) - b(x, y, z);
}
