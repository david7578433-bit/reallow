export function serializeGroceries(out) {
  // One item per line keeps git diffs small (only changed prices show up in each commit).
  const base = JSON.stringify({ ...out, items: [] });
  const i = base.indexOf('"items":[]');
  return base.slice(0, i) + '"items":[\n' + out.items.map((a) => JSON.stringify(a)).join(',\n') + '\n]' + base.slice(i + 10);
}
