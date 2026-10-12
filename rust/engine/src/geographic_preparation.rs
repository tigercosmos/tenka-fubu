//! Numeric preparation; JavaScript retains object ordering and cache signatures.
use crate::geographic::{clears_capsules, js_max, js_min, overlap, Rect};
use std::cmp::Ordering;
use std::collections::BTreeSet;

const HEADER: usize = 16;
const SAFE: f64 = 9_007_199_254_740_991.0;

fn integer(v: f64) -> Option<usize> {
    if !v.is_finite() || v < 0.0 || v.fract() != 0.0 || v > SAFE || v >= usize::MAX as f64 {
        None
    } else {
        Some(v as usize)
    }
}
fn positive_safe(v: f64) -> bool {
    v.is_finite() && (1.0..=SAFE).contains(&v) && v.fract() == 0.0
}
fn valid_rect(r: &[f64]) -> bool {
    r.iter().all(|v| v.is_finite())
        && r[2] >= 0.0
        && r[3] >= 0.0
        && (r[0] + r[2] + 4.0).is_finite()
        && (r[1] + r[3] + 4.0).is_finite()
}
fn bounded_component(v: f64) -> bool {
    v.is_finite() && v.abs() <= f64::MAX / 16.0
}
struct Frame<'a> {
    data: &'a [f64],
    p: usize,
    h: usize,
    k: usize,
    rect: Rect,
    bounded_overlap: bool,
}
impl<'a> Frame<'a> {
    fn parse(data: &'a [f64]) -> Option<Self> {
        if data.len() < HEADER
            || data[0] != 1.0
            || !positive_safe(data[1])
            || !positive_safe(data[10])
            || data[11..16].iter().any(|v| *v != 0.0)
            || !valid_rect(&data[6..10])
        {
            return None;
        }
        let p = integer(data[2])?;
        let h = integer(data[3])?;
        let capacity = integer(data[4])?;
        let k = integer(data[5])?;
        if k > capacity
            || HEADER.checked_add(p.checked_add(h)?.checked_add(capacity)?.checked_mul(4)?)?
                != data.len()
        {
            return None;
        }
        let active = p.checked_add(h)?.checked_add(k)?;
        let mut bounded_overlap = data[6..10].iter().copied().all(bounded_component);
        for row in data[HEADER..HEADER + active * 4].chunks_exact(4) {
            if !valid_rect(row) {
                return None;
            }
            bounded_overlap &= row.iter().copied().all(bounded_component);
        }
        Some(Self {
            data,
            p,
            h,
            k,
            rect: Rect::read(&data[6..10]),
            bounded_overlap,
        })
    }
    fn count(&self) -> usize {
        self.p + self.h + self.k
    }
    fn row(&self, index: usize) -> Rect {
        Rect::read(&self.data[HEADER + index * 4..HEADER + index * 4 + 4])
    }
}
fn near(a: Rect, r: Rect) -> bool {
    r.x < a.x + a.width + 48.0 + 4.0
        && r.x + r.width > a.x - 48.0 - 4.0
        && r.y < a.y + a.height + 48.0 + 4.0
        && r.y + r.height > a.y - 48.0 - 4.0
}
#[derive(Clone, Copy)]
struct AxisValue(f64);
impl PartialEq for AxisValue {
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0
    }
}
impl Eq for AxisValue {}
impl PartialOrd for AxisValue {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}
impl Ord for AxisValue {
    fn cmp(&self, other: &Self) -> Ordering {
        self.0
            .abs()
            .partial_cmp(&other.0.abs())
            .unwrap()
            .then_with(|| self.0.partial_cmp(&other.0).unwrap())
    }
}
fn axis(frame: &Frame<'_>, vertical: bool) -> Vec<f64> {
    let mut values = BTreeSet::from([AxisValue(0.0)]);
    let origin = if vertical { frame.rect.y } else { frame.rect.x };
    let size = if vertical {
        frame.rect.height
    } else {
        frame.rect.width
    };
    for i in 0..frame.count() {
        let r = frame.row(i);
        let start = if vertical { r.y } else { r.x };
        let extent = if vertical { r.height } else { r.width };
        for value in [
            start - origin - size,
            start - origin - size - 4.0,
            start + extent - origin,
            start + extent - origin + 4.0,
        ] {
            if value.is_finite() && value.abs() <= 48.0 {
                values.insert(AxisValue(if value == 0.0 { 0.0 } else { value }));
                if values.len() > 16 {
                    values.pop_last();
                }
            }
        }
    }
    values.into_iter().map(|value| value.0).collect()
}

