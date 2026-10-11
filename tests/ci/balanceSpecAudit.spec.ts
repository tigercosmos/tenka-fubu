import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  auditBalanceSpec,
  parseBalanceSource,
  parseBalanceSpec,
} from '../../tools/ci/balance-spec-audit';

function spec(rows: string[], count = rows.length, tail = '') {
  return `### 5.1 BAL 常數主表（${count} 項模擬層常數）
#### 測試
| 常數 \`BAL.*\` | 定案值 | 單位 | 語意 | 出處 | 備註 |
|---|---|---|---|---|---|
${rows.map((row) => `| ${row} |`).join('\n')}
### 5.2 值定案與別名併入
${tail}`;
}
const row = (name: string, value: string, note = '') =>
  `\`${name}\` | ${value} | 點 | 測試 | 15 | ${note}`;

describe('read-only balance specification audit', () => {
  it('records the real derived calibration as unverified without claiming a literal or scenario proof', () => {
    const text = readFileSync(new URL('../../plan/15-balance.md', import.meta.url), 'utf8');
    const source = readFileSync(new URL('../../src/core/balance.ts', import.meta.url), 'utf8');
    const report = auditBalanceSpec(text, source);
    expect(report).toMatchObject({
      passed: false,
      valueProof: false,
      counts: { declared: 614, compared: 590 },
      derivedCalibrations: [
        {
          name: 'soldiersPerKoku',
          declaredApproximateValue: '≈0.025',
          basis: { name: 'soldiersPerPop', expected: 0.025, actual: 0.025 },
          assumption: { text: '郡人口 ≈ 郡石高', validated: false },
          status: 'unverified-calibration',
        },
      ],
    });
    expect(report.missingRows.some((item) => item.name === 'soldiersPerKoku')).toBe(true);
    expect(report.issues.filter((item) => item.name === 'soldiersPerKoku')).toEqual([
      expect.objectContaining({ kind: 'unverified-calibration', name: 'soldiersPerKoku' }),
    ]);
    expect(report.unsupportedValues).toEqual([]);
  });
  it.each([
    'derivation',
    'formula',
    'basis-drift',
    'basis-missing',
    'target-literal',
    'alias',
    'contradiction',
    'annotation',
    'basis-contradiction',
    'duplicate-evidence',
    'duplicate-ancillary-row',
    'duplicate-ancillary-bullet',
    'derivation-section-relocation',
    'formula-section-relocation',
  ])('fails closed for changed calibration evidence: %s', (change) => {
    let text = readFileSync(new URL('../../plan/15-balance.md', import.meta.url), 'utf8');
    let source = readFileSync(new URL('../../src/core/balance.ts', import.meta.url), 'utf8');
    if (change === 'derivation')
      text = text.replace('且劇本「郡人口 ≈ 郡石高」達成', '已驗證所有劇本');
    if (change === 'formula') text = text.replace('採 05 `maxSoldiers` 為唯一公式', '採石高公式');
    if (change === 'basis-drift')
      source = source.replace('soldiersPerPop: 0.025,', 'soldiersPerPop: 0.026,');
    if (change === 'basis-missing') source = source.replace('soldiersPerPop: 0.025,', '');
    if (change === 'target-literal')
      source = source.replace(
        'export const BAL = {',
        'export const BAL = { soldiersPerKoku: 0.025,',
      );
    if (change === 'alias') text = text.replaceAll('soldiersPerKoku', 'soldiersPerKokuAlias');
    if (change === 'contradiction') text += '\n`soldiersPerKoku` must instead be 0.04.\n';
    if (change === 'annotation') text += '\n`soldiersPerKoku` calibration validated.\n';
    if (change === 'basis-contradiction') text += '\n`soldiersPerPop` has a value of 0.04.\n';
    if (change === 'duplicate-evidence')
      text += `\n${text.split('\n').find((line) => line.startsWith('1. `soldiersPerKoku'))!}\n`;
    if (change === 'duplicate-ancillary-row')
      text += `\n${text.split('\n').find((line) => line.startsWith('| `garrisonPopRatio` ='))!}\n`;
    if (change === 'duplicate-ancillary-bullet')
      text += `\n${text.split('\n').find((line) => line.startsWith('- **可徵兵力**'))!}\n`;
    if (change === 'derivation-section-relocation') {
      const evidence = text.split('\n').find((line) => line.startsWith('1. `soldiersPerKoku'))!;
      text = text.replace(evidence, '').replace(/^(## 4[^\n]*)$/m, `$1\n${evidence}`);
    }
    if (change === 'formula-section-relocation') {
      const evidence = text.split('\n').find((line) => line.startsWith('| 城最大兵力 |'))!;
      text = text
        .replace(evidence, '')
        .replace(/^(### 5\.3[^\n]*)$/m, `## Relocated evidence\n${evidence}\n$1`);
    }
    const report = auditBalanceSpec(text, source);
    const target = change === 'alias' ? 'soldiersPerKokuAlias' : 'soldiersPerKoku';
    expect(report.derivedCalibrations).toEqual([]);
    expect(report.issues).toContainEqual(
      expect.objectContaining({ kind: 'unsupported-value', name: target }),
    );
    if (change !== 'target-literal')
      expect(report.issues).toContainEqual(
        expect.objectContaining({ kind: 'missing', name: target }),
      );
    expect(report.valueProof).toBe(false);
    expect(report.passed).toBe(false);
  });
  it('keeps calibration unverified when every literal row resolves and rejects unrelated approximate targets', () => {
    const text = readFileSync(new URL('../../plan/15-balance.md', import.meta.url), 'utf8');
    const source = readFileSync(
      new URL('../../src/core/balance.ts', import.meta.url),
      'utf8',
    ).replace(
      'export const BAL = {',
      'export const BAL = { facRangeGunAtkBonus: .10, facSmithyAtkBonus: .05, defaultDeathAge: 60, defaultDeathAgeSpread: 8, aiReactiveChecksPerTick: 8,',
    );
    // This is audit-input fault injection, not permission to add runtime constants.
    const report = auditBalanceSpec(text, source);
    expect(report.issues).toEqual([expect.objectContaining({ kind: 'unverified-calibration' })]);
    expect(report.counts.compared).toBe(595);
    expect(report.valueProof).toBe(false);
    expect(report.passed).toBe(false);
    const unknown = auditBalanceSpec(spec([row('futureCalibration', '≈0.025')]), 'const BAL={}');
    expect(unknown.issues.map((issue) => issue.kind)).toEqual(['missing', 'unsupported-value']);
    expect(unknown.derivedCalibrations).toEqual([]);
  });
  it('evaluates closed arithmetic, arrays and objects without executing source', () => {
    expect(
      parseBalanceSource(`import 'does-not-exist'; export const BAL = {
      a: 2 / 3, b: -(2 + 3), c: [1_000, { "__proto__": true, 1: null }],
      d: ({ low: .5, mid: 1 } satisfies object), e: 'text', f: 5 % 2,
    } as const;`),
    ).toEqual({
      a: 2 / 3,
      b: -5,
      c: [1000, { ['__proto__']: true, 1: null }],
      d: { low: 0.5, mid: 1 },
      e: 'text',
      f: 1,
    });
  });
  it.each([
    'a: globalThis.process.exit(0)',
    'a: variable',
    '...other',
    'a',
    'get a() { return 1 }',
    '["a"]: 1',
    'a: 1 / 0',
    'a: 0 / 0',
    'a: 1 ** 2',
    'a: [,...[]]',
    'a: "x" + "y"',
  ])('rejects unsafe or non-closed source: %s', (expression) => {
    expect(() => parseBalanceSource(`export const BAL = { ${expression} };`)).toThrow();
  });
  it('rejects duplicate keys including nested and equivalent textual names', () => {
    expect(() => parseBalanceSource('const BAL = {a:1,"a":2}')).toThrow('Duplicate BAL property');
    expect(() => parseBalanceSource('const BAL = {a:{x:1,x:2}}')).toThrow('Duplicate BAL property');
  });
  it('requires one syntactically valid literal BAL declaration', () => {
    for (const source of [
      'const OTHER={}',
      'const BAL={};const BAL={}',
      'const BAL = make()',
      'const BAL={a:}',
    ])
      expect(() => parseBalanceSource(source)).toThrow();
  });
  it('compares exact scalar values and reports injected mismatches', () => {
    const text = spec([row('a', '0.5'), row('b', '-2'), row('c', '50_000_000')]);
    expect(auditBalanceSpec(text, 'const BAL={a:1/2,b:-2,c:50_000_000}').valueProof).toBe(true);
    const report = auditBalanceSpec(text, 'const BAL={a:.6,b:-2,c:50_000_000}');
    expect(report.passed).toBe(false);
    expect(report.issues).toEqual([
      {
        kind: 'value-mismatch',
        name: 'a',
        evidence: 'Main-table line 5',
        expected: 0.5,
        actual: 0.6,
      },
    ]);
  });
  it('compares closed scalar fractions exactly without evaluating expressions', () => {
    expect(auditBalanceSpec(spec([row('a', '2/3')]), 'const BAL={a:2/3}').passed).toBe(true);
    expect(auditBalanceSpec(spec([row('a', ' 2 / 3 ')]), 'const BAL={a:1/3}').issues[0]?.kind).toBe(
      'value-mismatch',
    );
    for (const value of ['1/0', '0/0', '1/2/3', '(1+1)/3', '1,00/3', '1e309/1']) {
      const report = auditBalanceSpec(spec([row('a', value)]), 'const BAL={a:1}');
      expect(report.unsupportedValues.map((item) => item.name)).toEqual(['a']);
      expect(report.passed).toBe(false);
    }
  });
  it('compares all array elements and exact object keys, irrespective of object order', () => {
    const text = spec([
      row('rankSalary', '[3,6,10]'),
      row('conscriptPolicyFactor', '低0.5/中1.0/高1.8'),
    ]);
    expect(
      auditBalanceSpec(
        text,
        'const BAL={rankSalary:[3,6,10],conscriptPolicyFactor:{high:1.8,low:.5,mid:1}}',
      ).passed,
    ).toBe(true);
    const report = auditBalanceSpec(
      text,
      'const BAL={rankSalary:[3,6,11],conscriptPolicyFactor:{low:.5,mid:1,high:1.8,extra:1}}',
    );
    expect(report.issues.map((issue) => issue.name)).toEqual([
      'rankSalary',
      'conscriptPolicyFactor',
    ]);
  });
  it('does not silently ignore unsupported semantic values', () => {
    const report = auditBalanceSpec(spec([row('a', '≈0.025')]), 'const BAL={a:.025}');
    expect(report.unsupportedValues).toEqual([{ name: 'a', line: 5, value: '≈0.025' }]);
    expect(report.valueProof).toBe(false);
    expect(report.issues[0]?.kind).toBe('unsupported-value');
  });
  it('name-only mode explicitly provides no value proof', () => {
    const report = auditBalanceSpec(spec([row('a', '≈0.025')]), 'const BAL={a:99}', 'names');
    expect(report.passed).toBe(true);
    expect(report.valueProof).toBe(false);
    expect(report.counts.compared).toBe(0);
  });
  it('retains all orphan and missing names; other canonical evidence is not main-table coverage', () => {
    const report = auditBalanceSpec(
      spec([row('a', '1')], 1, '表 C 新增 `b`＝2'),
      'const BAL={b:2}',
    );
    expect(report.orphanKeys).toEqual(['b']);
    expect(report.missingRows.map((item) => item.name)).toEqual(['a']);
    expect(report.otherCanonicalEvidence[0]?.name).toBe('b');
    expect(report.issues.map((issue) => issue.kind)).toEqual(['orphan', 'missing']);
  });
  it('classifies exclusions only from explicit specification annotations', () => {
    const text = spec(
      [
        row('future', '1', 'v1.0 不進 `balance.ts`'),
        row('old', '2', '⚠ 廢除'),
        row('diffAiIncomeMult', '0.8/1.0/1.2'),
      ],
      3,
      '**難易度不進 `BAL`**：`diffAi*` 在另一表。',
    );
    const report = auditBalanceSpec(text, 'const BAL={}');
    expect(report.passed).toBe(true);
    expect(report.missingRows).toHaveLength(3);
    expect(report.exclusions.map((item) => item.disposition)).toEqual([
      'v1.1',
      'deprecated',
      'difficulty',
    ]);
    expect(auditBalanceSpec(text, 'const BAL={future:1}').issues[0]?.kind).toBe(
      'excluded-implemented',
    );
    expect(
      auditBalanceSpec(spec([row('diffAiUnannotated', '1')]), 'const BAL={}').issues[0]?.kind,
    ).toBe('missing');
  });
  it('classifies explicit non-simulation table entries rather than permitting them', () => {
    const text = spec(
      [row('a', '1')],
      1,
      `#### 表 D — 非模擬層常數
| \`uiDprMax\` | 2 | 倍 | 說明 | 01 |
### 5.3 下節`,
    );
    expect(auditBalanceSpec(text, 'const BAL={a:1,uiDprMax:2}').issues[0]?.kind).toBe(
      'non-simulation',
    );
    const shared = text
      .replace('（1 項', '（2 項')
      .replace('### 5.2 ', `| ${row('uiDprMax', '2')} |\n### 5.2 `);
    expect(
      auditBalanceSpec(shared, 'const BAL={a:1,uiDprMax:2}').issues.map((issue) => issue.kind),
    ).toEqual(['non-simulation']);
  });
  it('rejects duplicate rows, malformed columns and missing/duplicate boundaries', () => {
    expect(() => parseBalanceSpec(spec([row('a', '1'), row('a', '1')]))).toThrow(
      'Duplicate specification row',
    );
    expect(() => parseBalanceSpec(spec(['`a` | 1']))).toThrow('six main-table columns');
    expect(() => parseBalanceSpec(spec([row('a', '1')]).replace('### 5.2 ', '### other '))).toThrow(
      'Missing section boundary',
    );
    expect(() => parseBalanceSpec(`${spec([row('a', '1')])}\n### 5.1 BAL 常數主表`)).toThrow(
      'Expected one section',
    );
  });
  it('reports a stale headline count instead of accepting it as table coverage', () => {
    expect(auditBalanceSpec(spec([row('a', '1')], 542), 'const BAL={a:1}').issues[0]?.kind).toBe(
      'master-count',
    );
  });
  it.each(['12,3', '1_23', '12,,300', '1,000_000', '1__000'])(
    'rejects malformed numeric grouping: %s',
    (value) => {
      expect(auditBalanceSpec(spec([row('a', value)]), 'const BAL={a:123}').issues[0]?.kind).toBe(
        'unsupported-value',
      );
    },
  );
  it('rejects duplicate and incorrect main-table headers', () => {
    const text = spec([row('a', '1')]);
    const header = '| 常數 `BAL.*` | 定案值 | 單位 | 語意 | 出處 | 備註 |';
    expect(() => parseBalanceSpec(text.replace(header, `${header}\n${header}`))).toThrow(
      'duplicate main-table header',
    );
    expect(() => parseBalanceSpec(text.replace('定案值 |', '錯誤 |'))).toThrow('main-table header');
  });
  it.each([
    ['kassenFieldH', 16],
    ['kassenFieldW', 24],
    ['kassenMaxRounds', 60],
    ['armyMaxSubOfficers', 2],
    ['battleSaihaiMax', 100],
    ['allianceTrustMin', 60],
  ] as const)('rejects reintroduced retired real-spec key %s', (name, value) => {
    const text = readFileSync(new URL('../../plan/15-balance.md', import.meta.url), 'utf8');
    const source = readFileSync(new URL('../../src/core/balance.ts', import.meta.url), 'utf8');
    const changed = source.replace(
      'export const BAL = {',
      `export const BAL = { ${name}: ${value},`,
    );
    expect(changed).not.toBe(source);
    expect(auditBalanceSpec(text, changed).issues).toContainEqual(
      expect.objectContaining({ kind: 'excluded-implemented', name }),
    );
    const lines = text.split('\n');
    const index = lines.findIndex((line) => line.startsWith(`| \u0060${name}\u0060 |`));
    expect(index).toBeGreaterThanOrEqual(0);
    const columns = lines[index]!.split('|');
    columns[6] = ' ';
    lines[index] = columns.join('|');
    expect(auditBalanceSpec(lines.join('\n'), source).issues).toContainEqual(
      expect.objectContaining({ kind: 'missing', name }),
    );
  });

  it('audits the entire real specification and reports the current unresolved sets', () => {
    const text = readFileSync(new URL('../../plan/15-balance.md', import.meta.url), 'utf8');
    const source = readFileSync(new URL('../../src/core/balance.ts', import.meta.url), 'utf8');
    const report = auditBalanceSpec(text, source);
    expect(report.counts).toEqual({
      declared: 614,
      rows: 614,
      implemented: 590,
      shared: 590,
      compared: 590,
    });
    expect(report.orphanKeys).toEqual([]);
    expect(report.missingRows).toHaveLength(24);
    expect(report.exclusions).toHaveLength(18);
    expect(report.unsupportedValues).toEqual([]);
    expect(report.issues.filter((issue) => issue.kind === 'value-mismatch')).toEqual([]);
    expect(
      report.issues.filter((issue) => issue.kind === 'non-simulation').map((issue) => issue.name),
    ).toEqual([]);
    expect(report.passed).toBe(false);
    expect(report.issues).toHaveLength(6);
    expect(report.issues.some((issue) => issue.name === 'allianceTrustMin')).toBe(false);
    expect(parseBalanceSource(source).trustCostAlliance).toBe(60);
    expect(
      auditBalanceSpec(text, source.replace('trustCostAlliance: 60,', 'trustCostAlliance: 59,'))
        .issues,
    ).toContainEqual(
      expect.objectContaining({
        kind: 'value-mismatch',
        name: 'trustCostAlliance',
        expected: 60,
        actual: 59,
      }),
    );
    expect(report.issues.some((issue) => issue.name === 'betrayalTrustPenaltyOthers')).toBe(false);
    expect(report.issues.some((issue) => issue.name === 'vassalPrestigeGap')).toBe(false);
    expect(parseBalanceSource(source).vassalPrestigeGap).toBe(500);
    expect(parseBalanceSource(source).facDiplomacyWorkGainMult).toBe(1.1);
    expect(parseBalanceSource(source).polTenmaseiMarchSpeedMult).toBe(1.1);
    expect(parseBalanceSource(source).polEnkokinkoWorkGainMult).toBe(1.25);
    expect(
      auditBalanceSpec(
        text,
        source.replace('polEnkokinkoWorkGainMult: 1.25,', 'polEnkokinkoWorkGainMult: 1.2,'),
      ).issues,
    ).toContainEqual(
      expect.objectContaining({
        kind: 'value-mismatch',
        name: 'polEnkokinkoWorkGainMult',
        expected: 1.25,
        actual: 1.2,
      }),
    );
    expect(
      auditBalanceSpec(
        text,
        source.replace('polTenmaseiMarchSpeedMult: 1.1,', 'polTenmaseiMarchSpeedMult: 1.2,'),
      ).issues,
    ).toContainEqual(
      expect.objectContaining({
        kind: 'value-mismatch',
        name: 'polTenmaseiMarchSpeedMult',
        expected: 1.1,
        actual: 1.2,
      }),
    );
    expect(
      auditBalanceSpec(
        text,
        source.replace('facDiplomacyWorkGainMult: 1.1,', 'facDiplomacyWorkGainMult: 1.2,'),
      ).issues,
    ).toContainEqual(
      expect.objectContaining({
        kind: 'value-mismatch',
        name: 'facDiplomacyWorkGainMult',
        expected: 1.1,
        actual: 1.2,
      }),
    );
    expect(
      auditBalanceSpec(text, source.replace('vassalPrestigeGap: 500,', 'vassalPrestigeGap: 499,'))
        .issues,
    ).toContainEqual(
      expect.objectContaining({
        kind: 'value-mismatch',
        name: 'vassalPrestigeGap',
        expected: 500,
        actual: 499,
      }),
    );
    expect(report.exclusions.some((row) => row.name === 'trustPerWorkMonth')).toBe(true);
    expect(report.missingRows.some((row) => row.name === 'importFileMaxBytes')).toBe(false);
    expect(text.slice(text.indexOf('#### 表 D'), text.indexOf('### 5.3'))).toContain(
      '| `importFileMaxBytes` | 50_000_000 |',
    );
    for (const [name, value] of [
      ['polTenmaseiTransportDaysMult', '1/3'],
      ['polTenmaseiMarchSpeedMult', '1.2'],
      ['polEnkokinkoWorkGainMult', '1.2'],
      ['plotPoachInvestGoldOptions', '[0,200,500,1001]'],
      ['castleStarveMoraleDaily', '3'],
    ]) {
      const changed = text.replace(
        new RegExp(`(\\| \u0060${name}\u0060 \\| )[^|]+`),
        `$1${value} `,
      );
      expect(changed).not.toBe(text);
      expect(
        auditBalanceSpec(changed, source).issues.some(
          (issue) => issue.kind === 'value-mismatch' && issue.name === name,
        ),
      ).toBe(true);
    }
    const badSummary = text.replace('從五位下(友20/獻300/威+50)', '從五位下(友21/獻300/威+50)');
    expect(
      auditBalanceSpec(badSummary, source).unsupportedValues.some(
        (value) => value.name === 'courtRankTable',
      ),
    ).toBe(true);
    const header = '| 階 | id | 官位 | 友好度需求 | 獻金（貫） | 威信加成 | 解鎖 |';
    expect(() => auditBalanceSpec(text.replace(header, `${header}\n${header}`), source)).toThrow();
    expect(() =>
      auditBalanceSpec(text.replace('#### 表 G —', '#### 表 G — duplicate\n#### 表 G —'), source),
    ).toThrow('Duplicate table G');
    // Inject real table faults: compare fields, not merely lengths or key presence.
    for (const mutation of [
      source.replace('favorRequired: 20,', 'favorRequired: 21,'),
      source.replace('requiresPatron: true,', 'requiresPatron: false,'),
    ])
      expect(
        auditBalanceSpec(text, mutation).issues.some((issue) => issue.kind === 'value-mismatch'),
      ).toBe(true);
  });
});
