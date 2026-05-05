import { marked } from "marked";
import DOMPurify from "dompurify";
import { JSX, onCleanup, onMount } from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";

marked.setOptions({ async: false });

const ALLOWED_TAGS = [
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "strong",
  "ul",
];
const ALLOWED_ATTR = ["href", "title", "class"];

export function Markdown(props: { children: string }): JSX.Element {
  let ref: HTMLDivElement | undefined;

  const onClick = (e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest("a");
    if (!target) return;
    const href = target.getAttribute("href");
    if (!href) return;
    e.preventDefault();
    void openUrl(href);
  };

  onMount(() => ref?.addEventListener("click", onClick));
  onCleanup(() => ref?.removeEventListener("click", onClick));

  const html = () =>
    DOMPurify.sanitize(marked.parse(props.children) as string, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
    });

  return <div ref={ref} class="md-content" innerHTML={html()} />;
}
