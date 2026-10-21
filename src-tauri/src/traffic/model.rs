//! Retained aggregation model and moving-window projection.
//!
//! The model owns what the daemon deliberately does not: 300 seconds of history,
//! stable row slots, and the projection of a selected timeframe into physical
//! columns. Target identities never leave this module; the projection exposes
//! only row, column, volume band and category.

use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashMap};
use std::net::IpAddr;

use serde::Serialize;

use super::protocol::{Batch, Class, Direction, PROTOCOL_VERSION};

/// Retained seconds of history.
pub const RETENTION_SECONDS: u64 = 300;
/// Retained targets. New targets are refused beyond this; existing ones keep
/// reporting.
pub const MAX_LANES: usize = 5_000;
pub const DEFAULT_TIMEFRAME: u32 = 20;
pub const MAX_TIMEFRAME: u32 = 300;
/// Byte-band boundaries from the design: upper bound of bands 1 through 5.
const BAND_UPPER_BOUNDS: [u64; 5] = [511, 2_047, 8_191, 32_767, 131_071];

/// One private lane identity: a remote address and how it was classified.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct LaneKey {
    pub target: IpAddr,
    pub class: Class,
}

struct Lane {
    slot: u32,
    buckets: HashMap<(u64, Direction), u64>,
}

impl Lane {
    fn new(slot: u32) -> Self {
        Self {
            slot,
            buckets: HashMap::new(),
        }
    }
}

/// A renderable block. Deliberately carries no address or identity.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct Cell {
    /// Row offset within the returned range.
    pub row: u32,
    pub column: u32,
    /// 1 through 6; 0 never appears because empty cells are omitted.
    pub band: u8,
    pub class: Class,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Frame {
    pub timeframe_seconds: u32,
    pub current_second: u64,
    /// Highest occupied slot, i.e. the scroll extent in rows.
    pub total_rows: u32,
    pub first_row: u32,
    pub rows: u32,
    pub cells: Vec<Cell>,
    /// Targets refused because [`MAX_LANES`] was reached.
    pub dropped_targets: u64,
    /// Batches the daemon discarded because this app fell behind.
    pub dropped_batches: u64,
}

#[derive(Default)]
pub struct Model {
    lanes: HashMap<LaneKey, Lane>,
    free_slots: BinaryHeap<Reverse<u32>>,
    next_slot: u32,
    current_second: u64,
    dropped_targets: u64,
    dropped_batches: u64,
}

impl Model {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn reset(&mut self) {
        *self = Self::default();
    }

    pub fn current_second(&self) -> u64 {
        self.current_second
    }

    pub fn ingest(&mut self, batch: &Batch) {
        if batch.protocol != PROTOCOL_VERSION {
            return;
        }
        self.current_second = self.current_second.max(batch.elapsed_ms / 1000);
        self.dropped_batches = self.dropped_batches.max(batch.dropped_batches);

        let oldest = self.oldest_retained_second();
        for delta in &batch.deltas {
            if delta.second < oldest || delta.bytes == 0 {
                continue;
            }
            let key = LaneKey {
                target: delta.target,
                class: delta.class,
            };
            let Some(lane) = self.lane(key) else {
                self.dropped_targets += 1;
                continue;
            };
            *lane
                .buckets
                .entry((delta.second, delta.direction))
                .or_insert(0) += delta.bytes;
        }
        self.prune();
    }

    /// Returns the lane for `key`, admitting it with a fresh slot if needed.
    fn lane(&mut self, key: LaneKey) -> Option<&mut Lane> {
        if !self.lanes.contains_key(&key) {
            if self.lanes.len() >= MAX_LANES {
                return None;
            }
            let slot = match self.free_slots.pop() {
                Some(Reverse(slot)) => slot,
                None => {
                    self.next_slot += 1;
                    self.next_slot
                }
            };
            self.lanes.insert(key, Lane::new(slot));
        }
        self.lanes.get_mut(&key)
    }

