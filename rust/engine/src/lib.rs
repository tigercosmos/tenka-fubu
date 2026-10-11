use std::cmp::Ordering;
use std::collections::BinaryHeap;

mod geographic;
pub use geographic::{geo_score, geographic_abi_version};

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
extern "C" {
    fn path_node_cost(node: usize) -> f64;
}
#[cfg(not(target_arch = "wasm32"))]
unsafe fn path_node_cost(_node: usize) -> f64 {
    0.0
}

#[derive(Clone, Copy)]
struct Entry {
    cost: f64,
    key: usize,
}
impl PartialEq for Entry {
    fn eq(&self, other: &Self) -> bool {
        self.cost == other.cost && self.key == other.key
    }
}
impl Eq for Entry {}
impl PartialOrd for Entry {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}
impl Ord for Entry {
    fn cmp(&self, other: &Self) -> Ordering {
        other
            .cost
            .total_cmp(&self.cost)
            .then_with(|| other.key.cmp(&self.key))
    }
}

#[no_mangle]
pub extern "C" fn engine_abi_version() -> u32 {
    1
}

/// Allocate aligned f64 storage shared with the synchronous JavaScript adapter.
#[no_mangle]
pub extern "C" fn engine_alloc(length: usize) -> *mut f64 {
    let data = vec![0.0; length].into_boxed_slice();
    Box::into_raw(data) as *mut f64
}

/// # Safety
/// Pointer and length must identify a live allocation from engine_alloc.
#[no_mangle]
pub unsafe extern "C" fn engine_free(pointer: *mut f64, length: usize) {
    drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(
        pointer, length,
    )));
}

/// Cached CSR topology; query-dependent node costs arrive through the imported callback.
/// Node indexes follow JS UTF-16 identifier order; state keys are node*2+sea.
/// # Safety
/// Input/output pointers must refer to valid ABI-sized, nonoverlapping f64 storage.
#[no_mangle]
pub unsafe extern "C" fn path_solve(
    pointer: *const f64,
    nodes: usize,
    links: usize,
    source: usize,
    target: usize,
    speed: f64,
    embark: f64,
    output: *mut f64,
) -> i32 {
    let input = std::slice::from_raw_parts(pointer, nodes + 1 + links * 4);
    let offsets = &input[..nodes + 1];
    let neighbors = &input[nodes + 1..nodes + 1 + links];
    let edge_ids = &input[nodes + 1 + links..nodes + 1 + links * 2];
    let sea = &input[nodes + 1 + links * 2..nodes + 1 + links * 3];
    let movement = &input[nodes + 1 + links * 3..nodes + 1 + links * 4];
    if source >= nodes || target >= nodes {
        return -1;
    }
    let mut distance = vec![f64::INFINITY; nodes * 2];
    let mut previous = vec![None; nodes * 2];
    let mut node_costs = vec![None; nodes];
    let mut visited = vec![false; nodes * 2];
    let start = source * 2;
    distance[start] = 0.0;
    let mut heap = BinaryHeap::new();
    heap.push(Entry {
        cost: 0.0,
        key: start,
    });
    let mut goal = None;
    while let Some(best) = heap.pop() {
        if visited[best.key] || best.cost != distance[best.key] {
            continue;
        }
        visited[best.key] = true;
        let node = best.key / 2;
        if node == target {
            goal = Some(best.key);
            break;
        }
        for link in offsets[node] as usize..offsets[node + 1] as usize {
            let next = neighbors[link] as usize;
            let subjugation = *node_costs[next].get_or_insert_with(|| path_node_cost(next));
            if subjugation < 0.0 {
                continue;
            }
            let mode = sea[link] as usize;
            let mut move_days = movement[link];
            if mode == 0 {
                move_days /= speed;
            }
            if mode == 1 && best.key % 2 == 0 {
                move_days += embark;
            }
            let cost = best.cost + move_days + subjugation;
            let key = next * 2 + mode;
            if cost < distance[key] {
                distance[key] = cost;
                previous[key] = Some((best.key, edge_ids[link]));
                heap.push(Entry { cost, key });
            }
        }
    }
    let Some(mut key) = goal else {
        return -1;
    };
    let mut path = Vec::new();
    while let Some((parent, edge)) = previous[key] {
        path.push(edge);
        key = parent;
    }
    path.reverse();
    std::slice::from_raw_parts_mut(output, path.len()).copy_from_slice(&path);
    path.len() as i32
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn frontier_orders_equal_cost_by_node_then_land_mode() {
        let mut heap = BinaryHeap::new();
        for key in [5, 2, 3, 0] {
            heap.push(Entry { cost: 1.0, key });
        }
        assert_eq!(
            (0..4).map(|_| heap.pop().unwrap().key).collect::<Vec<_>>(),
            vec![0, 2, 3, 5]
        );
    }
}
