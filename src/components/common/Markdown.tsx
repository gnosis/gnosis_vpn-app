import { marked } from "marked";
import { JSX, onMount, onCleanup } from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";

marked.setOptions({ async: false });

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

  const html = () => marked.parse(props.children) as string;
  return <div ref={ref} class="md-content" innerHTML={html()} />;
}