/// Validate the whole input and capacity before changing any output word.
pub(crate) fn prepare(frame: &[f64], output: &mut [f64]) -> i32 {
    let Some(f) = Frame::parse(frame) else {
        return -2;
    };
    let mut primary = Vec::new();
    let mut hard = Vec::new();
    let mut reserved = Vec::new();
    let mut down = 0.0;
    let mut right = 0.0;
    let mut left = 0.0;
    let mut up = 0.0;
    for i in 0..f.count() {
        let r = f.row(i);
        if near(f.rect, r) {
            reserved.push(i as f64);
            if i < f.p {
                primary.push(i as f64);
            } else if i < f.p + f.h {
                hard.push((i - f.p) as f64);
            }
        }
        if overlap(f.rect, r, 2.0) > 0.0 {
            down = js_max(down, r.y + r.height + 4.0 - f.rect.y);
            right = js_max(right, r.x + r.width + 4.0 - f.rect.x);
            left = js_min(left, r.x - 4.0 - f.rect.width - f.rect.x);
            up = js_min(up, r.y - 4.0 - f.rect.height - f.rect.y);
        }
    }
    let mut offsets = vec![0.0, 0.0, 0.0, down, right, 0.0, left, 0.0, 0.0, up];
    for sign in [1.0, -1.0] {
        let first = if sign > 0.0 { down } else { up };
        let mut edge: Option<f64> = None;
        for i in 0..f.count() {
            let r = f.row(i);
            let y = if sign > 0.0 {
                r.y + r.height + 4.0 - f.rect.y
            } else {
                r.y - 4.0 - f.rect.height - f.rect.y
            };
            if sign * y > sign * first
                && y.abs() <= 48.0
                && edge.is_none_or(|old| sign * (y - old) < 0.0)
            {
                edge = Some(y);
            }
        }
        offsets.extend([0.0, edge.unwrap_or(sign * 48.0)]);
    }
    let xs = axis(&f, false);
    let ys = axis(&f, true);
    let Some(words) = HEADER
        .checked_add(primary.len())
        .and_then(|n| n.checked_add(hard.len()))
        .and_then(|n| n.checked_add(reserved.len()))
        .and_then(|n| n.checked_add(14))
        .and_then(|n| n.checked_add(xs.len()))
        .and_then(|n| n.checked_add(ys.len()))
    else {
        return -2;
    };
    if words > output.len() || words > i32::MAX as usize {
        return -2;
    }
    let mut result = vec![
        1.0,
        frame[1],
        frame[5],
        primary.len() as f64,
        hard.len() as f64,
        reserved.len() as f64,
        xs.len() as f64,
        ys.len() as f64,
        -1.0,
        0.0,
        0.0,
        frame[10],
    ];
    result.extend_from_slice(&frame[6..10]);
    for values in [&primary, &hard, &reserved, &offsets, &xs, &ys] {
        result.extend_from_slice(values);
    }
    output[..words].copy_from_slice(&result);
    words as i32
}

fn indices(values: &[f64], limit: usize) -> bool {
    let mut previous = None;
    values.iter().all(|value| {
        let Some(index) = integer(*value) else {
            return false;
        };
        if index >= limit || previous.is_some_and(|old| old >= index) {
            return false;
        }
        previous = Some(index);
        true
    })
}
fn valid_axis(values: &[f64]) -> bool {
    !values.is_empty()
        && values.len() <= 16
        && values[0].to_bits() == 0.0f64.to_bits()
        && values.iter().all(|v| v.is_finite() && v.abs() <= 48.0)
        && values.windows(2).all(|pair| {
            let diff = pair[0].abs() - pair[1].abs();
            if diff == 0.0 {
                pair[0] < pair[1]
            } else {
                diff < 0.0
            }
        })
}

