const sql = require('mssql');

function translateODataToSql(odataFilter) {
    if (!odataFilter) {
        return { where: '', parameters: {} };
    }

    console.log('Translating OData filter:', odataFilter);
    
    const parameters = {};
    let paramCounter = 0;
    let whereClause = odataFilter;
    
    // Match pattern (category eq 'value')
    whereClause = whereClause.replace(/\(category\s+eq\s+'([^']*)'\)/g, (match, value) => {
        const paramName = `p${paramCounter++}`;
        parameters[paramName] = { type: sql.NVarChar, value: value };
        return `(category = @${paramName})`;
    });
    
    // Match pattern (pinned eq true)
    whereClause = whereClause.replace(/\(pinned\s+eq\s+true\)/g, '(pinned = 1)');
    
    // Match pattern contains(field, 'value')
    whereClause = whereClause.replace(/contains\((\w+),\s*'([^']*)'\)/g, (match, field, value) => {
        const paramName = `p${paramCounter++}`;
        parameters[paramName] = { type: sql.NVarChar, value: `%${value}%` };
        return `(${field} LIKE @${paramName})`;
    });
    
    // Replace logical operators
    whereClause = whereClause.replace(/\s+and\s+/gi, ' AND ');
    whereClause = whereClause.replace(/\s+or\s+/gi, ' OR ');
    
    console.log('Translated SQL WHERE clause:', whereClause);
    console.log('SQL parameters:', parameters);
    
    return { where: whereClause, parameters };
}
function processNode(node, parameters, paramCount) {
    if (!node) {
        return '';
    }

    switch (node.type) {
        case 'eq':
            return handleBinaryExpression('=', node, parameters, paramCount);
        case 'ne':
            return handleBinaryExpression('<>', node, parameters, paramCount);
        case 'gt':
            return handleBinaryExpression('>', node, parameters, paramCount);
        case 'lt':
            return handleBinaryExpression('<', node, parameters, paramCount);
        case 'ge':
            return handleBinaryExpression('>=', node, parameters, paramCount);
        case 'le':
            return handleBinaryExpression('<=', node, parameters, paramCount);
        case 'and':
        case 'or':
            const left = processNode(node.left, parameters, paramCount);
            const right = processNode(node.right, parameters, paramCount);
            return `(${left} ${node.type.toUpperCase()} ${right})`;
        case 'not':
            const innerWhere = processNode(node.source, parameters, paramCount);
            return `NOT (${innerWhere})`;
        case 'functioncall':
            switch (node.func.toLowerCase()) {
                case 'contains':
                    const field = processNode(node.args[0], parameters, paramCount);
                    const paramName = `@p${paramCount}`;
                    const value = node.args[1].value;
                    parameters[paramName] = { type: sql.NVarChar, value: value };
                    return `${field} LIKE '%' + ${paramName} + '%'`;
                // Add other function cases as needed
                default:
                    return handleFunctionCall(node, parameters, paramCount);
            }
        case 'property':
            return node.name;
        case 'literal':
            const paramName = `@p${paramCount++}`;
            parameters[paramName] = { type: determineSqlType(node.value), value: node.value };
            return paramName;
        default:
            throw new Error(`Unsupported node type: ${node.type}`);
    }
}

function handleBinaryExpression(operator, node, parameters, paramCount) {
    const left = processNode(node.left, parameters, paramCount);
    const right = processNode(node.right, parameters, paramCount);
    return `(${left} ${operator} ${right})`;
}

function handleLogicalExpression(operator, node, parameters, paramCount) {
    const left = processNode(node.left, parameters, paramCount);
    const right = processNode(node.right, parameters, paramCount);
    return `(${left} ${operator} ${right})`;
}

function handleFunctionCall(node, parameters, paramCount) {
    const functionName = node.func.toLowerCase();
    const args = node.args.map(arg => processNode(arg, parameters, paramCount));

    switch (functionName) {
        case 'startswith':
            return `LOWER(${args[0]}) LIKE LOWER(${args[1]}) + '%'`;
        case 'endswith':
            return `LOWER(${args[0]}) LIKE '%' + LOWER(${args[1]})`;
        case 'contains':
            const paramName = `@p${paramCount++}`;
            parameters[paramName] = { type: sql.NVarChar, value: `%${args[1].value}%` };
            return `LOWER(${args[0]}) LIKE LOWER(${paramName})`;
        case 'tolower':
            return `LOWER(${args[0]})`;
        case 'toupper':
            return `UPPER(${args[0]})`;
        default:
            throw new Error(`Unsupported function: ${node.func}`);
    }
}

