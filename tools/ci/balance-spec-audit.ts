/** Read-only audit. This reports specification drift; it never repairs values or executes BAL code. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

type Literal = number | string | boolean | null | Literal[] | { [key: string]: Literal };
type Disposition = 'active' | 'v1.1' | 'deprecated' | 'difficulty' | 'deferred' | 'retired';
export interface SpecRow {
  name: string;
  value: string;
  line: number;
  source: string;
  disposition: Disposition;
  dispositionEvidence: string | null;
}
export interface AuditIssue {
  kind:
    | 'master-count'
    | 'orphan'
    | 'missing'
    | 'excluded-implemented'
    | 'non-simulation'
    | 'unsupported-value'
    | 'unverified-calibration'
    | 'value-mismatch';
  name: string;
  evidence: string;
  expected?: Literal;
  actual?: Literal;
}
export interface BalanceAuditReport {
  mode: 'names' | 'values';
  valueProof: boolean;
  passed: boolean;
  counts: { declared: number; rows: number; implemented: number; shared: number; compared: number };
  // Raw key differences remain visible even when a source-backed exclusion is intentional.
  orphanKeys: string[];
  missingRows: SpecRow[];
  exclusions: SpecRow[];
  unsupportedValues: { name: string; line: number; value: string }[];
  otherCanonicalEvidence: { name: string; line: number; text: string }[];
  derivedCalibrations: DerivedCalibration[];
  issues: AuditIssue[];
}

export interface DerivedCalibration {
  name: 'soldiersPerKoku';
  line: number;
  declaredApproximateValue: '≈0.025';
  basis: { name: 'soldiersPerPop'; line: number; expected: number; actual: number };
  evidence: { role: 'derivation' | 'population-formula'; line: number; text: string }[];
  assumption: { text: '郡人口 ≈ 郡石高'; validated: false };
  status: 'unverified-calibration';
}

function fail(message: string): never {
  throw new Error(message);
}
function unwrapped(node: ts.Expression): ts.Expression {
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node)
  )
    return unwrapped(node.expression);
  return node;
}
function propertyName(node: ts.PropertyName): string {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node))
    return node.text;
  return fail('Computed property names are not closed literals');
}
function evaluate(node0: ts.Expression): Literal {
  const node = unwrapped(node0);
  if (ts.isNumericLiteral(node)) {
    const value = Number(node.text);
    if (!Number.isFinite(value)) fail('Non-finite numeric literal');
    return value;
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isPrefixUnaryExpression(node)) {
    const value = evaluate(node.operand);
    if (typeof value !== 'number') fail('Unary arithmetic requires numbers');
    if (node.operator === ts.SyntaxKind.MinusToken) return -value;
    if (node.operator === ts.SyntaxKind.PlusToken) return value;
    return fail('Unsupported unary operator');
  }
  if (ts.isBinaryExpression(node)) {
    const left = evaluate(node.left),
      right = evaluate(node.right);
    if (typeof left !== 'number' || typeof right !== 'number')
      fail('Binary arithmetic requires numbers');
    let value: number;
    switch (node.operatorToken.kind) {
      case ts.SyntaxKind.PlusToken:
        value = left + right;
        break;
      case ts.SyntaxKind.MinusToken:
        value = left - right;
        break;
      case ts.SyntaxKind.AsteriskToken:
        value = left * right;
        break;
      case ts.SyntaxKind.SlashToken:
        value = left / right;
        break;
      case ts.SyntaxKind.PercentToken:
        value = left % right;
        break;
      default:
        return fail('Unsupported binary operator');
    }
    if (!Number.isFinite(value)) fail('Non-finite arithmetic result');
    return value;
  }
  if (ts.isArrayLiteralExpression(node)) return node.elements.map((element) => evaluate(element));
  if (ts.isObjectLiteralExpression(node)) {
    const object: Record<string, Literal> = Object.create(null) as Record<string, Literal>;
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property))
        fail('Only literal property assignments are supported');
      const key = propertyName(property.name);
      if (Object.hasOwn(object, key)) fail(`Duplicate BAL property: ${key}`);
      object[key] = evaluate(property.initializer);
    }
    return object;
  }
  return fail(`Unsupported BAL expression: ${ts.SyntaxKind[node.kind]}`);
}

export function parseBalanceSource(source: string): Record<string, Literal> {
  const file = ts.createSourceFile(
    'balance.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  // The compiler parser can recover from syntax errors; recovery must not produce audit proof.
  const diagnostics = (file as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] })
    .parseDiagnostics;
  if (diagnostics.length) fail('Invalid TypeScript balance source');
  const declarations = file.statements.flatMap((statement) =>
    ts.isVariableStatement(statement)
      ? statement.declarationList.declarations.filter(
          (d) => ts.isIdentifier(d.name) && d.name.text === 'BAL',
        )
      : [],
  );
  if (declarations.length !== 1 || !declarations[0]?.initializer)
    fail('Expected exactly one BAL declaration');
  const initializer = unwrapped(declarations[0].initializer);
  if (!ts.isObjectLiteralExpression(initializer)) fail('BAL must be an object literal');
  return evaluate(initializer) as Record<string, Literal>;
}

function section(lines: string[], from: RegExp, to: RegExp): { start: number; end: number } {
  const starts = lines.flatMap((line, index) => (from.test(line) ? [index] : []));
  if (starts.length !== 1) fail(`Expected one section: ${from.source}`);
  const start = starts[0]!;
  const end = lines.findIndex((line, index) => index > start && to.test(line));
  if (end < 0) fail(`Missing section boundary: ${to.source}`);
  return { start, end };
}
function cells(line: string): string[] {
  return line
    .trim()
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

export function parseBalanceSpec(spec: string): {
  rows: SpecRow[];
  declared: number;
  lines: string[];
} {
  const lines = spec.split(/\r?\n/);
  const bounds = section(lines, /^### 5\.1 BAL 常數主表/, /^### 5\.2 /);
  const count = lines[bounds.start]!.match(/（(\d+) 項/);
  if (!count) fail('Missing main-table declared count');
  const rows: SpecRow[] = [],
    names = new Set<string>();
  let inTable = false,
    headerSeen = false;
  for (let i = bounds.start + 1; i < bounds.end; i++) {
    const line = lines[i]!;
    if (line.startsWith('#### ')) {
      inTable = false;
      headerSeen = false;
      continue;
    }
    if (!line.startsWith('|')) {
      if (inTable && line.trim()) inTable = false;
      continue;
    }
    if (!line.trim().endsWith('|')) fail(`Unclosed table row at ${i + 1}`);
    const parts = cells(line);
    if (parts.length !== 6) fail(`Expected six main-table columns at ${i + 1}`);
    if (parts[0] === '常數 `BAL.*`') {
      if (headerSeen || parts.join('|') !== '常數 `BAL.*`|定案值|單位|語意|出處|備註')
        fail(`Unexpected/duplicate main-table header at ${i + 1}`);
      headerSeen = true;
      continue;
    }
    if (parts.every((cell) => /^:?-+:?$/.test(cell))) {
      if (!headerSeen || inTable) fail(`Unexpected table separator at ${i + 1}`);
      inTable = true;
      continue;
    }
    if (!inTable) fail(`Main-table row outside a declared table at ${i + 1}`);
    const match = parts[0]!.match(/^`([A-Za-z][A-Za-z0-9]*)`$/);
    if (!match || !parts[1]) fail(`Malformed main-table row at ${i + 1}`);
    const name = match[1]!;
    if (names.has(name)) fail(`Duplicate specification row: ${name}`);
    names.add(name);
    const note = parts.slice(2).join(' | ');
    let disposition: Disposition = 'active',
      dispositionEvidence: string | null = null;
    if (/v1\.0 不進 `balance\.ts`/.test(note)) {
      disposition = 'v1.1';
      dispositionEvidence = note;
    } else if (/⚠ 廢(?:棄|除)/.test(note)) {
      disposition = 'deprecated';
      dispositionEvidence = note;
    } else if (/⚠ 廢止：03 §8 D\d+.+現行不進 `balance\.ts`/.test(note)) {
      disposition = 'retired';
      dispositionEvidence = note;
    } else if (/⚠ 延後：.*(?:02|14) §8.+現行不進 `balance\.ts`/.test(note)) {
      disposition = 'deferred';
      dispositionEvidence = note;
    } else if (/^diffAi/.test(name)) {
      const evidence = lines.find(
        (line) => line.includes('**難易度不進 `BAL`**') && line.includes('diffAi'),
      );
      if (evidence) {
        disposition = 'difficulty';
        dispositionEvidence = evidence;
      }
    }
    // This row has no inline status; table C/D4 explicitly abolish its flat mechanism.
    if (name === 'loyaltyFiefBonus') {
      const evidence = lines.find(
        (line) => line.startsWith('| 領主知行忠誠加成 |') && line.includes('常數廢'),
      );
      if (evidence) {
        disposition = 'deprecated';
        dispositionEvidence = evidence;
      }
    }
    rows.push({
      name,
      value: parts[1],
      line: i + 1,
      source: parts[4]!,
      disposition,
      dispositionEvidence,
    });
  }
  if (!rows.length) fail('Empty balance main table');
  return { rows, declared: Number(count[1]), lines };
}

function numeric(text: string): number | undefined {
  if (!/^[+−-]?(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,3}(?:_\d{3})+)(?:\.\d+)?$/.test(text))
    return undefined;
  const number = Number(text.replaceAll('−', '-').replaceAll('_', '').replaceAll(',', ''));
  return Number.isFinite(number) ? number : undefined;
}
function numberList(text: string): number[] | undefined {
  const parts = text.split(/[/,]/).map((part) => numeric(part.trim()));
  return parts.every((part): part is number => part !== undefined) ? parts : undefined;
}
function structuredTable(lines: string[], letter: 'G' | 'H'): Literal[] | undefined {
  if (lines.filter((line) => line.startsWith(`#### 表 ${letter} —`)).length > 1)
    fail(`Duplicate table ${letter} heading`);
  const start = lines.findIndex((line) => line.startsWith(`#### 表 ${letter} —`));
  if (start < 0) return undefined;
  const end0 = lines.findIndex((line, index) => index > start && /^#{1,4} /.test(line));
  const end = end0 < 0 ? lines.length : end0;
  const tableLines = lines.slice(start + 1, end).filter((line) => line.startsWith('|'));
  const header =
    letter === 'G'
      ? '階|id|官位|友好度需求|獻金（貫）|威信加成|解鎖'
      : '階|id|役職|威信需求|友好度|獻金（貫）|威信加成|效果';
  if (
    cells(tableLines[0] ?? '').join('|') !== header ||
    cells(tableLines[1] ?? '').length !== (letter === 'G' ? 7 : 8) ||
    !cells(tableLines[1] ?? '').every((cell) => /^:?-+:?$/.test(cell))
  )
    fail(`Unexpected table ${letter} header/dimensions`);
  const data = tableLines.slice(2);
  const result: Literal[] = [];
  const unlocks = [
    '—',
    '外交信用增益 ×1.1',
    '解鎖停戰斡旋',
    '政策槽 +1',
    '從屬勸告接受度 +10',
    '斡旋友好度成本 ×0.75',
    '同盟接受度 +5',
    '政策槽再 +1（累計 +2）',
  ];
  const effects = [
    '幕府事件額外選項',
    '外交/獻金工作月費 ×0.8',
    '從屬勸告接受度 +15',
    '政策槽 +1（須控京都城或為擁立者）',
    '大義名分：所有外交接受度 +10（須擁立將軍）',
  ];
  const ids = new Set<string>();
  for (const line of data) {
    const p = cells(line),
      id = p[1]?.match(/^`([a-z0-9]+)`$/)?.[1];
    if (p.length !== (letter === 'G' ? 7 : 8) || !id || ids.has(id))
      fail(`Malformed/duplicate table ${letter} row`);
    ids.add(id);
    const values = p
      .filter((_, index) => index === 0 || (index >= 3 && index < p.length - 1))
      .map((value) => numeric(value));
    if (values.some((value) => value === undefined))
      fail(`Unsupported table ${letter} numeric value`);
    const n = values as number[],
      index = n[0]! - 1;
    if (index !== result.length || p.at(-1) !== (letter === 'G' ? unlocks[index] : effects[index]))
      fail(`Unsupported table ${letter} order/effect text`);
    if (letter === 'G') {
      const unlock = [
        null,
        'trustGainBonus',
        'mediation',
        'policySlot',
        'vassalDemandBonus',
        'mediationDiscount',
        'allianceBonus',
        'policySlot',
      ][index]!;
      result.push({
        rank: n[0]!,
        id,
        name: p[2]!,
        favorRequired: n[1]!,
        goldCost: n[2]!,
        prestigeBonus: n[3]!,
        unlock,
      });
    } else {
      const effect = [
        'eventOption',
        'workCostDiscount',
        'vassalDemandBonus',
        'policySlot',
        'acceptanceAura',
      ][index]!;
      result.push({
        order: n[0]!,
        id,
        name: p[2]!,
        prestigeRequired: n[1]!,
        favorRequired: n[2]!,
        goldCost: n[3]!,
        prestigeBonus: n[4]!,
        requiresCapitalOrPatron: index === 3,
        requiresPatron: index === 4,
        effect,
      });
    }
  }
  if (result.length !== (letter === 'G' ? 8 : 5)) fail(`Incomplete table ${letter}`);
  return result;
}

/** Check the master shorthand too; a correct detailed table must not hide contradictory master values. */
function masterTableMatches(row: SpecRow, table: Literal[], letter: 'G' | 'H'): boolean {
  const suffixes =
    letter === 'G'
      ? [
          '',
          ',信用×1.1',
          ',解鎖停戰斡旋',
          ',政策槽+1',
          ',從屬勸告+10',
          ',斡旋成本×0.75',
          ',同盟+5',
          ',政策槽+1',
        ]
      : [',事件選項', ',工作費用×0.8', ',從屬勸告+15', ',政策槽+1', ',外交接受度+10'];
  const summaries = table.map((value, index) => {
    const item = value as Record<string, Literal>;
    const values =
      letter === 'G'
        ? [item.favorRequired, item.goldCost, item.prestigeBonus]
        : [item.prestigeRequired, item.favorRequired, item.goldCost, item.prestigeBonus];
    const prefixes =
      index === 0
        ? letter === 'G'
          ? ['友', '獻', '威+']
          : ['威', '友', '獻', '威+']
        : letter === 'G'
          ? ['', '', '+']
          : ['', '', '', '+'];
    if (typeof item.name !== 'string' || !values.every((value) => typeof value === 'number'))
      fail('Invalid structured shorthand input');
    return `${item.name}(${values.map((v, i) => `${prefixes[i]}${String(v)}`).join('/')}${suffixes[index]})`;
  });
  return row.value === summaries.join('/');
}

