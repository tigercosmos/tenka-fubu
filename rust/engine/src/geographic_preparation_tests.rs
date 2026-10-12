use super::*;

fn frame(primary: &[[f64; 4]], hard: &[[f64; 4]], placed: &[[f64; 4]]) -> Vec<f64> {
    let mut f = vec![
        1.0,
        1.0,
        primary.len() as f64,
        hard.len() as f64,
        placed.len() as f64,
        placed.len() as f64,
        0.0,
        0.0,
        8.0,
        8.0,
        1.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
    ];
    for rows in [primary, hard, placed] {
        for row in rows {
            f.extend(row);
        }
    }
    f
}
fn prepared(f: &[f64]) -> Vec<f64> {
    let mut output = vec![99.0; 2048];
    let n = prepare(f, &mut output);
    assert!(n >= 0);
    output.truncate(n as usize);
    output
}
fn road(mode: f64, caps: &[[f64; 5]]) -> Vec<f64> {
    let mut r = vec![1.0, 0.0, 0.0, 0.0, 0.0, mode, caps.len() as f64, 0.0];
    for c in caps {
        r.extend(c);
    }
    r
}
fn bits(a: &[f64], b: &[f64]) {
    assert_eq!(
        a.iter().map(|x| x.to_bits()).collect::<Vec<_>>(),
        b.iter().map(|x| x.to_bits()).collect::<Vec<_>>()
    );
}

#[test]
fn empty_hand_derived_directions_and_axes() {
    let f = frame(&[], &[], &[]);
    let mut p = prepared(&f);
    bits(
        &p[16..],
        &[
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 48.0, 0.0, -48.0, 0.0, 0.0,
        ],
    );
    assert_eq!(score_prepared(&f, &mut p, &road(0.0, &[])), 0);
    bits(&p[8..11], &[0.0, 0.0, 0.0]);
}
#[test]
fn near_indices_preserve_category_and_concatenated_order() {
    let f = frame(
        &[[0.0, 0.0, 8.0, 8.0], [1000.0, 0.0, 8.0, 8.0]],
        &[[2.0, 2.0, 4.0, 4.0]],
        &[[3.0, 3.0, 1.0, 1.0]],
    );
    let p = prepared(&f);
    bits(&p[3..6], &[1.0, 1.0, 3.0]);
    bits(&p[16..21], &[0.0, 0.0, 0.0, 2.0, 3.0]);
    bits(
        &p[21..35],
        &[
            0.0, 0.0, 0.0, 12.0, 12.0, 0.0, -12.0, 0.0, 0.0, -12.0, 0.0, 48.0, 0.0, -48.0,
        ],
    );
}
#[test]
fn far_rows_still_contribute_axes_and_zero_uses_same_value_zero() {
    let f = frame(&[[20.0, 1000.0, 8.0, 8.0]], &[], &[]);
    let p = prepared(&f);
    assert_eq!(p[5], 0.0);
    bits(&p[30..35], &[0.0, 8.0, 12.0, 28.0, 32.0]);
    bits(&p[35..], &[0.0]);
    let mut f = frame(&[[-0.0, 1000.0, 0.0, 0.0]], &[], &[]);
    f[6] = -0.0;
    let p = prepared(&f);
    assert_eq!(p[30].to_bits(), 0.0f64.to_bits());
}
#[test]
fn safe_tokens_above_wasm32_and_max_safe_are_valid() {
    for token in [4_294_967_296.0, SAFE] {
        let mut f = frame(&[], &[], &[]);
        f[1] = token;
        f[10] = token;
        let mut p = prepared(&f);
        assert_eq!(p[1], token);
        assert_eq!(p[11], token);
        assert_eq!(score_prepared(&f, &mut p, &road(0.0, &[])), 0);
    }
}
#[test]
fn malformed_frame_or_insufficient_output_is_atomic() {
    let valid = frame(&[], &[], &[]);
    for (index, value) in [
        (0, 2.0),
        (1, 0.0),
        (1, SAFE + 1.0),
        (2, 0.5),
        (3, f64::NAN),
        (4, f64::MAX),
        (5, 1.0),
        (6, f64::INFINITY),
        (8, -1.0),
        (10, 0.0),
        (11, 1.0),
    ] {
        let mut f = valid.clone();
        f[index] = value;
        let mut output = vec![123.0; 64];
        let before = output.clone();
        assert_eq!(prepare(&f, &mut output), -2);
        bits(&output, &before);
    }
    let mut output = vec![123.0; 31];
    let before = output.clone();
    assert_eq!(prepare(&valid, &mut output), -2);
    bits(&output, &before);
}
#[test]
fn malformed_or_stale_score_never_writes_winner() {
    let f = frame(&[[0.0, 0.0, 8.0, 8.0]], &[], &[]);
    let p = prepared(&f);
    let r = road(0.0, &[]);
    for (index, value) in [
        (0, 2.0),
        (1, 2.0),
        (2, 1.0),
        (3, 0.5),
        (6, 17.0),
        (11, 2.0),
        (12, -0.0),
        (16, 99.0),
    ] {
        let mut output = p.clone();
        output[index] = value;
        let before = output.clone();
        assert_eq!(score_prepared(&f, &mut output, &r), -2);
        bits(&output, &before);
    }
    for (index, value) in [(0, 2.0), (1, 3.0), (5, 3.0), (6, 1.0), (7, 1.0)] {
        let mut r = r.clone();
        r[index] = value;
        let mut output = p.clone();
        let before = output.clone();
        assert_eq!(score_prepared(&f, &mut output, &r), -2);
        bits(&output, &before);
    }
}
#[test]
fn ordinary_capsule_failure_is_not_malformed_and_winner_is_output_only() {
    let f = frame(&[], &[], &[]);
    let mut p = prepared(&f);
    p[8] = f64::NAN;
    p[9] = f64::INFINITY;
    p[10] = -99.0;
    assert_eq!(score_prepared(&f, &mut p, &road(0.0, &[])), 0);
    for r in [
        road(1.0, &[]),
        road(2.0, &vec![[0.0; 5]; 256]),
        road(2.0, &[[f64::NAN, 0.0, 0.0, 0.0, 0.0]]),
    ] {
        assert_eq!(score_prepared(&f, &mut p, &r), -1);
        bits(&p[8..11], &[-1.0, 0.0, 0.0]);
    }
}
#[test]
fn derived_overflow_is_preserved_without_rejection() {
    let mut f = frame(&[[0.0, 0.0, 1e200, 1e200]], &[], &[]);
    f[8] = 1e200;
    f[9] = 1e200;
    let mut p = prepared(&f);
    assert_eq!(score_prepared(&f, &mut p, &road(0.0, &[])), 0);
}