function determineSqlType(value) {
    if (typeof value === 'number') {
        return sql.Int;  
    } else if (typeof value === 'boolean' || value === 'true' || value === 'false') {
        return sql.Bit;  
    } else {
        return sql.NVarChar;  
    }
}

function parseOData(filter) {
    const tokenizer = new ODataTokenizer(filter);
    let token = tokenizer.nextToken();

    function parseExpression() {
        let left = parseUnaryExpression();
        
        while (token.type === 'KEYWORD' && (token.value === 'AND' || token.value === 'OR')) {
            const operator = token.value.toLowerCase();
            token = tokenizer.nextToken();
            const right = parseUnaryExpression();
            left = {
                type: operator,
                left: left,
                right: right
            };
        }
        
        return left;
    }

    function parseUnaryExpression() {
        if (token.type === 'FUNCTION') {
            const functionName = token.value;
            token = tokenizer.nextToken();
            
            if (token.type !== 'OPEN_PAREN') {
                throw new Error('Expected "(" after function name.');
            }
            
            token = tokenizer.nextToken();
            const args = [];
            
            while (token.type !== 'CLOSE_PAREN') {
                if (token.type === 'IDENTIFIER') {
                    args.push({ type: 'property', name: token.value });
                    token = tokenizer.nextToken();
                } else if (token.type === 'STRING') {
                    args.push({ type: 'literal', value: token.value });
                    token = tokenizer.nextToken();
                } else if (token.type === 'NUMBER') {
                    args.push({ type: 'literal', value: token.value });
                    token = tokenizer.nextToken();
                }
                
                if (token.type === 'COMMA') {
                    token = tokenizer.nextToken();
                    continue;
                } else if (token.type !== 'CLOSE_PAREN') {
                    throw new Error('Expected comma or ")" after function argument.');
                }
            }
            
            token = tokenizer.nextToken(); // consume the closing parenthesis
            
            return {
                type: 'functioncall',
                func: functionName,
                args: args
            };
        } else if (token.type === 'IDENTIFIER') {
            const propertyName = token.value;
            token = tokenizer.nextToken();
            
            if (token.type === 'OPERATOR') {
                const operator = token.value;
                token = tokenizer.nextToken();
                if (token.type === 'STRING' || token.type === 'NUMBER' || token.type === 'BOOLEAN') {
                    const literalValue = token.value;
                    token = tokenizer.nextToken();
                    return {
                        type: getExpressionType(operator),
                        left: { type: 'property', name: propertyName },
                        right: { type: 'literal', value: literalValue }
                    };
                }
                throw new Error('Expected string, number, or boolean literal after operator.');
            }
            throw new Error('Expected operator after identifier.');
        } else if (token.type === 'OPEN_PAREN') {
            token = tokenizer.nextToken();
            const expression = parseExpression();
            if (token.type !== 'CLOSE_PAREN') {
                throw new Error('Expected ")" after expression.');
            }
            token = tokenizer.nextToken();
            return expression;
        } else if (token.type === 'KEYWORD' && token.value.toUpperCase() === 'NOT') {
            token = tokenizer.nextToken();
            return {
                type: 'not',
                source: parseUnaryExpression()
            };
        }
        throw new Error('Unexpected token: ' + JSON.stringify(token));
    }

    function getExpressionType(operator) {
        switch (operator) {
            case 'eq': return 'eq';
            case 'ne': return 'ne';
            case 'gt': return 'gt';
            case 'lt': return 'lt';
            case 'ge': return 'ge';
            case 'le': return 'le';
            default: throw new Error('Unsupported operator: ' + operator);
        }
    }

    const expression = parseExpression();
    if (token.type !== 'EOF') {
        throw new Error('Unexpected token at end of expression.');
    }
    return expression;
}

class ODataTokenizer {
    constructor(odataString) {
        this.odataString = odataString;
        this.position = 0;
    }
    
