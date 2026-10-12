//! Numeric cache-miss scorer. JavaScript owns ordering, signatures and placement state.
//! Header: [version, x, y, width, height, baselinePrimary, roadLinePresent,
//! normalX, normalY, slack, capsuleMode, offsetCount, primaryCount, hardCount,
//! reservedCount, capsuleCount]. Subsequent row strides are 2, 4, 5, 4, 5;
//! hard rows append baseline overlap. Capsule modes: absent=0, null=1, array=2.

const HEADER: usize = 16;
const LIMIT_SQUARED: f64 = 48.0 * 48.0;
const EPSILON: f64 = 1e-8;

// Unlike Rust's floating min/max, JavaScript propagates NaN and specifies zero signs.
pub(crate) fn js_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a == 0.0 && b == 0.0 {
        if a.is_sign_negative() || b.is_sign_negative() {
            -0.0
        } else {
            0.0
        }
    } else if a < b {
        a
    } else {
        b
    }
}

pub(crate) fn js_max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a == 0.0 && b == 0.0 {
        if a.is_sign_negative() && b.is_sign_negative() {
            -0.0
        } else {
            0.0
        }
    } else if a > b {
        a
    } else {
        b
    }
}

#[derive(Clone, Copy)]
pub(crate) struct Rect {
    pub(crate) x: f64,
    pub(crate) y: f64,
    pub(crate) width: f64,
    pub(crate) height: f64,
}
impl Rect {
    pub(crate) fn read(row: &[f64]) -> Self {
        Self {
            x: row[0],
            y: row[1],
            width: row[2],
            height: row[3],
        }
    }
    pub(crate) fn finite(self) -> bool {
        [self.x, self.y, self.width, self.height]
            .iter()
            .all(|v| v.is_finite())
    }
}

pub(crate) fn overlap(a: Rect, b: Rect, padding: f64) -> f64 {
    js_max(
        0.0,
        js_min(a.x + a.width + padding, b.x + b.width + padding)
            - js_max(a.x - padding, b.x - padding),
    ) * js_max(
        0.0,
        js_min(a.y + a.height + padding, b.y + b.height + padding)
            - js_max(a.y - padding, b.y - padding),
    )
}

fn point_rect_distance(x: f64, y: f64, r: Rect) -> f64 {
    let dx = js_max(js_max(r.x - x, x - r.x - r.width), 0.0);
    let dy = js_max(js_max(r.y - y, y - r.y - r.height), 0.0);
    dx * dx + dy * dy
}

fn point_segment_distance(x: f64, y: f64, a: [f64; 2], b: [f64; 2]) -> f64 {
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    let length = dx * dx + dy * dy;
    let t = if length == 0.0 {
        0.0
    } else {
        js_max(
            0.0,
            js_min(1.0, ((x - a[0]) * dx + (y - a[1]) * dy) / length),
        )
    };
    let x_distance = x - a[0] - t * dx;
    let y_distance = y - a[1] - t * dy;
    x_distance * x_distance + y_distance * y_distance
}

fn segment_rect_distance(a: [f64; 2], b: [f64; 2], r: Rect) -> f64 {
    let mut lo = 0.0;
    let mut hi = 1.0;
    // Preserve x-then-y clipping and every subtraction/division in the JS oracle.
    for axis in 0..2 {
        let start = a[axis];
        let delta = b[axis] - a[axis];
        let min = if axis == 0 { r.x } else { r.y };
        let max = if axis == 0 {
            r.x + r.width
        } else {
            r.y + r.height
        };
        if delta == 0.0 {
            if start < min || start > max {
                lo = 1.0;
                hi = 0.0;
                break;
            }
        } else {
            let t1 = (min - start) / delta;
            let t2 = (max - start) / delta;
            lo = js_max(lo, js_min(t1, t2));
            hi = js_min(hi, js_max(t1, t2));
        }
    }
    if lo <= hi {
        return 0.0;
    }
    let distances = [
        point_rect_distance(a[0], a[1], r),
        point_rect_distance(b[0], b[1], r),
        point_segment_distance(r.x, r.y, a, b),
        point_segment_distance(r.x, r.y + r.height, a, b),
        point_segment_distance(r.x + r.width, r.y, a, b),
        point_segment_distance(r.x + r.width, r.y + r.height, a, b),
    ];
    distances[1..]
        .iter()
        .fold(distances[0], |min, value| js_min(min, *value))
}

