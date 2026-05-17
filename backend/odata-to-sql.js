/**
 * OData to MySQL Translator
 * Refactored for MySQL (Aiven Cloud)
 * Removed 'mssql' dependency and updated parameters to positional arrays.
 */

function translateODataToSql(odataFilter) {
  if (!odataFilter) {
    return { where: "", parameters: [] };
  }

  const parameters = [];
  let whereClause = odataFilter;

  // 1. Match pattern (category eq 'value') -> (category = ?)
  whereClause = whereClause.replace(
    /\(category\s+eq\s+'([^']*)'\)/g,
    (match, value) => {
      parameters.push(value);
      return `(category = ?)`;
    },
  );

  // 2. Match pattern (pinned eq true/false) -> MySQL uses 1/0
  whereClause = whereClause.replace(/\(pinned\s+eq\s+true\)/g, "(pinned = 1)");
  whereClause = whereClause.replace(/\(pinned\s+eq\s+false\)/g, "(pinned = 0)");

  // 3. Match pattern contains(field, 'value') -> (field LIKE ?)
  whereClause = whereClause.replace(
    /contains\((\w+),\s*'([^']*)'\)/g,
    (match, field, value) => {
      parameters.push(`%${value}%`);
      return `(${field} LIKE ?)`;
    },
  );

  // 4. Replace logical operators
  whereClause = whereClause.replace(/\s+and\s+/gi, " AND ");
  whereClause = whereClause.replace(/\s+or\s+/gi, " OR ");

  // Fallback: If logic is more complex, use the AST parser
  try {
    const ast = parseOData(odataFilter);
    const params = [];
    const where = processNode(ast, params);
    return { where, parameters: params };
  } catch (e) {
    // If AST parsing fails, return the regex-processed clause
    return { where: whereClause, parameters };
  }
}

/**
 * AST Node Processor for MySQL
 */
function processNode(node, parameters) {
  if (!node) return "";

  switch (node.type) {
    case "eq":
      return handleBinaryExpression("=", node, parameters);
    case "ne":
      return handleBinaryExpression("<>", node, parameters);
    case "gt":
      return handleBinaryExpression(">", node, parameters);
    case "lt":
      return handleBinaryExpression("<", node, parameters);
    case "ge":
      return handleBinaryExpression(">=", node, parameters);
    case "le":
      return handleBinaryExpression("<=", node, parameters);
    case "and":
    case "or":
      const left = processNode(node.left, parameters);
      const right = processNode(node.right, parameters);
      return `(${left} ${node.type.toUpperCase()} ${right})`;
    case "not":
      return `NOT (${processNode(node.source, parameters)})`;
    case "functioncall":
      const field = processNode(node.args[0], parameters);
      const val = node.args[1].value;
      switch (node.func.toLowerCase()) {
        case "contains":
          parameters.push(`%${val}%`);
          return `${field} LIKE ?`;
        case "startswith":
          parameters.push(`${val}%`);
          return `${field} LIKE ?`;
        case "endswith":
          parameters.push(`%${val}`);
          return `${field} LIKE ?`;
        default:
          return field;
      }
    case "property":
      return node.name;
    case "literal":
      let value = node.value;
      if (value === true || value === "true") value = 1;
      if (value === false || value === "false") value = 0;
      parameters.push(value);
      return "?";
    default:
      throw new Error(`Unsupported node type: ${node.type}`);
  }
}

function handleBinaryExpression(operator, node, parameters) {
  const left = processNode(node.left, parameters);
  const right = processNode(node.right, parameters);
  return `(${left} ${operator} ${right})`;
}

/**
 * AST Parser Logic (Tokenizer remained pure logic, kept intact but cleaned)
 */
