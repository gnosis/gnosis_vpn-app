import { describe, expect, it } from "vitest";
import { parseFlagAttributions } from "@src/utils/flagNotice.ts";

const NOTICE = `# Flag art attribution

| Code | Source file | Origin | Licence | Author |
| --- | --- | --- | --- | --- |
| \`ad\` | Andorra | flag-icons | MIT | flag-icons contributors |
| \`ae-du\` | Flag of Dubai.svg | Wikimedia Commons | Public domain |  |
| \`at-1\` | Flag of Burgenland.svg | Wikimedia Commons | CC0 | Someone |
| \`ar-a\` | Bandera de Salta.svg | Wikimedia Commons | CC BY 4.0 | Gorivero |
| \`za-nc\` | Flag of Northern Cape.png | Wikimedia Commons | CC BY-SA 3.0 | AlexR.L. |
| \`fr-x\` | Flag X.svg | Wikimedia Commons | FAL |  |
| \`gb-y\` | Flag Y.svg | Wikimedia Commons | GFDL | A &amp; B &lt;ref&gt; |
`;

describe("parseFlagAttributions", () => {
  it("keeps only Wikimedia rows whose licence needs a credit", () => {
    const codes = parseFlagAttributions(NOTICE).map((a) => a.code);
    expect(codes).toEqual(["ar-a", "za-nc", "fr-x", "gb-y"]);
  });

  it("reads every column of a row", () => {
    expect(parseFlagAttributions(NOTICE)[1]).toEqual({
      code: "za-nc",
      source: "Flag of Northern Cape.png",
      licence: "CC BY-SA 3.0",
      author: "AlexR.L.",
    });
  });

  it("keeps an empty author as an empty string", () => {
    const fal = parseFlagAttributions(NOTICE).find((a) => a.code === "fr-x");
    expect(fal?.author).toBe("");
  });

  it("decodes HTML entities", () => {
    const gfdl = parseFlagAttributions(NOTICE).find((a) => a.code === "gb-y");
    expect(gfdl?.author).toBe("A & B <ref>");
  });
});
