export interface FlagAttribution {
  code: string;
  source: string;
  licence: string;
  author: string;
}

const NO_CREDIT_LICENCES = ["Public domain", "CC0"];

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Wikimedia rows of the generated flags NOTICE.md whose licence obliges a credit. */
export function parseFlagAttributions(markdown: string): FlagAttribution[] {
  const attributions: FlagAttribution[] = [];
  for (const line of markdown.split("\n")) {
    const cells = line.split(" | ");
    if (cells.length !== 5) continue;

    const [codeCell, source, origin, licence, authorCell] = cells;
    const isWikimedia = origin === "Wikimedia Commons";
    const needsCredit = !NO_CREDIT_LICENCES.includes(licence);
    if (!isWikimedia || !needsCredit) continue;

    attributions.push({
      code: codeCell.replace(/^\| `/, "").replace(/`$/, ""),
      source: decodeEntities(source),
      licence,
      author: decodeEntities(authorCell.replace(/ ?\|$/, "").trim()),
    });
  }
  return attributions;
}
