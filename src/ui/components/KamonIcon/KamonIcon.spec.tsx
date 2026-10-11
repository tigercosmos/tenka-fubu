import { render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildTinyState } from '../../../../tests/fixtures/tiny';
import { KamonIcon, KAMON_SHAPES, renderKamon, type KamonShape } from './index';

const spec = (shape: KamonShape) => Object.freeze({ shape, fg: '#EDE4D3', bg: '#294C60' });
const markup = (shape: KamonShape, size = 64) =>
  renderToStaticMarkup(renderKamon(spec(shape), size));
const foreground = (shape: KamonShape) => {
  const { container } = render(<KamonIcon spec={spec(shape)} />);
  const group = container.querySelector('[data-part="foreground"]');
  if (group === null) throw new Error('Missing foreground');
  return group;
};

describe('deterministic geometric KamonIcon', () => {
  it('exports the exact twelve ordered canonical variants', () => {
    expect(KAMON_SHAPES).toEqual([
      'petal5',
      'petal6',
      'bars2',
      'bars3',
      'nestedDiamond',
      'tripleTriangle',
      'crossRing',
      'star3Bar',
      'tomoe3',
      'squareEyes4',
      'ring',
      'doubleRing',
    ]);
    expect(Object.isFrozen(KAMON_SHAPES)).toBe(true);
  });

  for (const shape of KAMON_SHAPES) {
    for (const size of [16, 24, 64]) {
      it(`${shape} at ${size}px serializes identically after interleaved renders`, () => {
        const first = markup(shape, size);
        for (const other of KAMON_SHAPES) markup(other, 24);
        expect(markup(shape, size)).toBe(first);
        expect(renderToStaticMarkup(<KamonIcon spec={spec(shape)} size={size} />)).toBe(first);
        expect(first).toContain(`width="${size}" height="${size}"`);
        expect(first).toContain('viewBox="0 0 64 64"');
        expect(first).not.toMatch(/\bid=|<mask|<script|href=|url\(/u);
      });
    }
  }

  it('uses the supplied background/foreground and a 40% gold 2px circular outline', () => {
    const { container } = render(<KamonIcon spec={spec('ring')} />);
    const background = container.querySelector('[data-part="background"]');
    const outline = container.querySelector('[data-part="outline"]');
    expect(background?.getAttribute('fill')).toBe('#294C60');
    for (const circle of [background, outline]) {
      expect(circle?.getAttribute('cx')).toBe('32');
      expect(circle?.getAttribute('cy')).toBe('32');
      expect(circle?.getAttribute('r')).toBe('30');
    }
    expect(outline?.getAttribute('stroke-opacity')).toBe('0.4');
    expect(outline?.getAttribute('stroke')).toBe('#b8862d');
    expect(outline?.getAttribute('stroke-width')).toBe('2');
    expect(outline?.getAttribute('fill')).toBe('none');
    expect(container.querySelector('[data-part="foreground"]')?.getAttribute('fill')).toBe(
      '#EDE4D3',
    );
  });

  it('lays out radial petals and equally spaced rounded bars', () => {
    for (const [shape, count] of [
      ['petal5', 5],
      ['petal6', 6],
    ] as const) {
      const petals = foreground(shape).querySelectorAll('ellipse');
      expect(petals.length).toBe(count);
      petals.forEach((petal, index) => {
        expect(petal.getAttribute('cy')).toBe('14');
        expect(petal.getAttribute('rx')).toBe('5');
        expect(petal.getAttribute('ry')).toBe('10');
        expect(petal.getAttribute('transform')).toBe(`rotate(${(index * 360) / count} 32 32)`);
      });
    }
    for (const [shape, ys] of [
      ['bars2', ['22', '34']],
      ['bars3', ['16', '28', '40']],
    ] as const) {
      const bars = [...foreground(shape).querySelectorAll('rect')];
      expect(bars.map((bar) => bar.getAttribute('y'))).toEqual(ys);
      bars.forEach((bar) => {
        expect(bar.getAttribute('width')).toBe('36');
        expect(bar.getAttribute('height')).toBe('8');
        expect(bar.getAttribute('rx')).toBe('2');
      });
    }
  });

  it('constructs the diamond, triangle, star and tomoe algorithms', () => {
    const diamonds = foreground('nestedDiamond');
    expect(diamonds.firstElementChild?.getAttribute('transform')).toBe('rotate(45 32 32)');
    expect(
      [...diamonds.querySelectorAll('rect')].map((rect) => [
        rect.getAttribute('x'),
        rect.getAttribute('y'),
        rect.getAttribute('width'),
      ]),
    ).toEqual([
      ['19', '19', '12'],
      ['33', '19', '12'],
      ['19', '33', '12'],
      ['33', '33', '12'],
    ]);
    expect(foreground('tripleTriangle').querySelector('path')?.getAttribute('d')).toBe(
      'M32 14L24 27.856406H40Z M22 32L14 45.856406H30Z M42 32L34 45.856406H50Z',
    );
    const star = foreground('star3Bar');
    expect(star.querySelector('rect')?.getAttribute('y')).toBe('22');
    expect(
      [...star.querySelectorAll('circle')].map((circle) => [
        circle.getAttribute('cx'),
        circle.getAttribute('cy'),
        circle.getAttribute('r'),
      ]),
    ).toEqual([
      ['20', '38', '4'],
      ['32', '38', '4'],
      ['44', '38', '4'],
    ]);
    expect(
      [...foreground('tomoe3').querySelectorAll('circle')].map((circle) => [
        circle.getAttribute('cy'),
        circle.getAttribute('r'),
        circle.getAttribute('transform'),
      ]),
    ).toEqual([
      ['22', '9', 'rotate(0 32 32)'],
      ['22', '9', 'rotate(120 32 32)'],
      ['22', '9', 'rotate(240 32 32)'],
    ]);
  });

  it('follows filled squareEyes4 §5.4 diamonds rather than inventing square holes', () => {
    const diamonds = foreground('squareEyes4');
    expect(diamonds.querySelectorAll('rect').length).toBe(4);
    expect(diamonds.querySelectorAll('path').length).toBe(0);
    expect([...diamonds.children].map((group) => group.getAttribute('transform'))).toEqual(
      [0, 90, 180, 270].map((angle) => `rotate(${angle} 32 32)`),
    );
    diamonds.querySelectorAll('rect').forEach((rect) => {
      expect(rect.getAttribute('width')).toBe('10');
      expect(rect.getAttribute('height')).toBe('10');
      expect(rect.getAttribute('transform')).toBe('rotate(45 32 21)');
    });
  });

  it('uses single even-odd paths for annuli and the central cross void, without reusable IDs', () => {
    for (const [shape, circles] of [
      ['ring', 2],
      ['doubleRing', 4],
      ['crossRing', 1],
    ] as const) {
      const path = foreground(shape).querySelector('path');
      expect(path?.getAttribute('fill-rule')).toBe('evenodd');
      expect(path?.getAttribute('d')?.match(/a\d+ \d+ 0 1 0/gu)?.length).toBe(circles * 2);
    }
    expect(foreground('crossRing').querySelector('path')?.getAttribute('d')).toContain(
      'M28.5 28.5H35.5V35.5H28.5Z',
    );
    expect(foreground('ring').querySelector('path')?.getAttribute('d')).toContain('a13 13');
    expect(foreground('doubleRing').querySelector('path')?.getAttribute('d')).toContain('a23 23');
  });

  it('supports named and decorative accessible SVG without generated title IDs', () => {
    const { container, getByRole } = render(<KamonIcon spec={spec('petal5')} label="  家紋  " />);
    expect(getByRole('img', { name: '家紋' }).getAttribute('focusable')).toBe('false');
    expect(container.querySelector('title')?.textContent).toBe('家紋');
    const decorative = renderToStaticMarkup(<KamonIcon spec={spec('petal5')} label=" " />);
    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).not.toContain('<title>');
    const hostile = renderToStaticMarkup(
      <KamonIcon spec={spec('ring')} label={'<script>alert(1)</script>'} />,
    );
    expect(hostile).not.toContain('<script>');
    expect(hostile).toContain('&lt;script&gt;');
  });

  it('rejects external SVG paint sources and invalid sizes without mutating state or RNG', () => {
    const state = buildTinyState();
    const before = JSON.stringify(state);
    for (const shape of KAMON_SHAPES) markup(shape);
    expect(JSON.stringify(state)).toBe(before);
    expect(() =>
      renderToStaticMarkup(
        renderKamon({ shape: 'ring', fg: 'url(https://example.com/x)', bg: '#fff' }),
      ),
    ).toThrow(TypeError);
    for (const size of [0, -1, NaN, Infinity])
      expect(() => markup('ring', size)).toThrow(RangeError);
    for (const color of ['#fff', '#ffff', '#abcdef', '#abcdef88'])
      expect(() =>
        renderToStaticMarkup(renderKamon({ shape: 'ring', fg: color, bg: color })),
      ).not.toThrow();
  });
});