    fn oldest_retained_second(&self) -> u64 {
        self.current_second
            .saturating_sub(RETENTION_SECONDS.saturating_sub(1))
    }

    fn prune(&mut self) {
        let oldest = self.oldest_retained_second();
        let mut released = Vec::new();
        for (key, lane) in self.lanes.iter_mut() {
            lane.buckets.retain(|(second, _), _| *second >= oldest);
            if lane.buckets.is_empty() {
                released.push((*key, lane.slot));
            }
        }
        for (key, slot) in released {
            self.lanes.remove(&key);
            self.free_slots.push(Reverse(slot));
        }
    }

    /// Projects retained history into `rows` rows starting at `first_row`.
    ///
    /// Row `n` is slot `n + 1`: a target keeps its physical row until its whole
    /// retained history expires, and gaps stay blank instead of compacting.
    pub fn project(&self, timeframe_seconds: u32, first_row: u32, rows: u32) -> Frame {
        let window = timeframe_seconds.clamp(1, MAX_TIMEFRAME);
        let now = self.current_second;
        let max_slot = self.lanes.values().map(|lane| lane.slot).max().unwrap_or(0);
        let mut cells = Vec::new();

        for (key, lane) in &self.lanes {
            if lane.slot == 0 || lane.slot - 1 < first_row || lane.slot - 1 >= first_row + rows {
                continue;
            }
            let row = lane.slot - 1 - first_row;
            for ((second, direction), bytes) in &lane.buckets {
                let Some(age) = now.checked_sub(*second) else {
                    continue;
                };
                if age >= u64::from(window) {
                    continue;
                }
                let column = match direction {
                    Direction::Upstream => age,
                    Direction::Downstream => u64::from(window) - 1 - age,
                };
                cells.push(Cell {
                    row,
                    column: column as u32,
                    band: band(*bytes),
                    class: key.class,
                });
            }
        }
        cells.sort_unstable_by_key(|cell| (cell.row, cell.column));

        Frame {
            timeframe_seconds: window,
            current_second: now,
            total_rows: max_slot,
            first_row,
            rows,
            cells,
            dropped_targets: self.dropped_targets,
            dropped_batches: self.dropped_batches,
        }
    }
}