fn legacy_job(f: &[f64], p: &[f64], r: &[f64]) -> Vec<f64> {
    let f = Frame::parse(f).unwrap();
    let np = p[3] as usize;
    let nh = p[4] as usize;
    let nr = p[5] as usize;
    let nx = p[6] as usize;
    let start = 16 + np + nh + nr;
    let mut offsets = p[start..start + 14].to_vec();
    for y in (-48..=48).step_by(8) {
        for x in (-48..=48).step_by(8) {
            if x * x + y * y <= 48 * 48 {
                offsets.extend([x as f64, y as f64]);
            }
        }
    }
    for y in &p[start + 14 + nx..] {
        for x in &p[start + 14..start + 14 + nx] {
            if x * x + y * y <= 48.0 * 48.0 {
                offsets.extend([*x, *y]);
            }
        }
    }
    let primary = &p[16..16 + np];
    let hard = &p[16 + np..16 + np + nh];
    let reserved = &p[16 + np + nh..start];
    let baseline = primary
        .iter()
        .fold(0.0, |sum, i| sum + overlap(f.rect, f.row(*i as usize), 0.0));
    let mut job = vec![
        1.0,
        f.rect.x,
        f.rect.y,
        f.rect.width,
        f.rect.height,
        baseline,
        r[1],
        r[2],
        r[3],
        r[4],
        r[5],
        (offsets.len() / 2) as f64,
        np as f64,
        nh as f64,
        nr as f64,
        r[6],
    ];
    job.extend(offsets);
    for i in primary {
        let row = f.row(*i as usize);
        job.extend([row.x, row.y, row.width, row.height]);
    }
    for i in hard {
        let row = f.row(f.p + *i as usize);
        job.extend([
            row.x,
            row.y,
            row.width,
            row.height,
            overlap(f.rect, row, 0.0),
        ]);
    }
    for i in reserved {
        let row = f.row(*i as usize);
        job.extend([row.x, row.y, row.width, row.height]);
    }
    job.extend_from_slice(&r[8..]);
    job
}
#[test]
fn prepared_score_matches_existing_scorer_on_deterministic_channels_and_roads() {
    let mut seed = 42u32;
    let mut next = || {
        seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
        seed as f64 / u32::MAX as f64
    };
    for _ in 0..320 {
        let mut rows = Vec::new();
        for _ in 0..24 {
            rows.push([
                next() * 160.0 - 80.0,
                next() * 160.0 - 80.0,
                next() * 32.0,
                next() * 32.0,
            ]);
        }
        let f = frame(&rows[..8], &rows[8..16], &rows[16..]);
        let mut p = prepared(&f);
        let mut r = road(2.0, &[[10.0, -40.0, 10.0, 40.0, 2.0]]);
        r[1] = 1.0;
        r[2] = next() * 2.0 - 1.0;
        r[3] = next() * 2.0 - 1.0;
        r[4] = next() * 20.0;
        let job = legacy_job(&f, &p, &r);
        let expected = unsafe { crate::geographic::geo_score(job.as_ptr(), job.len()) };
        let actual = score_prepared(&f, &mut p, &r);
        assert_eq!(actual, expected);
        if actual >= 0 {
            bits(
                &p[9..11],
                &job[16 + actual as usize * 2..18 + actual as usize * 2],
            );
        }
    }
    // Overflow remains ordinary arithmetic and matches the actual legacy scorer.
    let mut f = frame(&[[0.0, 0.0, 1e200, 1e200]], &[], &[]);
    f[8] = 1e200;
    f[9] = 1e200;
    let mut p = prepared(&f);
    let r = road(0.0, &[]);
    let job = legacy_job(&f, &p, &r);
    assert_eq!(score_prepared(&f, &mut p, &r), unsafe {
        crate::geographic::geo_score(job.as_ptr(), job.len())
    });
}
#[test]
fn bounded_axes_match_full_same_value_zero_sort_on_tiny_and_many_edges() {
    let mut rows = Vec::new();
    for i in -300i32..=300 {
        rows.push([
            i as f64 / 7.0,
            1000.0,
            (i % 7).unsigned_abs() as f64 / 13.0,
            0.0,
        ]);
    }
    rows.extend([
        [f64::from_bits(1), 1000.0, 0.0, 0.0],
        [-f64::from_bits(1), 1000.0, 0.0, 0.0],
        [-0.0, 1000.0, 0.0, 0.0],
    ]);
    let f = frame(&rows, &[], &[]);
    let parsed = Frame::parse(&f).unwrap();
    for vertical in [false, true] {
        let mut all: Vec<f64> = vec![0.0];
        for row in &rows {
            let origin = if vertical {
                parsed.rect.y
            } else {
                parsed.rect.x
            };
            let size = if vertical {
                parsed.rect.height
            } else {
                parsed.rect.width
            };
            let start = if vertical { row[1] } else { row[0] };
            let extent = if vertical { row[3] } else { row[2] };
            for value in [
                start - origin - size,
                start - origin - size - 4.0,
                start + extent - origin,
                start + extent - origin + 4.0,
            ] {
                if value.is_finite() && value.abs() <= 48.0 && !all.contains(&value) {
                    all.push(if value == 0.0 { 0.0 } else { value });
                }
            }
        }
        all.sort_by(|a, b| {
            let d = a.abs() - b.abs();
            let d = if d == 0.0 { a - b } else { d };
            d.partial_cmp(&0.0).unwrap()
        });
        all.truncate(16);
        bits(&axis(&parsed, vertical), &all);
    }
}

