import type { TransportOrder } from '../state/gameState';

/** Reverse an outbound order at its physical position using the existing partial-edge encoding. */
export function reverseTransport(order: TransportOrder): void {
  if (order.edgeProgressDays > 0 && order.pathCursor + 1 < order.path.length) {
    order.pathCursor += 1;
    order.edgeCostDays = order.edgeProgressDays;
    order.edgeProgressDays = 0;
  } else if (order.edgeProgressDays === 0) {
    // At an unspent edge entry, the cursor is still the actual node, not the far endpoint.
    order.edgeCostDays = 0;
  }
  order.returning = true;
}