    nextToken() {
        this.skipWhitespace();
        
        if (this.position >= this.odataString.length) {
            return { type: 'EOF', value: null };
        }
        
        let char = this.odataString[this.position];
        
        // Check for operators first before identifiers
        if (this.isOperator()) {
            return this.parseOperator();
        } else if (this.isLetter(char)) {
            return this.parseIdentifierOrKeyword();
        } else if (this.isDigit(char) || char === '-') {
            return this.parseNumber();
        } else if (char === "'") {
            return this.parseString();
        } else if (char === '(') {
            this.position++;
            return { type: 'OPEN_PAREN', value: char };
        } else if (char === ')') {
            this.position++;
            return { type: 'CLOSE_PAREN', value: char };
        } else if (char === ',') {
            this.position++;
            return { type: 'COMMA', value: char };
        } else {
            throw new Error('Unexpected character: ' + char);
        }
    }
    
    skipWhitespace() {
        while (this.position < this.odataString.length && this.isWhitespace(this.odataString[this.position])) {
            this.position++;
        }
    }
    
    isLetter(char) {
        return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
    }
    
    isDigit(char) {
        return char >= '0' && char <= '9';
    }
    
    isWhitespace(char) {
        return char === ' ' || char === '\t' || char === '\n' || char === '\r';
    }
    
    // Fixed: Check if current position contains any of the operators
    isOperator() {
        const operators = ['eq', 'ne', 'gt', 'lt', 'ge', 'le'];
        for (const op of operators) {
            if (this.odataString.substring(this.position, this.position + op.length) === op) {
                return true;
            }
        }
        return false;
    }
    
    parseIdentifierOrKeyword() {
        let value = '';
        while (this.position < this.odataString.length && 
               (this.isLetter(this.odataString[this.position]) || 
                this.isDigit(this.odataString[this.position]) || 
                this.odataString[this.position] === '_')) {
            value += this.odataString[this.position];
            this.position++;
        }
        
        const upperValue = value.toUpperCase();
        if (['AND', 'OR', 'NOT'].includes(upperValue)) {
            return { type: 'KEYWORD', value: upperValue };
        } else if (upperValue === 'TRUE' || upperValue === 'FALSE') {
            return { type: 'BOOLEAN', value: upperValue === 'TRUE' };
        } else if (this.position < this.odataString.length && this.odataString[this.position] === '(') {
            return { type: 'FUNCTION', value: value };
        } else {
            return { type: 'IDENTIFIER', value: value };
        }
    }
    
    parseNumber() {
        let value = '';
        while (this.position < this.odataString.length && (this.isDigit(this.odataString[this.position]) || this.odataString[this.position] === '.' || this.odataString[this.position] === '-')) {
            value += this.odataString[this.position];
            this.position++;
        }
        
        if (value === '-' && this.position < this.odataString.length && this.isDigit(this.odataString[this.position])) {
            value += this.odataString[this.position];
            this.position++;
        }
        
        if (value.startsWith('-') && value.length === 1) {
            throw new Error('Invalid number format: lone minus sign');
        }
        
        if (isNaN(Number(value))) {
            throw new Error('Invalid number format: ' + value);
        }
        
        return { type: 'NUMBER', value: Number(value) };
    }
    
    parseString() {
        this.position++; // Skip the opening quote
        let value = '';
        while (this.position < this.odataString.length && this.odataString[this.position] !== "'") {
            value += this.odataString[this.position];
            this.position++;
        }
        
        if (this.position >= this.odataString.length || this.odataString[this.position] !== "'") {
            throw new Error('Unterminated string literal');
        }
        this.position++; // Skip the closing quote
        return { type: 'STRING', value: value };
    }
    
    parseOperator() {
        const operators = ['eq', 'ne', 'gt', 'lt', 'ge', 'le'];
        
        // Skip any leading whitespace
        this.skipWhitespace();
        
        for (const op of operators) {
            const remainingText = this.odataString.substring(this.position);
            const match = remainingText.match(new RegExp(`^${op}\\b`));
            if (match) {
                this.position += op.length;
                return { type: 'OPERATOR', value: op };
            }
        }
        
        throw new Error('Invalid operator');
    }
}

module.exports = { translateODataToSql, parseOData };