function parseOData(filter) {
  const tokenizer = new ODataTokenizer(filter);
  let token = tokenizer.nextToken();

  function parseExpression() {
    let left = parseUnaryExpression();
    while (
      token.type === "KEYWORD" &&
      (token.value === "AND" || token.value === "OR")
    ) {
      const operator = token.value.toLowerCase();
      token = tokenizer.nextToken();
      const right = parseUnaryExpression();
      left = { type: operator, left, right };
    }
    return left;
  }

  function parseUnaryExpression() {
    if (token.type === "FUNCTION") {
      const functionName = token.value;
      token = tokenizer.nextToken(); // consume name
      token = tokenizer.nextToken(); // consume (
      const args = [];
      while (token.type !== "CLOSE_PAREN") {
        if (token.type === "IDENTIFIER")
          args.push({ type: "property", name: token.value });
        else args.push({ type: "literal", value: token.value });
        token = tokenizer.nextToken();
        if (token.type === "COMMA") token = tokenizer.nextToken();
      }
      token = tokenizer.nextToken(); // consume )
      return { type: "functioncall", func: functionName, args };
    } else if (token.type === "IDENTIFIER") {
      const propertyName = token.value;
      token = tokenizer.nextToken();
      const operator = token.value;
      token = tokenizer.nextToken();
      const literalValue = token.value;
      token = tokenizer.nextToken();
      return {
        type: operator,
        left: { type: "property", name: propertyName },
        right: { type: "literal", value: literalValue },
      };
    } else if (token.type === "OPEN_PAREN") {
      token = tokenizer.nextToken();
      const expr = parseExpression();
      token = tokenizer.nextToken();
      return expr;
    }
    return { type: "literal", value: token.value };
  }

  return parseExpression();
}

class ODataTokenizer {
  constructor(odataString) {
    this.odataString = odataString;
    this.position = 0;
  }

  nextToken() {
    this.skipWhitespace();
    if (this.position >= this.odataString.length)
      return { type: "EOF", value: null };
    let char = this.odataString[this.position];
    if (this.isOperator()) return this.parseOperator();
    if (/[a-zA-Z]/.test(char)) return this.parseIdentifierOrKeyword();
    if (/[0-9-]/.test(char)) return this.parseNumber();
    if (char === "'") return this.parseString();
    if (char === "(") {
      this.position++;
      return { type: "OPEN_PAREN", value: "(" };
    }
    if (char === ")") {
      this.position++;
      return { type: "CLOSE_PAREN", value: ")" };
    }
    if (char === ",") {
      this.position++;
      return { type: "COMMA", value: "," };
    }
    throw new Error("Unexpected character: " + char);
  }

  skipWhitespace() {
    while (
      this.position < this.odataString.length &&
      /\s/.test(this.odataString[this.position])
    )
      this.position++;
  }

  isOperator() {
    const ops = ["eq", "ne", "gt", "lt", "ge", "le"];
    return ops.some(
      (op) =>
        this.odataString.substring(this.position, this.position + op.length) ===
        op,
    );
  }

  parseOperator() {
    const ops = ["eq", "ne", "gt", "lt", "ge", "le"];
    for (const op of ops) {
      if (this.odataString.substring(this.position).startsWith(op)) {
        this.position += op.length;
        return { type: "OPERATOR", value: op };
      }
    }
  }

  parseIdentifierOrKeyword() {
    let val = "";
    while (
      this.position < this.odataString.length &&
      /[a-zA-Z0-9_]/.test(this.odataString[this.position])
    ) {
      val += this.odataString[this.position++];
    }
    const upper = val.toUpperCase();
    if (["AND", "OR", "NOT"].includes(upper))
      return { type: "KEYWORD", value: upper };
    if (upper === "TRUE" || upper === "FALSE")
      return { type: "BOOLEAN", value: upper === "TRUE" };
    if (this.odataString[this.position] === "(")
      return { type: "FUNCTION", value: val };
    return { type: "IDENTIFIER", value: val };
  }

  parseNumber() {
    let val = "";
    while (
      this.position < this.odataString.length &&
      /[0-9.-]/.test(this.odataString[this.position])
    )
      val += this.odataString[this.position++];
    return { type: "NUMBER", value: Number(val) };
  }

  parseString() {
    this.position++;
    let val = "";
    while (
      this.position < this.odataString.length &&
      this.odataString[this.position] !== "'"
    )
      val += this.odataString[this.position++];
    this.position++;
    return { type: "STRING", value: val };
  }
}

module.exports = { translateODataToSql };