function expectedValue(row: SpecRow, lines: string[]): Literal | undefined {
  const n = numeric(row.value);
  if (n !== undefined) return n;
  const fraction = row.value.split('/');
  if (fraction.length === 2) {
    const numerator = numeric(fraction[0]!.trim());
    const denominator = numeric(fraction[1]!.trim());
    if (numerator !== undefined && denominator !== undefined && denominator !== 0) {
      const quotient = numerator / denominator;
      if (Number.isFinite(quotient)) return quotient;
    }
  }
  if (/^\[[\d,]+\]$/.test(row.value)) return numberList(row.value.slice(1, -1));
  if (row.name === 'rankTroopCap' && /^\{[\d,]+\}$/.test(row.value))
    return numberList(row.value.slice(1, -1));
  if (row.name === 'expectedRankAbilityThresholds') return numberList(row.value.split('（')[0]!);
  if (row.name === 'aweSentimentLoserHit' || row.name === 'aweSentimentNeighborHit') {
    const match = row.value.match(/^小([+-]?\d+)\/中([+-]?\d+)\/大([+-]?\d+)$/);
    return match ? match.slice(1).map(Number) : undefined;
  }
  if (
    ['conscriptPopFactor', 'conscriptPolicyFactor', 'conscriptSecurityDelta'].includes(row.name)
  ) {
    const match = row.value.match(/^低([+−-]?[\d.]+)\/中([+−-]?[\d.]+)\/高([+−-]?[\d.]+)$/);
    if (!match) return undefined;
    return { low: numeric(match[1]!)!, mid: numeric(match[2]!)!, high: numeric(match[3]!)! };
  }
  if (row.name === 'roadGradeSpeedMult') {
    const match = row.value.match(/^道級1:([\d.]+)\/2:([\d.]+)\/3:([\d.]+)$/);
    return match ? { 1: Number(match[1]), 2: Number(match[2]), 3: Number(match[3]) } : undefined;
  }
  if (row.name === 'taimeiUnlockPrestige') {
    const values = numberList(row.value),
      ids = [
        'sokuji-chohei',
        'kenkin-meneki',
        'sodoin',
        'gaiko-kosei',
        'rakuichi-shinko',
        'teppeki',
        'shippu-jinrai',
        'tenka-bushin',
      ];
    return values?.length === ids.length
      ? Object.fromEntries(ids.map((id, i) => [`taimei.${id}`, values[i]!]))
      : undefined;
  }
  if (row.name === 'tacticCooldownTicks' && /^\d+（鐵砲三段10）$/.test(row.value))
    return Number(row.value.split('（')[0]);
  if (row.name === 'courtRankTable' || row.name === 'shogunateTitleTable') {
    const letter = row.name === 'courtRankTable' ? 'G' : 'H';
    const table = structuredTable(lines, letter);
    return table && masterTableMatches(row, table, letter) ? table : undefined;
  }
  return undefined;
}
function equal(left: Literal, right: Literal): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return left.length === right.length && left.every((v, i) => equal(v, right[i]!));
  if (
    left &&
    right &&
    typeof left === 'object' &&
    typeof right === 'object' &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    const keys = Object.keys(left).sort(),
      other = Object.keys(right).sort();
    return (
      keys.length === other.length &&
      keys.every((key, i) => key === other[i] && equal(left[key]!, right[key]!))
    );
  }
  return false;
}

