use super::solve;

fn golden(anchor_x: f64, anchor_y: f64) -> Vec<f64> {
    let mut input = vec![0.0; 52];
    input[..7].copy_from_slice(&[1.0, 1.0, 1.0, 1.0, 1.0, 16.0, 0.0]);
    input[16..24].copy_from_slice(&[-0.0, 0.0, 20.0, 10.0, anchor_x, anchor_y, 0.0, 1.0]);
    input[24..36].copy_from_slice(&[
        0.0, 0.0, 20.0, 10.0, 1.0, 1.0, 8.0, 8.0, -10.0, 10.0, 20.0, 20.0,
    ]);
    input
}

#[test]
fn frozen_js_goldens_preserve_all_placement_bits_and_work() {
    // Independently generated frozen-JS oracle cases 321/322; no solver-derived expectations.
    for (x, y) in [(-0.0, 0.0), (0.0, -0.0)] {
        let mut input = golden(x, y);
        let before: Vec<u64> = input[16..36].iter().map(|v| v.to_bits()).collect();
        assert_eq!(
            unsafe { solve(input.as_mut_ptr() as usize, input.len()) },
            1
        );
        assert_eq!(input[6], 472.0);
        let expected: [f64; 16] = [
            0.0, -14.0, 0.0, -14.0, 20.0, 10.0, 0.0, 200.0, 0.0, 119.0, 0.0, x, y, 0.0, -4.0, 1.0,
        ];
        for (column, value) in expected.iter().enumerate() {
            assert_eq!(
                input[36 + column].to_bits(),
                value.to_bits(),
                "column {column}"
            );
        }
        assert_eq!(
            input[16..36]
                .iter()
                .map(|v| v.to_bits())
                .collect::<Vec<_>>(),
            before
        );
    }
}

#[test]
fn malformed_headers_and_geometry_fail_without_mutation() {
    let base = golden(0.0, 0.0);
    for (word, value) in [
        (0, 2.0),
        (1, 257.0),
        (1, 0.5),
        (2, f64::INFINITY),
        (3, f64::NAN),
        (4, 4097.0),
        (5, 15.0),
        (6, 1.0),
        (15, 1.0),
        (18, 0.0),
        (20, f64::INFINITY),
        (22, 1.0),
        (23, 1025.0),
    ] {
        let mut input = base.clone();
        input[word] = value;
        let before: Vec<u64> = input.iter().map(|v| v.to_bits()).collect();
        assert_eq!(
            unsafe { solve(input.as_mut_ptr() as usize, input.len()) },
            -2,
            "word {word}"
        );
        assert_eq!(
            input.iter().map(|v| v.to_bits()).collect::<Vec<_>>(),
            before
        );
    }
    let mut input = base;
    assert_eq!(unsafe { solve(0, 16) }, -2);
    assert_eq!(
        unsafe { solve(input.as_mut_ptr() as usize + 1, input.len()) },
        -2
    );
    assert_eq!(
        unsafe { solve(input.as_mut_ptr() as usize, input.len() - 1) },
        -2
    );
}
