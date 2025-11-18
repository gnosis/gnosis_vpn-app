import {
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Portal } from "solid-js/web";
import arrowDownIcon from "@assets/icons/arrow-down.svg";

export type DropdownProps<T> = {
  options: T[];
  value?: T | null;
  onChange: (v: T) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  itemToString?: (v: T) => string;
  renderValue?: (v: T) => JSX.Element;
  renderOption?: (v: T) => JSX.Element;
  isOptionDisabled?: (v: T) => boolean;
  class?: string;
  size?: "sm" | "lg";
};

export function Dropdown<T>(props: DropdownProps<T>) {
  const toString = (v: T | undefined | null) =>
    v == null ? "" : props.itemToString ? props.itemToString(v) : String(v);

  const [open, setOpen] = createSignal(false);
  const [mounted, setMounted] = createSignal(false);
  const [activeIdx, setActiveIdx] = createSignal(-1);

  const [pressed, setPressed] = createSignal(false);
  let pressTimeout: ReturnType<typeof globalThis.setTimeout> | undefined;
  const playPressAnimation = () => {
    if (pressTimeout !== undefined) {
      globalThis.clearTimeout(pressTimeout);
    }
    setPressed(false);
    requestAnimationFrame(() => {
      setPressed(true);
      pressTimeout = globalThis.setTimeout(() => setPressed(false), 160);
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

  const selectedIdx = createMemo(() =>
    props.options.findIndex((o) =>
      toString(o) === toString(props.value ?? null)
    )
  );

  const isDisabledIndex = (i: number): boolean => {
    const opt = props.options[i];
    return opt === undefined
      ? true
      : props.isOptionDisabled
      ? !!props.isOptionDisabled(opt)
      : false;
  };

  const firstEnabledIndex = (): number => {
    for (let i = 0; i < props.options.length; i++) {
      if (!isDisabledIndex(i)) return i;
    }
    return -1;
  };

  const nextEnabledIndex = (from: number, dir: 1 | -1): number => {
    let i = from;
    while (true) {
      i += dir;
      if (i < 0 || i >= props.options.length) return from;
      if (!isDisabledIndex(i)) return i;
    }
  };

  const onDocClick = (e: MouseEvent) => {
    const target = e.target as Node;
    if (!root.contains(target) && !(list && list.contains(target))) {
      setOpen(false);
    }
  };

  onMount(() => {
    document.addEventListener("mousedown", onDocClick);
  });
  onCleanup(() => {
    document.removeEventListener("mousedown", onDocClick);
  });

  createEffect(() => {
    let closeTimeout: ReturnType<typeof globalThis.setTimeout> | undefined;
    if (open()) {
      if (closeTimeout !== undefined) globalThis.clearTimeout(closeTimeout);
      setMounted(true);
      const idx = selectedIdx();
      if (idx >= 0 && !isDisabledIndex(idx)) {
        setActiveIdx(idx);
      } else {
        setActiveIdx(firstEnabledIndex());
      }
      updatePosition();
      queueMicrotask(() => list?.focus());
    } else if (mounted()) {
      closeTimeout = globalThis.setTimeout(() => setMounted(false), 150);
    }
  });

  const onReposition = () => updatePosition();
  createEffect(() => {
    if (open()) {
      globalThis.addEventListener("resize", onReposition);
      globalThis.addEventListener("scroll", onReposition, true);
    }
    onCleanup(() => {
      globalThis.removeEventListener("resize", onReposition);
      globalThis.removeEventListener("scroll", onReposition, true);
    });
  });

  const selectByIndex = (i: number) => {
    const opt = props.options[i];
    const disabled = isDisabledIndex(i);
    if (opt !== undefined && !disabled && !props.disabled) {
      props.onChange(opt);
      setOpen(false);
      btn?.focus();
    }
  };

  const onListKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => {
        const start = i < 0 ? firstEnabledIndex() : i;
        if (start < 0) return -1;
        return nextEnabledIndex(start, 1);
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => {
        const start = i < 0 ? firstEnabledIndex() : i;
        if (start < 0) return -1;
        return nextEnabledIndex(start, -1);
      });
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
      <div
        ref={root}
        class={`relative text-left ${
          props.size === "sm"
            ? "bg-black white pr-0 pl-4 py-2 rounded-full min-w-48"
            : "w-full"
        } flex flex-row gap-2 items-center ${props.class ?? ""}`}
      >
        <div class="flex flex-col grow">
          <Show when={props.label}>
            <div class="mb-1 text-xs text-gray-500">{props.label}</div>
          </Show>

          <span class={`${props.size === "sm" ? "text-white" : "font-bold "}`}>
            {props.value
              ? props.renderValue
                ? props.renderValue(props.value)
                : toString(props.value)
              : (props.placeholder ?? "Select…")}
          </span>
        </div>
        <button
          ref={btn}
          type="button"
          disabled={props.disabled}
          aria-haspopup="listbox"
          aria-expanded={open()}
          class={`inline-flex items-center justify-center rounded-2xl px-4 py-2
               bg-black text-white shadow disabled:opacity-50 hover:cursor-pointer outline-none
               transition-transform duration-150 ease-out select-none ${
            props.size === "sm" ? "h-6 w-10" : "h-10 w-16"
          }`}
          classList={{ "btn-press": pressed() }}
          onPointerDown={() => playPressAnimation()}
          onClick={() => !props.disabled && setOpen(!open())}
          onKeyDown={(e) => {
            if (
              (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") &&
              !open()
            ) {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          <img
            src={arrowDownIcon}
            class={`opacity-90 ${
              props.size === "sm" ? "w-4 h-4" : "w-5 h-5"
            } transition-transform duration-200 ${open() ? "rotate-180" : ""}`}
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
            aria-activedescendant={activeIdx() >= 0
              ? `opt-${activeIdx()}`
              : undefined}
            onKeyDown={onListKey}
            class={`fixed z-50 max-h-64 overflow-auto rounded-xl bg-white shadow-lg ring-1 ring-black/10 p-1 outline-none
                     transition-all duration-200 ease-out origin-top
                     ${
              open()
                ? "opacity-100 translate-y-0"
                : "opacity-0 -translate-y-2 pointer-events-none"
            }`}
            style={{
              top: `${listPos().top}px`,
              left: `${listPos().left}px`,
              width: `${listPos().width}px`,
            }}
          >
            <For each={props.options}>
              {(opt, i) => {
                const idx = i();
                const isActive = () => activeIdx() === idx;
                const isSelected = () => selectedIdx() === idx;
                const isDisabled = () => (props.isOptionDisabled
                  ? !!props.isOptionDisabled(opt)
                  : false);
                return (
                  <li
                    id={`opt-${idx}`}
                    role="option"
                    aria-selected={isSelected()}
                    aria-disabled={isDisabled()}
                    class={`cursor-pointer rounded-xl px-3 py-2 text-sm
                             ${
                      isActive() && !isDisabled()
                        ? "bg-black text-white"
                        : !isDisabled()
                        ? "hover:bg-gray-100"
                        : "opacity-50 cursor-not-allowed"
                    }
                             ${
                      isSelected() && !isActive() ? "font-semibold" : ""
                    }`}
                    onMouseEnter={() => !isDisabled() && setActiveIdx(idx)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => !isDisabled() && selectByIndex(idx)}
                  >
                    {props.renderOption
                      ? props.renderOption(opt)
                      : toString(opt)}
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
