// A gallery in columns where a tile, once placed, stays in its column. CSS columns rebalance every
// column when a tile is added, so a new run or a loaded page moved the tiles the person was looking
// at. Here a tile not yet placed goes to the column that is shortest at that moment, and `placed`
// remembers it; within a column tiles keep the list's order (newest first). On the page the tiles stay
// in the list's order too (newest first for a screen reader and the Tab key): a grid of thin rows
// where each tile names its column and spans the rows its height takes (components/gallery.tsx).

// How tall a run's tile is for a column one unit wide: its pictures (two across from the second
// picture on) and the strip under them.
export function tileHeight(run: { aspectRatio: string; n: number }) {
  const [w = 1, h = 1] = run.aspectRatio.split(":").map(Number)
  const across = run.n > 1 ? 2 : 1
  return ((h || 1) / (w || 1)) * (Math.ceil(run.n / across) / across) + 0.3
}

// The column of each item, by id. A tile not yet placed goes to the column that is shortest at that
// moment; `placed` remembers every choice.
export function columnOf<T extends { id: string }>(
  items: T[],
  count: number,
  height: (item: T) => number,
  placed: Map<string, number>,
) {
  const heights = Array.from({ length: count }, () => 0)
  // A column count that changed (the window was resized) starts over.
  if ([...placed.values()].some((column) => column >= count)) placed.clear()
  for (const item of items) {
    const at = placed.get(item.id)
    if (at !== undefined) heights[at] = (heights[at] ?? 0) + height(item)
  }
  for (const item of items) {
    if (placed.has(item.id)) continue
    const at = heights.indexOf(Math.min(...heights))
    placed.set(item.id, at)
    heights[at] = (heights[at] ?? 0) + height(item)
  }
  return (id: string) => placed.get(id) ?? 0
}

// The same, as lists: each column's items in the list's order.
export function columnsOf<T extends { id: string }>(
  items: T[],
  count: number,
  height: (item: T) => number,
  placed: Map<string, number>,
) {
  const column = columnOf(items, count, height, placed)
  return Array.from({ length: count }, (_, at) => items.filter((item) => column(item.id) === at))
}
