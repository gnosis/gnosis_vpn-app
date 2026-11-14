// Writes src/assets/country-names.json, the one country-name list the main window
// (src/utils/destinations.ts) and the tray (src-tauri/src/exit_label.rs) both read.
// Run: nix develop --command deno run --allow-write=src/assets/country-names.json scripts/generate-country-names.ts
// The output is already in `nix fmt`'s shape, so formatting leaves it alone.

const OUT = "src/assets/country-names.json";
const names = new Intl.DisplayNames("en", { type: "region", fallback: "none" });

const table: Record<string, string> = {};
for (let a = 65; a <= 90; a++) {
  for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b);
    const name = names.of(code);
    if (name !== undefined) table[code] = name;
  }
}

await Deno.writeTextFile(OUT, JSON.stringify(table, null, 2) + "\n");
console.log(`wrote ${Object.keys(table).length} names to ${OUT}`);
