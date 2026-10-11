import type { ReactNode } from 'react';
import type { KamonShape } from './types';

function number(value: number): string {
  return String(Number(value.toFixed(6)));
}
function circlePath(radius: number): string {
  return `M${32 - radius} 32a${radius} ${radius} 0 1 0 ${2 * radius} 0a${radius} ${radius} 0 1 0 ${-2 * radius} 0Z`;
}
function annulus(outer: number, inner: number): string {
  return `${circlePath(outer)} ${circlePath(inner)}`;
}
function triangle(x: number, y: number): string {
  const bottom = number(y + 8 * Math.sqrt(3));
  return `M${x} ${y}L${x - 8} ${bottom}H${x + 8}Z`;
}

/** Ring union 28×7 cross, minus its 7×7 central overlap; all voids are disjoint. */
function crossRingPath(): string {
  const reach = Math.sqrt(14 * 14 - 3.5 * 3.5),
    lo = number(32 - reach),
    hi = number(32 + reach);
  return `${circlePath(20)}
    M35.5 35.5H${hi}A14 14 0 0 1 35.5 ${hi}Z
    M28.5 35.5V${hi}A14 14 0 0 1 ${lo} 35.5Z
    M28.5 28.5H${lo}A14 14 0 0 1 28.5 ${lo}Z
    M35.5 28.5V${lo}A14 14 0 0 1 ${hi} 28.5Z
    M28.5 28.5H35.5V35.5H28.5Z`;
}

/** Presentation-only geometric approximations; no historical clan assignment or generated SVG IDs. */
export function kamonGeometry(shape: KamonShape): ReactNode {
  switch (shape) {
    case 'petal5':
    case 'petal6': {
      const count = shape === 'petal5' ? 5 : 6;
      return Array.from({ length: count }, (_, index) => (
        <ellipse
          key={index}
          cx={32}
          cy={14}
          rx={5}
          ry={10}
          transform={`rotate(${(index * 360) / count} 32 32)`}
        />
      ));
    }
    case 'bars2':
    case 'bars3': {
      const count = shape === 'bars2' ? 2 : 3;
      return Array.from({ length: count }, (_, index) => (
        <rect
          key={index}
          x={14}
          y={28 + (index - (count - 1) / 2) * 12}
          width={36}
          height={8}
          rx={2}
        />
      ));
    }
    case 'nestedDiamond':
      return (
        <g transform="rotate(45 32 32)">
          {[
            [19, 19],
            [33, 19],
            [19, 33],
            [33, 33],
          ].map(([x, y], index) => (
            <rect key={index} x={x} y={y} width={12} height={12} />
          ))}
        </g>
      );
    case 'tripleTriangle':
      return <path d={[triangle(32, 14), triangle(22, 32), triangle(42, 32)].join(' ')} />;
    case 'crossRing':
      return <path d={crossRingPath()} fillRule="evenodd" />;
    case 'star3Bar':
      return (
        <>
          <rect x={14} y={22} width={36} height={7} />
          {[20, 32, 44].map((x) => (
            <circle key={x} cx={x} cy={38} r={4} />
          ))}
        </>
      );
    case 'tomoe3':
      return [0, 120, 240].map((angle) => (
        <circle key={angle} cx={32} cy={22} r={9} transform={`rotate(${angle} 32 32)`} />
      ));
    case 'squareEyes4':
      return [0, 90, 180, 270].map((angle) => (
        <g key={angle} transform={`rotate(${angle} 32 32)`}>
          <rect x={27} y={16} width={10} height={10} transform="rotate(45 32 21)" />
        </g>
      ));
    case 'ring':
      return <path d={annulus(20, 13)} fillRule="evenodd" />;
    case 'doubleRing':
      return <path d={`${annulus(26, 23)} ${annulus(20, 13)}`} fillRule="evenodd" />;
    default: {
      const unsupported: never = shape;
      throw new Error(`Unsupported kamon shape: ${String(unsupported)}`);
    }
  }
}