/// Prepared-only strict SIMD overlap; scalar native builds are reference-only.
#[cfg(all(target_arch = "wasm32", feature = "render-simd"))]
#[target_feature(enable = "simd128")]
// Scalar ABI arguments reduce cross-feature Rect argument copies.
#[allow(clippy::too_many_arguments)]
unsafe fn overlap_prepared(
    ax: f64,
    ay: f64,
    aw: f64,
    ah: f64,
    bx: f64,
    by: f64,
    bw: f64,
    bh: f64,
    padding: f64,
) -> f64 {
    use core::arch::wasm32::*;
    let apos = f64x2(ax, ay);
    let bpos = f64x2(bx, by);
    let pad = f64x2_splat(padding);
    let ar = f64x2_add(f64x2_add(apos, f64x2(aw, ah)), pad);
    let br = f64x2_add(f64x2_add(bpos, f64x2(bw, bh)), pad);
    let left = f64x2_max(f64x2_sub(apos, pad), f64x2_sub(bpos, pad));
    let size = f64x2_max(f64x2_splat(0.0), f64x2_sub(f64x2_min(ar, br), left));
    f64x2_extract_lane::<0>(size) * f64x2_extract_lane::<1>(size)
}

fn prepared_overlap(a: Rect, b: Rect, padding: f64) -> f64 {
    #[cfg(all(target_arch = "wasm32", feature = "render-simd"))]
    {
        unsafe {
            overlap_prepared(
                a.x, a.y, a.width, a.height, b.x, b.y, b.width, b.height, padding,
            )
        }
    }
    #[cfg(not(all(target_arch = "wasm32", feature = "render-simd")))]
    {
        overlap(a, b, padding)
    }
}

// With components <= MAX/16, moved coordinates, padded ends and clipped
// differences are finite. Thus a zero X clip times finite nonnegative Y is +0.
// Outside that conservative domain retain the original scalar/SIMD arithmetic.
fn guarded_overlap(a: Rect, b: Rect, padding: f64, bounded: bool) -> f64 {
    if !bounded {
        return prepared_overlap(a, b, padding);
    }
    let x = js_max(
        0.0,
        js_min(a.x + a.width + padding, b.x + b.width + padding)
            - js_max(a.x - padding, b.x - padding),
    );
    if x == 0.0 {
        return 0.0;
    }
    let y = js_max(
        0.0,
        js_min(a.y + a.height + padding, b.y + b.height + padding)
            - js_max(a.y - padding, b.y - padding),
    );
    x * y
}

