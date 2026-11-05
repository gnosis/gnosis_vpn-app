import {
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Portal } from "solid-js/web";
import arrowDownIcon from "@src/components/icons/arrow-down.svg";
import ChevronIcon from "@src/components/icons/ChevronIcon.tsx";

// The quiet trigger is narrow, so its list is wider and hangs from its right edge.
const QUIET_LIST_MIN_WIDTH = 220;
const LIST_MARGIN = 8;

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
  /** "quiet": muted text with a chevron, for a value at the end of a settings row. */
  size?: "sm" | "lg" | "quiet";
  ariaLabel?: string;
  header?: () => JSX.Element;
  onOpen?: () => void;
  onClose?: () => void;
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
    globalThis.clearTimeout(pressTimeout);
    setPressed(false);
    requestAnimationFrame(() => {
      setPressed(true);
      pressTimeout = globalThis.setTimeout(() => setPressed(false), 160);
    });
  };

  let closeTimeout: ReturnType<typeof globalThis.setTimeout> | undefined;

  let root!: HTMLDivElement;
  let btn!: HTMLButtonElement;
  let list!: HTMLUListElement;
  let listContainer!: HTMLDivElement;

  const [listPos, setListPos] = createSignal({ top: 0, left: 0, width: 0 });
  const updatePosition = () => {
    if (!root) return;
    const rect = root.getBoundingClientRect();
    if (props.size === "quiet") {
      const width = Math.max(rect.width, QUIET_LIST_MIN_WIDTH);
      const left = Math.min(
        Math.max(rect.right - width, LIST_MARGIN),
        globalThis.innerWidth - width - LIST_MARGIN,
      );
      setListPos({
        top: Math.round(rect.bottom + 4),
        left: Math.round(left),
        width: Math.round(width),
      });
      return;
    }
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
    if (
      !root.contains(target) &&
      !(listContainer && listContainer.contains(target))
    ) {
      setOpen(false);
    }
  };

  onMount(() => {
    document.addEventListener("mousedown", onDocClick);
  });
  onCleanup(() => {
    document.removeEventListener("mousedown", onDocClick);
    globalThis.clearTimeout(closeTimeout);
    globalThis.clearTimeout(pressTimeout);
  });

  createEffect(
    on(open, (isOpen) => {
      if (isOpen) {
        globalThis.clearTimeout(closeTimeout);
        setMounted(true);
        const idx = selectedIdx();
        if (idx >= 0 && !isDisabledIndex(idx)) {
          setActiveIdx(idx);
        } else {
          setActiveIdx(firstEnabledIndex());
        }
        updatePosition();
        props.onOpen?.();
        queueMicrotask(() => list?.focus());
      } else if (mounted()) {
        props.onClose?.();
        closeTimeout = globalThis.setTimeout(() => setMounted(false), 200);
      }
    }),
  );

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
    }
  };

  return (
    <>
      <div
        ref={root}
        class={`relative text-left ${
          props.size === "sm"
            ? "bg-accent text-accent-text hover:bg-accent-hover pr-0 pl-4 py-2 rounded-full min-w-48 hover:cursor-pointer"
            : props.size === "quiet"
            ? "min-w-0 text-xs text-text-subtle hover:text-text-primary"
            : "w-full"
        } flex flex-row gap-2 items-center ${props.class ?? ""}`}
      >
        <div class="flex min-w-0 flex-col grow">
          <Show when={props.label}>
            <div class="mb-1 text-xs text-text-secondary">{props.label}</div>
          </Show>

          <span
            class={`${
              props.size === "sm"
                ? "text-accent-text"
                : props.size === "quiet"
                ? "truncate"
                : "font-bold text-text-primary"
            }`}
          >
            {props.value
              ? props.renderValue
                ? props.renderValue(props.value)
                : toString(props.value)
              : (props.placeholder ?? "Select…")}
          </span>
        </div>
        <Show when={props.size === "quiet"}>
          <ChevronIcon
            class={`w-2 transition-transform duration-200 ${
              open() ? "rotate-180" : ""
            }`}
          />
        </Show>
        <button
          ref={btn}
          type="button"
          disabled={props.disabled}
          aria-haspopup="listbox"
          aria-expanded={open()}
          aria-label={props.ariaLabel}
          class={props.size === "quiet"
            ? "absolute inset-0 rounded-md hover:cursor-pointer disabled:opacity-50"
            : `inline-flex items-center justify-center rounded-2xl px-4 py-2
               text-accent-text disabled:opacity-50 hover:cursor-pointer outline-none
               transition-transform duration-150 ease-out select-none ${
              props.size === "sm"
                ? "bg-transparent h-6 w-10 hover:bg-transparent"
                : "bg-accent h-10 w-16 hover:bg-accent-hover"
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
          <Show when={props.size !== "quiet"}>
            <img
              src={arrowDownIcon}
              class={`opacity-90 ${
                props.size === "sm" ? "w-4 h-4" : "w-5 h-5"
              } transition-transform duration-200 ${
                open() ? "rotate-180" : ""
              }`}
              alt="dropdown"
              aria-hidden="true"
            />
          </Show>
        </button>
      </div>

      <Show when={mounted()}>
        <Portal>
          <div
            ref={listContainer}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                // Solid delegates keydown to document, so the page underneath sees this Escape too
                e.preventDefault();
                setOpen(false);
                btn?.focus();
              }
            }}
            class={`fixed z-130 rounded-xl bg-bg-surface shadow-lg ring-1 ring-black/10 outline-none
                     transition-all duration-200 ease-out origin-top
                     starting:opacity-0 starting:-translate-y-2 starting:pointer-events-none
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
            {/* header lives outside the listbox so interactive controls don't violate ARIA listbox semantics */}
            <Show when={props.header}>
              <div class="px-3 py-2 border-b border-white/8">
                {props.header?.()}
              </div>
            </Show>
            <ul
              ref={list}
              tabindex="0"
              role="listbox"
              aria-activedescendant={activeIdx() >= 0
                ? `opt-${activeIdx()}`
                : undefined}
              onKeyDown={onListKey}
              class="max-h-64 overflow-auto p-1 outline-none"
            >
              <For each={props.options}>
                {(opt, i) => {
                  const isActive = () => activeIdx() === i();
                  const isSelected = () => selectedIdx() === i();
                  const isDisabled = () => (props.isOptionDisabled
                    ? !!props.isOptionDisabled(opt)
                    : false);
                  return (
                    <li
                      id={`opt-${i()}`}
                      role="option"
                      aria-selected={isSelected()}
                      aria-disabled={isDisabled()}
                      class={`cursor-pointer rounded-xl px-3 py-2 text-sm
                               ${
                        isActive() && !isDisabled()
                          ? "bg-accent text-accent-text"
                          : !isDisabled()
                          ? "hover:bg-bg-surface/50"
                          : "opacity-50 cursor-not-allowed"
                      }
                               ${
                        isSelected() && !isActive() ? "font-semibold" : ""
                      }`}
                      onMouseEnter={() => !isDisabled() && setActiveIdx(i())}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => !isDisabled() && selectByIndex(i())}
                    >
                      {props.renderOption
                        ? props.renderOption(opt)
                        : toString(opt)}
                    </li>
                  );
                }}
              </For>
            </ul>
          </div>
        </Portal>
      </Show>
    </>
  );
}
