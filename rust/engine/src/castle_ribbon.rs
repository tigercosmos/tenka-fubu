//! Exact float64 castle ribbon planning. JS validates and stably sorts numeric inputs.
use std::collections::BTreeMap;

const HEADER: usize = 16;
const ROW: usize = 16;
const LIMIT: f64 = 48.0;
const GAP: f64 = 4.0;
const WORK_LIMIT: usize = 1_000_000;
const MAX_WORDS: usize = 30_736;

#[derive(Clone, Copy, Debug)]
struct Rect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}
#[derive(Clone, Copy, Debug)]
struct Point {
    x: f64,
    y: f64,
}
struct Candidate {
    baseline: Rect,
    anchor: Point,
    leaders: Vec<Rect>,
}
struct Placement {
    offset: Point,
    rect: Rect,
    area: f64,
    baseline_area: f64,
    tried: usize,
    limited: bool,
    start: Point,
    end: Point,
    visible: bool,
}
struct Input {
    candidates: Vec<Candidate>,
    fixed: Vec<Rect>,
    hard: Vec<Rect>,
    output: usize,
}

fn js_min(a: f64, b: f64) -> f64 {
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
fn js_max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a == 0.0 && b == 0.0 {
        if a.is_sign_positive() || b.is_sign_positive() {
            0.0
        } else {
            -0.0
        }
    } else if a > b {
        a
    } else {
        b
    }
}
fn integer(value: f64, maximum: usize) -> Result<usize, ()> {
    if !value.is_finite() || value < 0.0 || value.fract() != 0.0 || value > maximum as f64 {
        Err(())
    } else {
        Ok(value as usize)
    }
}
fn rect(values: &[f64]) -> Result<Rect, ()> {
    let r = Rect {
        x: values[0],
        y: values[1],
        width: values[2],
        height: values[3],
    };
    if [r.x, r.y, r.width, r.height, r.x + r.width, r.y + r.height]
        .iter()
        .any(|v| !v.is_finite())
        || r.x.abs() > 1e9
        || r.y.abs() > 1e9
        || r.width <= 0.0
        || r.height <= 0.0
        || r.width > 4096.0
        || r.height > 4096.0
    {
        return Err(());
    }
    Ok(r)
}
fn parse(values: &[f64]) -> Result<Input, ()> {
    if values.len() < HEADER
        || values[0] != 1.0
        || values[5] != ROW as f64
        || values[6..HEADER].iter().any(|&v| v != 0.0)
    {
        return Err(());
    }
    let c = integer(values[1], 256)?;
    let o = integer(values[2], 1024)?;
    let h = integer(values[3], 1024)?;
    let l = integer(values[4], 4096)?;
    let output = HEADER + c * 8 + (o + h + l) * 4;
    if values.len() != output + c * ROW {
        return Err(());
    }
    let ordinary_start = HEADER + c * 8;
    let hard_start = ordinary_start + o * 4;
    let leader_start = hard_start + h * 4;
    let rectangles = |start: usize, count: usize| -> Result<Vec<Rect>, ()> {
        (0..count)
            .map(|i| rect(&values[start + i * 4..start + i * 4 + 4]))
            .collect()
    };
    let fixed = rectangles(ordinary_start, o)?;
    let hard = rectangles(hard_start, h)?;
    let leaders = rectangles(leader_start, l)?;
    let mut candidates = Vec::with_capacity(c);
    let mut total_leaders = 0;
    for index in 0..c {
        let row = &values[HEADER + index * 8..HEADER + index * 8 + 8];
        let baseline = rect(row)?;
        let anchor = Point {
            x: row[4],
            y: row[5],
        };
        if !anchor.x.is_finite() || !anchor.y.is_finite() {
            return Err(());
        }
        let start = integer(row[6], l)?;
        let count = integer(row[7], 1024)?;
        total_leaders += count;
        if start + count > l || total_leaders > 4096 {
            return Err(());
        }
        candidates.push(Candidate {
            baseline,
            anchor,
            leaders: leaders[start..start + count].to_vec(),
        });
    }
    Ok(Input {
        candidates,
        fixed,
        hard,
        output,
    })
}
fn overlap(a: Rect, b: Rect, gap: f64) -> f64 {
    js_max(
        0.0,
        js_min(a.x + a.width + gap, b.x + b.width) - js_max(a.x - gap, b.x),
    ) * js_max(
        0.0,
        js_min(a.y + a.height + gap, b.y + b.height) - js_max(a.y - gap, b.y),
    )
}
fn leader_end(anchor: Point, r: Rect) -> Point {
    Point {
        x: js_max(r.x, js_min(anchor.x, r.x + r.width)),
        y: js_max(r.y, js_min(anchor.y, r.y + r.height)),
    }
}
fn crosses_interior(start: Point, end: Point, r: Rect) -> bool {
    let mut low = 0.0;
    let mut high = 1.0;
    for (a, b, min, max) in [
        (start.x, end.x, r.x, r.x + r.width),
        (start.y, end.y, r.y, r.y + r.height),
    ] {
        let delta = b - a;
        if delta == 0.0 {
            if a <= min || a >= max {
                return false;
            }
        } else {
            let t1 = (min - a) / delta;
            let t2 = (max - a) / delta;
            low = js_max(low, js_min(t1, t2));
            high = js_min(high, js_max(t1, t2));
        }
    }
    low < high
}
fn axis(reserved: &[Rect], baseline: Rect, vertical: bool) -> Vec<f64> {
    let mut values = vec![0.0];
    for r in reserved {
        let (start, extent, origin, size) = if vertical {
            (r.y, r.height, baseline.y, baseline.height)
        } else {
            (r.x, r.width, baseline.x, baseline.width)
        };
        for value in [start - origin - size - GAP, start + extent + GAP - origin] {
            if value.is_finite() && value.abs() <= LIMIT {
                let value = if value == 0.0 { 0.0 } else { value };
                if !values.contains(&value) {
                    values.push(value);
                }
            }
        }
    }
    values.sort_by(|a, b| {
        a.abs()
            .partial_cmp(&b.abs())
            .unwrap()
            .then(a.partial_cmp(b).unwrap())
    });
    values.truncate(12);
    values
}
fn offsets(reserved: &[Rect], baseline: Rect) -> Vec<Point> {
    let xs = axis(reserved, baseline, false);
    let ys = axis(reserved, baseline, true);
    let mut all = vec![Point { x: 0.0, y: 0.0 }];
    for x in xs {
        for &y in &ys {
            if x * x + y * y <= LIMIT * LIMIT {
                all.push(Point { x, y });
            }
        }
    }
    for y in (-48..=48).step_by(8) {
        for x in (-48..=48).step_by(8) {
            let x = x as f64;
            let y = y as f64;
            if x * x + y * y <= LIMIT * LIMIT {
                all.push(Point { x, y });
            }
        }
    }
    // JS Map preserves first key insertion but overwrites with the last pair.
    let key = |v: f64| if v == 0.0 { 0_u64 } else { v.to_bits() };
    let mut indexes = BTreeMap::new();
    let mut unique: Vec<Point> = Vec::new();
    for point in all {
        let pair = (key(point.x), key(point.y));
        if let Some(&index) = indexes.get(&pair) {
            unique[index] = point;
        } else {
            indexes.insert(pair, unique.len());
            unique.push(point);
        }
    }
    unique
}
fn in_sweep(r: Rect, baseline: Rect, gap: f64) -> bool {
    let left = baseline.x - LIMIT - gap;
    let top = baseline.y - LIMIT - gap;
    let right = baseline.x + LIMIT + baseline.width + gap;
    let bottom = baseline.y + LIMIT + baseline.height + gap;
    r.x <= right && r.x + r.width >= left && r.y <= bottom && r.y + r.height >= top
}
fn score(r: Rect, terms: &[Rect]) -> (f64, f64) {
    let mut raw = 0.0;
    let mut padded = 0.0;
    for &obstacle in terms {
        raw += overlap(r, obstacle, 0.0);
        padded += overlap(r, obstacle, GAP);
    }
    (raw, padded)
}
fn solve_input(input: &Input) -> (Vec<Placement>, usize) {
    let mut placed = Vec::with_capacity(input.candidates.len());
    let mut results = Vec::with_capacity(input.candidates.len());
    let mut work = 0;
    for (index, candidate) in input.candidates.iter().enumerate() {
        let baseline = candidate.baseline;
        let mut reserved = input.fixed.clone();
        reserved.extend_from_slice(&placed);
        reserved.extend(input.candidates[index + 1..].iter().map(|c| c.baseline));
        let unique = offsets(&reserved, baseline);
        let score_reserved: Vec<Rect> = reserved
            .iter()
            .copied()
            .filter(|&r| in_sweep(r, baseline, GAP))
            .collect();
        let local_hard: Vec<Rect> = input
            .hard
            .iter()
            .copied()
            .filter(|&r| in_sweep(r, baseline, 0.0))
            .collect();
        let mut best = Point { x: 0.0, y: 0.0 };
        let mut best_score = score(baseline, &reserved);
        let baseline_area = best_score.0;
        let hard_baseline: Vec<f64> = local_hard
            .iter()
            .map(|&r| overlap(baseline, r, 0.0))
            .collect();
        let mut best_hard = hard_baseline.iter().fold(0.0, |sum, area| sum + area);
        let mut tried = 1;
        let mut limited = false;
        for &offset in &unique[1..] {
            let proposal_work = if input.hard.is_empty() && candidate.leaders.is_empty() {
                score_reserved.len()
            } else {
                score_reserved.len() * 2 + local_hard.len() + candidate.leaders.len()
            };
            if work + proposal_work > WORK_LIMIT {
                limited = true;
                break;
            }
            work += proposal_work;
            tried += 1;
            let moved = Rect {
                x: baseline.x + offset.x,
                y: baseline.y + offset.y,
                ..baseline
            };
            let mut hard_area = 0.0;
            let mut hard_blocked = false;
            for (i, &r) in local_hard.iter().enumerate() {
                let area = overlap(moved, r, 0.0);
                hard_area += area;
                if area > hard_baseline[i] {
                    hard_blocked = true;
                    break;
                }
            }
            if hard_blocked {
                continue;
            }
            let end = leader_end(candidate.anchor, moved);
            if candidate
                .leaders
                .iter()
                .any(|&r| crosses_interior(candidate.anchor, end, r))
            {
                continue;
            }
            let next = score(moved, &score_reserved);
            let distance = offset.x * offset.x + offset.y * offset.y;
            let best_distance = best.x * best.x + best.y * best.y;
            if next.0 < best_score.0
                || (next.0 == best_score.0
                    && (next.1 < best_score.1
                        || (next.1 == best_score.1
                            && (hard_area < best_hard
                                || (hard_area == best_hard && distance < best_distance)))))
            {
                best = offset;
                best_score = next;
                best_hard = hard_area;
            }
        }
        let r = Rect {
            x: baseline.x + best.x,
            y: baseline.y + best.y,
            ..baseline
        };
        placed.push(r);
        let end = leader_end(candidate.anchor, r);
        results.push(Placement {
            offset: best,
            rect: r,
            area: best_score.0,
            baseline_area,
            tried,
            limited,
            start: candidate.anchor,
            end,
            visible: (best.x != 0.0 || best.y != 0.0)
                && (candidate.anchor.x != end.x || candidate.anchor.y != end.y),
        });
    }
    // Match final fixed-first, candidate-order diagnostics, excluding only the current ID/index.
    for (index, candidate) in input.candidates.iter().enumerate() {
        let mut terms = input.fixed.clone();
        terms.extend(
            results
                .iter()
                .enumerate()
                .filter(|(i, _)| *i != index)
                .map(|(_, p)| p.rect),
        );
        results[index].area = terms
            .iter()
            .fold(0.0, |sum, &r| sum + overlap(results[index].rect, r, 0.0));
        results[index].baseline_area = terms
            .iter()
            .fold(0.0, |sum, &r| sum + overlap(candidate.baseline, r, 0.0));
    }
    (results, work)
}
fn process(values: &mut [f64]) -> Result<usize, ()> {
    let input = parse(values)?;
    let (placements, work) = solve_input(&input);
    values[6] = work as f64;
    let flag = |v: bool| if v { 1.0 } else { 0.0 };
    for (index, p) in placements.iter().enumerate() {
        let row = [
            p.offset.x,
            p.offset.y,
            p.rect.x,
            p.rect.y,
            p.rect.width,
            p.rect.height,
            p.area,
            p.baseline_area,
            flag(p.area > 0.0),
            p.tried as f64,
            flag(p.limited),
            p.start.x,
            p.start.y,
            p.end.x,
            p.end.y,
            flag(p.visible),
        ];
        values[input.output + index * ROW..input.output + (index + 1) * ROW].copy_from_slice(&row);
    }
    Ok(placements.len())
}

/// Runs one complete solve over an owned float64 arena.
///
/// # Safety
/// The caller supplies an allocated, live arena of `words` float64 values.
/// On wasm32 the linear-memory range is also checked before creating the slice.
pub unsafe fn solve(pointer: usize, words: usize) -> i32 {
    if pointer == 0 || !pointer.is_multiple_of(8) || !(HEADER..=MAX_WORDS).contains(&words) {
        return -2;
    }
    #[cfg(target_arch = "wasm32")]
    {
        let Some(end) = words
            .checked_mul(8)
            .and_then(|bytes| pointer.checked_add(bytes))
        else {
            return -2;
        };
        if end as u64 > (core::arch::wasm32::memory_size(0) as u64) * 65536 {
            return -2;
        }
    }
    let values = unsafe { std::slice::from_raw_parts_mut(pointer as *mut f64, words) };
    match process(values) {
        Ok(count) => count as i32,
        Err(()) => -2,
    }
}

#[cfg(test)]
#[path = "castle_ribbon_tests.rs"]
mod tests;