/// Reuse prepared near indices and axes without repacking the full scorer packet.
/// Output winner fields are never inputs. Malformed input leaves output unchanged.
pub(crate) fn score_prepared(frame: &[f64], prep: &mut [f64], road: &[f64]) -> i32 {
    let Some(f) = Frame::parse(frame) else {
        return -2;
    };
    if prep.len() < HEADER
        || prep[0] != 1.0
        || prep[1] != frame[1]
        || prep[2] != frame[5]
        || prep[11] != frame[10]
        || !(0..4).all(|i| prep[12 + i].to_bits() == frame[6 + i].to_bits())
        || road.len() < 8
        || road[0] != 1.0
        || !(road[1] == 0.0 || road[1] == 1.0)
        || !(road[5] == 0.0 || road[5] == 1.0 || road[5] == 2.0)
        || road[7] != 0.0
    {
        return -2;
    }
    let Some(caps) = integer(road[6]) else {
        return -2;
    };
    if caps.checked_mul(5).and_then(|n| n.checked_add(8)) != Some(road.len()) {
        return -2;
    }
    let mut counts = [0usize; 5];
    let mut end = HEADER;
    for (i, value) in prep[3..8].iter().enumerate() {
        let Some(n) = integer(*value) else {
            return -2;
        };
        counts[i] = n;
        let Some(next) = end.checked_add(n) else {
            return -2;
        };
        end = next;
    }
    if end.checked_add(14) != Some(prep.len()) {
        return -2;
    }
    let [np, nh, nr, nx, _ny] = counts;
    let primary = &prep[HEADER..HEADER + np];
    let hard = &prep[HEADER + np..HEADER + np + nh];
    let reserved = &prep[HEADER + np + nh..HEADER + np + nh + nr];
    let offset_start = HEADER + np + nh + nr;
    let xs = &prep[offset_start + 14..offset_start + 14 + nx];
    let ys = &prep[offset_start + 14 + nx..];
    if !indices(primary, f.p)
        || !indices(hard, f.h)
        || !indices(reserved, f.count())
        || !valid_axis(xs)
        || !valid_axis(ys)
    {
        return -2;
    }
    let bounded = f.bounded_overlap
        && prep[offset_start..offset_start + 14]
            .iter()
            .copied()
            .all(bounded_component);
    // Derived offset values can legitimately be nonfinite; preserve scorer semantics.
    let mut offsets: Vec<[f64; 2]> = prep[offset_start..offset_start + 14]
        .chunks_exact(2)
        .map(|r| [r[0], r[1]])
        .collect();
    for y in (-48..=48).step_by(8) {
        for x in (-48..=48).step_by(8) {
            if x * x + y * y <= 48 * 48 {
                offsets.push([x as f64, y as f64]);
            }
        }
    }
    for y in ys {
        for x in xs {
            if x * x + y * y <= 48.0 * 48.0 {
                offsets.push([*x, *y]);
            }
        }
    }
    let baseline = primary.iter().fold(0.0, |sum, i| {
        sum + guarded_overlap(f.rect, f.row(*i as usize), 0.0, bounded)
    });
    let hard_baseline: Vec<f64> = hard
        .iter()
        .map(|i| guarded_overlap(f.rect, f.row(f.p + *i as usize), 0.0, bounded))
        .collect();
    let mut winner = -1;
    let mut winner_offset = [0.0, 0.0];
    let mut best_primary = f64::INFINITY;
    let mut best_secondary = f64::INFINITY;
    let mut best_distance = f64::INFINITY;
    let line = road[1] == 1.0;
    let eligible_road = (!line || road[2..5].iter().all(|v| v.is_finite()))
        && road[5] != 1.0
        && !(road[5] == 2.0 && caps > 255);
    if eligible_road {
        for (index, offset) in offsets.iter().enumerate() {
            let distance = offset[0] * offset[0] + offset[1] * offset[1];
            if distance > 48.0 * 48.0
                || (line && offset[0] * road[2] + offset[1] * road[3] < -road[4] - 1e-8)
            {
                continue;
            }
            let moved = Rect {
                x: f.rect.x + offset[0],
                y: f.rect.y + offset[1],
                ..f.rect
            };
            if road[5] == 2.0 && !clears_capsules(moved, &road[8..]) {
                continue;
            }
            if hard
                .iter()
                .zip(&hard_baseline)
                .any(|(i, b)| guarded_overlap(moved, f.row(f.p + *i as usize), 0.0, bounded) > *b)
            {
                continue;
            }
            let area = primary.iter().fold(0.0, |sum, i| {
                sum + guarded_overlap(moved, f.row(*i as usize), 0.0, bounded)
            });
            if area > baseline {
                continue;
            }
            let secondary = reserved.iter().fold(0.0, |sum, i| {
                sum + guarded_overlap(moved, f.row(*i as usize), 2.0, bounded)
            });
            if area < best_primary
                || (area == best_primary
                    && (secondary < best_secondary
                        || (secondary == best_secondary && distance < best_distance)))
            {
                winner = index as i32;
                winner_offset = *offset;
                best_primary = area;
                best_secondary = secondary;
                best_distance = distance;
            }
            if area == 0.0 && secondary == 0.0 && distance == 0.0 {
                break;
            }
        }
    }
    prep[8] = winner as f64;
    prep[9] = winner_offset[0];
    prep[10] = winner_offset[1];
    winner
}

#[cfg(test)]
#[path = "geographic_preparation_tests.rs"]
mod tests;