pub(crate) fn clears_capsules(rect: Rect, capsules: &[f64]) -> bool {
    if capsules.len() / 5 > 255 || !rect.finite() {
        return false;
    }
    capsules.chunks_exact(5).all(|c| {
        c.iter().all(|v| v.is_finite())
            && c[4] >= 0.0
            && segment_rect_distance([c[0], c[1]], [c[2], c[3]], rect) >= c[4] * c[4] - EPSILON
    })
}

fn count(value: f64, word_count: usize) -> Option<usize> {
    if !value.is_finite() || value < 0.0 || value.fract() != 0.0 || value > word_count as f64 {
        return None;
    }
    Some(value as usize)
}

fn score(input: &[f64]) -> i32 {
    if input.len() < HEADER
        || input[0] != 1.0
        || !(input[6] == 0.0 || input[6] == 1.0)
        || !(input[10] == 0.0 || input[10] == 1.0 || input[10] == 2.0)
    {
        return -2;
    }
    let mut lengths = [0; 5];
    let mut end = HEADER;
    for (index, stride) in [2, 4, 5, 4, 5].iter().enumerate() {
        let Some(n) = count(input[11 + index], input.len()) else {
            return -2;
        };
        let Some(words) = n.checked_mul(*stride) else {
            return -2;
        };
        let Some(next) = end.checked_add(words) else {
            return -2;
        };
        lengths[index] = words;
        end = next;
    }
    if end != input.len() || input[11] > i32::MAX as f64 {
        return -2;
    }
    let mut cursor = HEADER;
    let mut sections: [&[f64]; 5] = [&[]; 5];
    for (index, words) in lengths.iter().enumerate() {
        sections[index] = &input[cursor..cursor + words];
        cursor += words;
    }
    let [offsets, primary, hard, reserved, capsules] = sections;
    let rect = Rect::read(&input[1..5]);
    let baseline_primary = input[5];
    let line = input[6] == 1.0;
    if line && !input[7..10].iter().all(|v| v.is_finite()) {
        return -1;
    }
    if input[10] == 1.0 || (input[10] == 2.0 && capsules.len() / 5 > 255) {
        return -1;
    }
    let mut best = -1;
    let mut best_primary = f64::INFINITY;
    let mut best_secondary = f64::INFINITY;
    let mut best_distance = f64::INFINITY;
    for (index, offset) in offsets.chunks_exact(2).enumerate() {
        let distance = offset[0] * offset[0] + offset[1] * offset[1];
        if distance > LIMIT_SQUARED {
            continue;
        }
        if line && offset[0] * input[7] + offset[1] * input[8] < -input[9] - EPSILON {
            continue;
        }
        let moved = Rect {
            x: rect.x + offset[0],
            y: rect.y + offset[1],
            ..rect
        };
        if input[10] == 2.0 && !clears_capsules(moved, capsules) {
            continue;
        }
        if hard
            .chunks_exact(5)
            .any(|r| overlap(moved, Rect::read(r), 0.0) > r[4])
        {
            continue;
        }
        let primary_area = primary
            .chunks_exact(4)
            .fold(0.0, |sum, r| sum + overlap(moved, Rect::read(r), 0.0));
        if primary_area > baseline_primary {
            continue;
        }
        let secondary_area = reserved
            .chunks_exact(4)
            .fold(0.0, |sum, r| sum + overlap(moved, Rect::read(r), 2.0));
        if primary_area < best_primary
            || (primary_area == best_primary
                && (secondary_area < best_secondary
                    || (secondary_area == best_secondary && distance < best_distance)))
        {
            best = index as i32;
            best_primary = primary_area;
            best_secondary = secondary_area;
            best_distance = distance;
        }
        if primary_area == 0.0 && secondary_area == 0.0 && distance == 0.0 {
            break;
        }
    }
    best
}

#[no_mangle]
pub extern "C" fn geographic_abi_version() -> u32 {
    1
}