/** This target depends on scenario data; matching its basis does not prove calibration. */
function derivedCalibration(
  row: SpecRow,
  rows: SpecRow[],
  lines: string[],
  implemented: Record<string, Literal>,
): DerivedCalibration | undefined {
  if (
    row.name !== 'soldiersPerKoku' ||
    row.value !== '≈0.025' ||
    row.source !== '00 §6' ||
    row.disposition !== 'active' ||
    Object.hasOwn(implemented, row.name)
  )
    return undefined;
  const basis = rows.find((item) => item.name === 'soldiersPerPop');
  if (
    !basis ||
    basis.disposition !== 'active' ||
    basis.value !== '0.025' ||
    basis.source !== '05 §3.2.1' ||
    implemented.soldiersPerPop !== 0.025
  )
    return undefined;
  const derivation =
    '1. `soldiersPerKoku ≈ 0.025`：1 萬石 ≈ 250 常備兵。以 `soldiersPerPop = 0.025` 且劇本「郡人口 ≈ 郡石高」達成（05 §3.2.1）。';
  const formula =
    '| 城最大兵力 | 05 `maxSoldiers`（城格基礎 本1000/支500 + floor(Σpop×`soldiersPerPop` 0.025)×政策係數，含兵舍 +500） vs 02 §5.1 selector `castleMaxSoldiers` 用 `garrisonPopRatio`(0.08) | 採 05 `maxSoldiers` 為唯一公式（0.025 由 00 §6 校準；0.08 給每萬人 800 兵違反目標）；`garrisonPopRatio` 刪，02 selector 改引 05 公式 | 02 §5.1/§5.7 |';
  const findUnique = (text: string) => {
    const indices = lines.flatMap((line, index) => (line === text ? [index] : []));
    return indices.length === 1 ? indices[0] : undefined;
  };
  const d = findUnique(derivation),
    f = findUnique(formula);
  const targetLine =
    '| `soldiersPerKoku` | ≈0.025 | 兵/石 | 每 1 石可養之常備兵數（1 萬石≈250 常備兵） | 00 §6 |  |';
  const basisLine =
    '| `soldiersPerPop` | 0.025 | 兵/人口(係數) | 人口換算為城最大兵力的係數 | 05 §3.2.1 |  |';
  if (lines[row.line - 1] !== targetLine || lines[basis.line - 1] !== basisLine) return undefined;
  const headings = lines.flatMap((line, index) => (line.startsWith('### 3.4 ') ? [index] : []));
  if (d === undefined || f === undefined || headings.length !== 1 || d <= headings[0]!)
    return undefined;
  const end = lines.findIndex((line, index) => index > headings[0]! && /^#{1,3} /.test(line));
  if (end < 0 || d >= end) return undefined;
  const formulaSections = lines.flatMap((line, index) =>
    line.startsWith('### 5.2 ') ? [index] : [],
  );
  if (formulaSections.length !== 1 || f <= formulaSections[0]!) return undefined;
  const formulaEnd = lines.findIndex(
    (line, index) => index > formulaSections[0]! && /^#{1,3} /.test(line),
  );
  if (formulaEnd < 0 || f >= formulaEnd) return undefined;
  // Additional target references or changed basis values invalidate this narrow evidence path.
  if (
    lines.some(
      (line, index) => line.includes('soldiersPerKoku') && index !== d && index !== row.line - 1,
    )
  )
    return undefined;
  const allowedBasisReferences = new Set([
    derivation,
    basisLine,
    formula,
    '| `garrisonPopRatio` = 0.08 | 02 §5.7 | `(刪除：城最大兵力採 05 maxSoldiers 公式；徵兵率用 soldiersPerPop 0.025)` | — | 城最大兵力 = 所轄郡人口和 × 此係數 |',
    '- **可徵兵力**：`soldiersPerPop=0.025`、劇本郡人口 ≈ 郡石高 → 10 萬石 ≈ 10 萬人口 → 常備上限 ≈ 2,500；',
  ]);
  if (lines.some((line) => line.includes('soldiersPerPop') && !allowedBasisReferences.has(line)))
    return undefined;
  if ([...allowedBasisReferences].some((reference) => findUnique(reference) === undefined))
    return undefined;
  return {
    name: 'soldiersPerKoku',
    line: row.line,
    declaredApproximateValue: '≈0.025',
    basis: { name: 'soldiersPerPop', line: basis.line, expected: 0.025, actual: 0.025 },
    evidence: [
      { role: 'derivation', line: d + 1, text: derivation },
      { role: 'population-formula', line: f + 1, text: formula },
    ],
    assumption: { text: '郡人口 ≈ 郡石高', validated: false },
    status: 'unverified-calibration',
  };
}

export function auditBalanceSpec(
  spec: string,
  source: string,
  mode: 'names' | 'values' = 'values',
): BalanceAuditReport {
  const { rows, declared, lines } = parseBalanceSpec(spec),
    implemented = parseBalanceSource(source);
  const names = new Set(rows.map((row) => row.name)),
    keys = Object.keys(implemented);
  const orphanKeys = keys.filter((key) => !names.has(key)).sort();
  const missingRows = rows.filter((row) => !Object.hasOwn(implemented, row.name));
  const issues: AuditIssue[] = [],
    unsupportedValues: BalanceAuditReport['unsupportedValues'] = [];
  const otherCanonicalEvidence: BalanceAuditReport['otherCanonicalEvidence'] = [];
  const derivedCalibrations: DerivedCalibration[] = [];
  if (declared !== rows.length)
    issues.push({
      kind: 'master-count',
      name: '§5.1',
      evidence: `Declared ${declared}; parsed ${rows.length} unique rows`,
    });
  const mainBounds = section(lines, /^### 5\.1 BAL 常數主表/, /^### 5\.2 /);
  const nonSimulation = new Set<string>();
  const d = lines.findIndex((line) => line.startsWith('#### 表 D — 非模擬層常數'));
  if (d >= 0) {
    const end = lines.findIndex((line, index) => index > d && /^#{1,4} /.test(line));
    for (const line of lines.slice(d + 1, end < 0 ? lines.length : end)) {
      const name = line.match(/^\| `([A-Za-z][A-Za-z0-9]*)` \|/)?.[1];
      if (name) nonSimulation.add(name);
    }
  }
  for (const key of orphanKeys) {
    const references = lines.flatMap((text, index) =>
      (index < mainBounds.start || index >= mainBounds.end) && text.includes(`\`${key}`)
        ? [{ name: key, line: index + 1, text }]
        : [],
    );
    otherCanonicalEvidence.push(...references);
    issues.push({
      kind: nonSimulation.has(key) ? 'non-simulation' : 'orphan',
      name: key,
      evidence: nonSimulation.has(key)
        ? '§5.2 table D explicitly excludes this key from BAL'
        : 'Implemented key has no §5.1 row; other source evidence does not establish master-table coverage',
      actual: implemented[key]!,
    });
  }
  for (const key of keys.filter((key) => nonSimulation.has(key) && names.has(key)))
    issues.push({
      kind: 'non-simulation',
      name: key,
      evidence: '§5.2 table D excludes this key even when it is also present in the master table',
      actual: implemented[key]!,
    });
  let compared = 0;
  for (const row of rows) {
    const exists = Object.hasOwn(implemented, row.name);
    if (row.disposition !== 'active') {
      if (exists)
        issues.push({
          kind: 'excluded-implemented',
          name: row.name,
          evidence: row.dispositionEvidence!,
        });
      continue;
    }
    const derived = derivedCalibration(row, rows, lines, implemented);
    if (derived) {
      derivedCalibrations.push(derived);
      issues.push({
        kind: 'unverified-calibration',
        name: row.name,
        evidence: `Main-table line ${row.line}; derivation line ${derived.evidence[0]!.line}; population-formula line ${derived.evidence[1]!.line}. Scenario population approximately equals kokudaka; scenario data is not validated by this audit.`,
      });
      continue;
    }
    if (!exists)
      issues.push({
        kind: 'missing',
        name: row.name,
        evidence: `Main-table line ${row.line}: ${row.value}; ${row.source}`,
      });
    if (mode === 'names') continue;
    const expected = expectedValue(row, lines);
    if (expected === undefined) {
      unsupportedValues.push({ name: row.name, line: row.line, value: row.value });
      issues.push({
        kind: 'unsupported-value',
        name: row.name,
        evidence: `No closed value decoder for main-table line ${row.line}: ${row.value}`,
      });
    } else if (exists) {
      compared++;
      if (!equal(expected, implemented[row.name]!))
        issues.push({
          kind: 'value-mismatch',
          name: row.name,
          evidence: `Main-table line ${row.line}`,
          expected,
          actual: implemented[row.name]!,
        });
    }
  }
  return {
    mode,
    valueProof: mode === 'values' && issues.length === 0,
    passed: issues.length === 0,
    counts: {
      declared,
      rows: rows.length,
      implemented: keys.length,
      shared: rows.length - missingRows.length,
      compared,
    },
    orphanKeys,
    missingRows,
    exclusions: rows.filter((row) => row.disposition !== 'active'),
    unsupportedValues,
    otherCanonicalEvidence,
    derivedCalibrations,
    issues,
  };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== '--names-only') || args.length > 1)
      fail('Usage: tsx tools/ci/balance-spec-audit.ts [--names-only]');
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const report = auditBalanceSpec(
      readFileSync(path.join(root, 'plan/15-balance.md'), 'utf8'),
      readFileSync(path.join(root, 'src/core/balance.ts'), 'utf8'),
      args.length ? 'names' : 'values',
    );
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