/// Maps total bytes in one second to the design's volume band.
pub fn band(bytes: u64) -> u8 {
    if bytes == 0 {
        return 0;
    }
    match BAND_UPPER_BOUNDS.iter().position(|bound| bytes <= *bound) {
        Some(index) => index as u8 + 1,
        None => 6,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn delta(
        second: u64,
        target: &str,
        direction: Direction,
        bytes: u64,
    ) -> super::super::protocol::Delta {
        super::super::protocol::Delta {
            second,
            target: target.parse().expect("ip"),
            class: Class::Other,
            direction,
            packets: 1,
            bytes,
            largest_packet: bytes as u32,
        }
    }

    fn batch(sequence: u64, elapsed_ms: u64, deltas: Vec<super::super::protocol::Delta>) -> Batch {
        Batch {
            protocol: PROTOCOL_VERSION,
            session_id: 1,
            sequence,
            elapsed_ms,
            deltas,
            dropped_batches: 0,
        }
    }

    #[test]
    fn opposing_columns_for_a_five_second_window() {
        let mut model = Model::new();
        // One upstream and one downstream block, both in second 4.
        model.ingest(&batch(
            0,
            4_000,
            vec![
                delta(4, "203.0.113.1", Direction::Upstream, 100),
                delta(4, "203.0.113.1", Direction::Downstream, 100),
            ],
        ));
        let frame = model.project(5, 0, 10);
        assert_eq!(frame.current_second, 4);
        assert_eq!(frame.timeframe_seconds, 5);
        let upstream = frame
            .cells
            .iter()
            .find(|cell| cell.column == 0)
            .expect("newest upstream is leftmost");
        let downstream = frame
            .cells
            .iter()
            .find(|cell| cell.column == 4)
            .expect("newest downstream is rightmost");
        assert_eq!(upstream.row, 0);
        assert_eq!(downstream.row, 0);
        assert_eq!(frame.cells.len(), 2);
    }

    #[test]
    fn blocks_advance_one_column_per_second() {
        let mut model = Model::new();
        model.ingest(&batch(
            0,
            4_000,
            vec![
                delta(4, "203.0.113.1", Direction::Upstream, 100),
                delta(4, "203.0.113.1", Direction::Downstream, 100),
            ],
        ));
        model.ingest(&batch(1, 5_000, Vec::new()));
        let frame = model.project(5, 0, 10);
        let columns: Vec<u32> = frame.cells.iter().map(|cell| cell.column).collect();
        // One second later the upstream block moved right and the downstream one left.
        assert_eq!(columns, vec![1, 3]);
    }

    #[test]
    fn rows_stay_put_and_expired_slots_are_reused_lowest_first() {
        let mut model = Model::new();
        model.ingest(&batch(
            0,
            0,
            vec![
                delta(0, "203.0.113.1", Direction::Upstream, 10),
                delta(0, "203.0.113.2", Direction::Upstream, 10),
                delta(0, "203.0.113.3", Direction::Upstream, 10),
            ],
        ));
        let rows: Vec<u32> = model
            .project(5, 0, 10)
            .cells
            .iter()
            .map(|cell| cell.row)
            .collect();
        assert_eq!(rows, vec![0, 1, 2]);

        // The first target stops sending and expires while the others continue.
        for second in 1..=(RETENTION_SECONDS + 1) {
            let mut deltas = vec![delta(second, "203.0.113.2", Direction::Upstream, 10)];
            deltas.push(delta(second, "203.0.113.3", Direction::Upstream, 10));
            model.ingest(&batch(second + 1, second * 1000, deltas));
        }
        let frame = model.project(5, 0, 10);
        assert_eq!(frame.total_rows, 3, "slots 2 and 3 stay where they were");
        let rows: std::collections::BTreeSet<u32> =
            frame.cells.iter().map(|cell| cell.row).collect();
        assert_eq!(rows.into_iter().collect::<Vec<_>>(), vec![1, 2]);

        // A new target takes the lowest free slot instead of growing the table.
        model.ingest(&batch(
            10_000,
            (RETENTION_SECONDS + 1) * 1000,
            vec![delta(
                RETENTION_SECONDS + 1,
                "203.0.113.4",
                Direction::Upstream,
                10,
            )],
        ));
        let rows: std::collections::BTreeSet<u32> = model
            .project(5, 0, 10)
            .cells
            .iter()
            .map(|cell| cell.row)
            .collect();
        assert!(rows.contains(&0), "reused slot 1: {rows:?}");
        assert_eq!(model.project(5, 0, 10).total_rows, 3);
    }

    #[test]
    fn retention_keeps_the_boundary_second_only() {
        let mut model = Model::new();
        let now = RETENTION_SECONDS; // second 300
        model.ingest(&batch(
            0,
            now * 1000,
            vec![
                delta(1, "203.0.113.1", Direction::Upstream, 10),
                delta(0, "203.0.113.2", Direction::Upstream, 10),
            ],
        ));
        // T - R + 1 = 1 stays, second 0 is gone.
        let rows: Vec<u32> = model
            .project(300, 0, 10)
            .cells
            .iter()
            .map(|cell| cell.row)
            .collect();
        assert_eq!(rows, vec![0]);
        assert_eq!(model.project(300, 0, 10).total_rows, 1);
    }

    #[test]
    fn changing_the_window_reprojects_without_moving_rows() {
        let mut model = Model::new();
        model.ingest(&batch(
            0,
            10_000,
            vec![delta(3, "203.0.113.1", Direction::Upstream, 10)],
        ));
        assert!(model.project(5, 0, 10).cells.is_empty());
        let wide = model.project(60, 0, 10);
        assert_eq!(wide.cells.len(), 1);
        assert_eq!(wide.cells[0].row, 0);
        assert_eq!(wide.cells[0].column, 7);
    }

    #[test]
    fn rows_outside_the_requested_range_are_not_projected() {
        let mut model = Model::new();
        model.ingest(&batch(
            0,
            0,
            vec![
                delta(0, "203.0.113.1", Direction::Upstream, 10),
                delta(0, "203.0.113.2", Direction::Upstream, 10),
            ],
        ));
        let frame = model.project(5, 1, 1);
        assert_eq!(frame.total_rows, 2);
        assert_eq!(frame.cells.len(), 1);
        assert_eq!(frame.cells[0].row, 0);
    }

    #[test]
    fn classes_share_a_row_per_target_and_class() {
        let mut model = Model::new();
        let mut hopr = delta(0, "203.0.113.1", Direction::Upstream, 10);
        hopr.class = Class::HoprAssociated;
        model.ingest(&batch(
            0,
            0,
            vec![hopr, delta(0, "203.0.113.1", Direction::Upstream, 10)],
        ));
        let frame = model.project(5, 0, 10);
        assert_eq!(frame.cells.len(), 2);
        assert_eq!(frame.cells[0].row, 0);
        assert_eq!(frame.cells[1].row, 1);
    }

    #[test]
    fn batches_from_another_protocol_are_ignored() {
        let mut model = Model::new();
        let mut foreign = batch(
            0,
            5_000,
            vec![delta(5, "203.0.113.1", Direction::Upstream, 10)],
        );
        foreign.protocol = PROTOCOL_VERSION + 1;
        model.ingest(&foreign);
        assert_eq!(model.current_second(), 0);
        assert!(model.project(5, 0, 10).cells.is_empty());
    }

    #[test]
    fn target_capacity_refuses_new_lanes_but_keeps_existing_ones() {
        let mut model = Model::new();
        let deltas: Vec<_> = (0..MAX_LANES)
            .map(|index| {
                delta(
                    0,
                    &format!(
                        "10.{}.{}.{}",
                        index / 65_536,
                        (index / 256) % 256,
                        index % 256
                    ),
                    Direction::Upstream,
                    10,
                )
            })
            .collect();
        model.ingest(&batch(0, 0, deltas));
        let frame = model.project(5, 0, u32::MAX);
        assert_eq!(frame.total_rows, MAX_LANES as u32);
        assert_eq!(frame.dropped_targets, 0);

        model.ingest(&batch(
            1,
            0,
            vec![delta(0, "198.51.100.7", Direction::Upstream, 10)],
        ));
        let frame = model.project(5, 0, u32::MAX);
        assert_eq!(frame.dropped_targets, 1);
        assert_eq!(frame.total_rows, MAX_LANES as u32);
    }

    #[test]
    fn byte_band_boundaries_match_the_design() {
        let cases = [
            (0, 0),
            (1, 1),
            (511, 1),
            (512, 2),
            (2_047, 2),
            (2_048, 3),
            (8_191, 3),
            (8_192, 4),
            (32_767, 4),
            (32_768, 5),
            (131_071, 5),
            (131_072, 6),
            (10_000_000, 6),
        ];
        for (bytes, expected) in cases {
            assert_eq!(band(bytes), expected, "{bytes}");
        }
    }

    #[test]
    fn reset_clears_rows_and_history() {
        let mut model = Model::new();
        model.ingest(&batch(
            0,
            0,
            vec![delta(0, "203.0.113.1", Direction::Upstream, 10)],
        ));
        model.reset();
        let frame = model.project(20, 0, 10);
        assert_eq!(frame.total_rows, 0);
        assert!(frame.cells.is_empty());
        assert_eq!(frame.current_second, 0);
    }
}