/// Return the original offset index, -1 for ordinary no-selection, or -2 for malformed data.
/// JavaScript retains rectangle validation, candidate order, cache signatures and zero fallback.
/// # Safety
/// Non-null aligned pointer must refer to a live allocation containing word_count f64 values.
/// Malformed headers are checked; arbitrary forged/dangling allocation pointers are not valid ABI calls.
#[no_mangle]
pub unsafe extern "C" fn geo_score(pointer: *const f64, word_count: usize) -> i32 {
    if pointer.is_null()
        || !(pointer as usize).is_multiple_of(std::mem::align_of::<f64>())
        || word_count < HEADER
        || word_count > isize::MAX as usize / std::mem::size_of::<f64>()
    {
        return -2;
    }
    score(std::slice::from_raw_parts(pointer, word_count))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn job(
        offsets: &[f64],
        primary: &[f64],
        hard: &[f64],
        reserved: &[f64],
        mode: f64,
        capsules: &[f64],
    ) -> Vec<f64> {
        let mut input = vec![
            1.0,
            0.0,
            0.0,
            8.0,
            8.0,
            64.0,
            0.0,
            0.0,
            0.0,
            0.0,
            mode,
            (offsets.len() / 2) as f64,
            (primary.len() / 4) as f64,
            (hard.len() / 5) as f64,
            (reserved.len() / 4) as f64,
            (capsules.len() / 5) as f64,
        ];
        for section in [offsets, primary, hard, reserved, capsules] {
            input.extend_from_slice(section);
        }
        input
    }

    #[test]
    fn min_max_propagate_nan_and_match_signed_zero() {
        for (a, b) in [(0.0, -0.0), (-0.0, 0.0), (-0.0, -0.0), (0.0, 0.0)] {
            assert_eq!(
                js_min(a, b).to_bits(),
                if a.is_sign_negative() || b.is_sign_negative() {
                    (-0.0f64).to_bits()
                } else {
                    0.0f64.to_bits()
                }
            );
            assert_eq!(
                js_max(a, b).to_bits(),
                if a.is_sign_negative() && b.is_sign_negative() {
                    (-0.0f64).to_bits()
                } else {
                    0.0f64.to_bits()
                }
            );
        }
        for value in [f64::NEG_INFINITY, -1.0, 0.0, f64::INFINITY] {
            assert!(js_min(value, f64::NAN).is_nan());
            assert!(js_min(f64::NAN, value).is_nan());
            assert!(js_max(value, f64::NAN).is_nan());
            assert!(js_max(f64::NAN, value).is_nan());
        }
        assert_eq!(js_min(2.0, 3.0), 2.0);
        assert_eq!(js_max(2.0, 3.0), 3.0);
    }

    #[test]
    fn malformed_headers_counts_flags_and_lengths_return_error() {
        assert_eq!(score(&[]), -2);
        let valid = job(&[0.0, 0.0], &[], &[], &[], 0.0, &[]);
        for (index, value) in [
            (0, 2.0),
            (6, 2.0),
            (10, 3.0),
            (11, -1.0),
            (11, 0.5),
            (12, f64::NAN),
            (13, f64::INFINITY),
            (14, f64::MAX),
            (15, 1.0),
        ] {
            let mut data = valid.clone();
            data[index] = value;
            assert_eq!(score(&data), -2);
        }
        let mut extra = valid.clone();
        extra.push(0.0);
        assert_eq!(score(&extra), -2);
        unsafe {
            assert_eq!(geo_score(std::ptr::null(), 16), -2);
            assert_eq!(geo_score(valid.as_ptr(), 15), -2);
        }
        assert_eq!(geographic_abi_version(), 1);
    }

    #[test]
    fn original_candidate_order_breaks_exact_ties_and_zero_exits() {
        let r = [0.0, 0.0, 8.0, 8.0];
        assert_eq!(
            score(&job(&[8.0, 0.0, -8.0, 0.0], &r, &[], &r, 0.0, &[])),
            0
        );
        assert_eq!(score(&job(&[0.0, 0.0, 8.0, 0.0], &r, &[], &r, 0.0, &[])), 1);
        assert_eq!(
            score(&job(&[-0.0, 0.0, 0.0, -0.0], &[], &[], &[], 0.0, &[])),
            0
        );
        assert_eq!(score(&job(&[49.0, 0.0], &[], &[], &[], 0.0, &[])), -1);
    }

    #[test]
    fn hard_channels_and_baseline_primary_cannot_be_traded_for_clearance() {
        let r = [0.0, 0.0, 8.0, 8.0];
        let hard = [8.0, 0.0, 8.0, 8.0, 0.0];
        assert_eq!(
            score(&job(&[0.0, 0.0, 8.0, 0.0], &r, &hard, &r, 0.0, &[])),
            0
        );
        let mut input = job(&[0.0, 0.0], &r, &[], &r, 0.0, &[]);
        input[5] = 0.0;
        assert_eq!(score(&input), -1);
        input[5] = f64::INFINITY;
        assert_eq!(score(&input), 0);
    }

    #[test]
    fn capsule_absent_null_empty_invalid_and_count_guards_are_distinct() {
        assert_eq!(score(&job(&[0.0, 0.0], &[], &[], &[], 0.0, &[])), 0);
        assert_eq!(score(&job(&[0.0, 0.0], &[], &[], &[], 1.0, &[])), -1);
        assert_eq!(score(&job(&[0.0, 0.0], &[], &[], &[], 2.0, &[])), 0);
        for c in [[0.0, 0.0, 0.0, 0.0, -1.0], [f64::NAN, 0.0, 0.0, 0.0, 1.0]] {
            assert_eq!(score(&job(&[0.0, 0.0], &[], &[], &[], 2.0, &c)), -1);
        }
        let capsules = vec![0.0; 255 * 5];
        assert_eq!(score(&job(&[0.0, 0.0], &[], &[], &[], 2.0, &capsules)), 0);
        let capsules = vec![0.0; 256 * 5];
        assert_eq!(score(&job(&[0.0, 0.0], &[], &[], &[], 2.0, &capsules)), -1);
    }

    #[test]
    fn tangent_epsilon_and_degenerate_capsule_match_original_arithmetic() {
        let mut input = job(&[0.0, 0.0, 0.0, -8.0], &[], &[], &[], 0.0, &[]);
        input[6] = 1.0;
        input[8] = 1.0;
        assert_eq!(score(&input), 0);
        input[7] = f64::NAN;
        assert_eq!(score(&input), -1);
        for (dy, expected) in [(-EPSILON, 0), (-EPSILON + 1e-10, 0), (-EPSILON - 1e-10, -1)] {
            let mut input = job(&[0.0, dy], &[], &[], &[], 0.0, &[]);
            input[6] = 1.0;
            input[8] = 1.0;
            assert_eq!(score(&input), expected);
        }
        let r = Rect {
            x: 2.0,
            y: 2.0,
            width: 0.0,
            height: 0.0,
        };
        assert_eq!(segment_rect_distance([0.0, 0.0], [0.0, 0.0], r), 8.0);
        assert!(point_segment_distance(0.0, 0.0, [-1e308, 0.0], [1e308, 0.0]).is_nan());
        assert!(clears_capsules(r, &[0.0, 0.0, 0.0, 0.0, 8.0f64.sqrt()]));
        assert!(!clears_capsules(r, &[0.0, 0.0, 0.0, 0.0, 3.0]));
        let boundary = Rect {
            x: 1.0,
            y: 0.0,
            width: 0.0,
            height: 0.0,
        };
        assert!(clears_capsules(
            boundary,
            &[0.0, 0.0, 0.0, 0.0, (1.0 + EPSILON * 0.5).sqrt()]
        ));
        assert!(!clears_capsules(
            boundary,
            &[0.0, 0.0, 0.0, 0.0, (1.0 + EPSILON * 2.0).sqrt()]
        ));
    }

    #[test]
    fn ordinary_hard_and_reserved_counts_are_not_subject_to_capsule_limit() {
        let rects = [1000.0, 1000.0, 1.0, 1.0].repeat(256);
        let hard = [1000.0, 1000.0, 1.0, 1.0, 0.0].repeat(256);
        assert_eq!(score(&job(&[0.0, 0.0], &rects, &hard, &rects, 0.0, &[])), 0);
    }

    #[test]
    fn returning_road_leg_protects_more_than_midpoint_tangent() {
        let capsules = [
            -100.0, 0.0, 100.0, 0.0, 6.0, 100.0, 0.0, 100.0, -24.0, 6.0, 100.0, -24.0, -100.0,
            -24.0, 6.0,
        ];
        let mut input = job(&[0.0, 0.0, 0.0, -16.0], &[], &[], &[], 2.0, &capsules);
        input[1] = -37.0;
        input[2] = -32.0;
        input[3] = 74.0;
        input[4] = 16.0;
        input[6] = 1.0;
        input[8] = -1.0;
        input[9] = 10.0;
        assert_eq!(score(&input), 1);
    }
}
