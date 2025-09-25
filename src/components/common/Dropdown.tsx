import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import arrowDownIcon from "../../assets/icons/arrow-down.svg";

export type DropdownProps<T> = {
  options: T[];
  value?: T | null;
  onChange: (v: T) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  itemToString?: (v: T) => string;
  class?: string;
};

export function Dropdown<T>(props: DropdownProps<T>) {
  const toString = (v: T | undefined | null) =>
    v == null ? "" : props.itemToString ? props.itemToString(v) : String(v);

  const [open, setOpen] = createSignal(false);
  const [mounted, setMounted] = createSignal(false);
  const [activeIdx, setActiveIdx] = createSignal(-1);

  const [pressed, setPressed] = createSignal(false);
  let pressTimeout: number | undefined;
  const playPressAnimation = () => {
    if (pressTimeout !== undefined) {
      window.clearTimeout(pressTimeout);
    }
    setPressed(false);
    requestAnimationFrame(() => {
      setPressed(true);
      pressTimeout = window.setTimeout(() => setPressed(false), 160);
    });
  };

  let root!: HTMLDivElement;
  let btn!: HTMLButtonElement;
  let list!: HTMLUListElement;

  const [listPos, setListPos] = createSignal({ top: 0, left: 0, width: 0 });
  const updatePosition = () => {
    if (!root) return;
    const rect = root.getBoundingClientRect();
    setListPos({
      top: Math.round(rect.bottom),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
    });
  };

  const selectedIdx = createMemo(() => props.options.findIndex(o => toString(o) === toString(props.value ?? null)));

  const onDocClick = (e: MouseEvent) => {
    const target = e.target as Node;
    if (!root.contains(target) && !(list && list.contains(target))) setOpen(false);
  };

  onMount(() => {
    document.addEventListener("mousedown", onDocClick);
  });
  onCleanup(() => {
    document.removeEventListener("mousedown", onDocClick);
  });

  createEffect(() => {
    let closeTimeout: number | undefined;
    if (open()) {
      if (closeTimeout !== undefined) window.clearTimeout(closeTimeout);
      setMounted(true);
      const idx = selectedIdx();
      setActiveIdx(idx >= 0 ? idx : 0);
      updatePosition();
      queueMicrotask(() => list?.focus());
    } else if (mounted()) {
      closeTimeout = window.setTimeout(() => setMounted(false), 150);
    }
  });

  const onReposition = () => updatePosition();
  createEffect(() => {
    if (open()) {
      window.addEventListener("resize", onReposition);
      window.addEventListener("scroll", onReposition, true);
    }
    onCleanup(() => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    });
  });

  const selectByIndex = (i: number) => {
    const opt = props.options[i];
    if (opt !== undefined) {
      props.onChange(opt);
      setOpen(false);
      btn?.focus();
    }
  };

  const onListKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(i => Math.min(props.options.length - 1, i < 0 ? 0 : i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(0, i < 0 ? 0 : i - 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectByIndex(activeIdx());
    } else if (e.key === "Escape") {
      setOpen(false);
      btn?.focus();
    }
  };

  return (
    <>
      <div ref={root} class={`relative text-left w-full flex flex-row items-center ${props.class ?? ""}`}>
        <div class="flex flex-col flex-grow">
          <Show when={props.label}>
            <div class="mb-1 text-xs text-gray-500">{props.label}</div>
          </Show>

          <span class="font-bold">{props.value ? toString(props.value) : (props.placeholder ?? "Select…")}</span>
        </div>
        <button
          ref={btn}
          type="button"
          disabled={props.disabled}
          aria-haspopup="listbox"
          aria-expanded={open()}
          class="h-10 w-15 inline-flex items-center justify-center rounded-2xl px-4 py-2
               bg-black text-white shadow disabled:opacity-50 hover:cursor-pointer outline-none
               transition-transform duration-150 ease-out select-none"
          classList={{ "btn-press": pressed() }}
          onPointerDown={() => playPressAnimation()}
          onClick={() => !props.disabled && setOpen(!open())}
          onKeyDown={e => {
            if ((e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") && !open()) {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          <img
            src={arrowDownIcon}
            class={`opacity-90 w-5 h-5 transition-transform duration-200 ${open() ? "rotate-180" : ""}`}
            alt="dropdown"
            aria-hidden="true"
          />
        </button>
      </div>

      <Show when={mounted()}>
        <Portal>
          <ul
            ref={list}
            tabindex="0"
            role="listbox"
            aria-activedescendant={activeIdx() >= 0 ? `opt-${activeIdx()}` : undefined}
            onKeyDown={onListKey}
            class={`fixed z-50 max-h-64 overflow-auto rounded-xl bg-white shadow-lg ring-1 ring-black/10 p-1 outline-none
                     transition-all duration-200 ease-out origin-top
                     ${open() ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"}`}
            style={{ top: `${listPos().top}px`, left: `${listPos().left}px`, width: `${listPos().width}px` }}
          >
            <For each={props.options}>
              {(opt, i) => {
                const idx = i();
                const isActive = () => activeIdx() === idx;
                const isSelected = () => selectedIdx() === idx;
                return (
                  <li
                    id={`opt-${idx}`}
                    role="option"
                    aria-selected={isSelected()}
                    class={`cursor-pointer rounded-xl px-3 py-2 text-sm
                             ${isActive() ? "bg-black text-white" : "hover:bg-gray-100"}
                             ${isSelected() && !isActive() ? "font-semibold" : ""}`}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => selectByIndex(idx)}
                  >
                    {toString(opt)}
                  </li>
                );
              }}
            </For>
          </ul>
        </Portal>
      </Show>
    </>
  );
}