#[test]
fn legitimate_frame_updates_invalidate_previous_preparation_atomically() {
    let mut f = frame(&[], &[], &[[20.0, 20.0, 8.0, 8.0]]);
    f[5] = 0.0;
    let p = prepared(&f);
    for (index, value) in [(1, 2.0), (5, 1.0), (6, 1.0), (6, -0.0), (10, 2.0)] {
        let mut changed = f.clone();
        changed[index] = value;
        let mut output = p.clone();
        let before = output.clone();
        assert!(Frame::parse(&changed).is_some());
        assert_eq!(score_prepared(&changed, &mut output, &road(0.0, &[])), -2);
        bits(&output, &before);
    }
}
#[test]
fn strict_near_boundaries_and_unbounded_obstacle_counts() {
    let f = frame(
        &[
            [-53.0, 0.0, 1.0, 1.0],
            [-52.5, 0.0, 1.0, 1.0],
            [60.0, 0.0, 1.0, 1.0],
            [59.5, 0.0, 1.0, 1.0],
        ],
        &[],
        &[],
    );
    let p = prepared(&f);
    bits(&p[16..20], &[1.0, 3.0, 1.0, 3.0]);
    let far = vec![[1000.0, 1000.0, 8.0, 8.0]; 300];
    let f = frame(&far, &far, &far);
    let mut p = prepared(&f);
    assert_eq!(score_prepared(&f, &mut p, &road(0.0, &[])), 0);
}
