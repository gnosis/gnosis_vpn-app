# Tooltip behaviour on desktop platforms

Reference notes on what native toolkits do with tooltips, gathered from toolkit
source and vendor documentation. This file describes the outside world, not our
code: where it and `src/components/common/Tooltip.tsx` disagree, neither is
automatically wrong.

## Why

WebKitGTK hit-tests a leave event's own coordinates. When a window stacked above
ours takes the pointer those coordinates still lie inside our view, so the
element under that point stays hovered: a tooltip sticks, and one can even
appear while the pointer is over the other window. The fix lives in the tooltip
itself — hide on window blur, and never show while the window is unfocused — and
it rests on assumptions about what "normal" tooltip behaviour is. Those
assumptions are written down here.

The three questions that matter are: does a tooltip appear on a window that is
not focused, how long does it stay after the pointer leaves the trigger, and
does it ever hide itself while the pointer stays put.

## Does a tooltip appear on an unfocused window?

Not on three of the four stacks. GTK is the outlier — which is exactly why this
bug is Linux-only.

| Stack                            | Appears? | Mechanism                                                                                                                                                                                                                      |
| -------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GTK (GNOME, XFCE, WebKitGTK)     | **yes**  | `gtktooltip.c` contains no focus check. The GTK4 file has zero occurrences of "focus"; GTK3's two are keyboard-mode (Ctrl+F1) hooks that return early unless keyboard mode is on. Losing focus does not hide a visible tooltip |
| Qt (KDE Plasma)                  | **no**   | `QApplication::event` sends `QEvent::ToolTip` only `if (showToolTip)`, where `showToolTip` walks the ancestors testing `isActiveWindow()`. Opt out per window with `Qt::WA_AlwaysShowToolTips`                                 |
| Windows (Win32, WinForms)        | **no**   | `TTS_ALWAYSTIP`: "Without this style, the tooltip appears only when the tool's owner window is active." WinForms `ToolTip.ShowAlways` defaults to `false`                                                                      |
| macOS (AppKit, Safari/WKWebView) | **no**   | `NSWindow.allowsToolTipsWhenApplicationIsInactive` — "The default is `NO`". Apple's reason: "Enabling tooltips in an inactive application will cause the application to do work any time the pointer passes over the window"   |

Qt goes further and kills an already-visible tip immediately on
`WindowActivate`, `WindowDeactivate`, `FocusIn`, `FocusOut`, any mouse button
and `Wheel` (`QTipLabel::eventFilter`). Notably `KeyPress` is in that list on
macOS only — a Qt tooltip survives typing on Linux and Windows.

GTK's permissiveness bites in practice: Mozilla bug 1569439, "Stuck tooltips
never disappear on Linux when switching to another app".

Two gaps, marked here rather than smoothed over:

- **UNVERIFIED**: macOS behaviour for a non-key window inside an _active_
  application. Apple documents only the inactive-application case.
- **UNVERIFIED**: no canonical GNOME/GTK issue was found for "tooltip shown on
  unfocused window"; the conclusion above rests on the absence of any focus
  check in the source, not on a bug report.

## How long does it stay after the pointer leaves the trigger?

Effectively immediately everywhere. Qt's 300 ms grace period is the longest.

| Stack        | Hide delay on leave                                                                                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GTK          | **0 ms** — `hide_tooltip = (event_type == GDK_LEAVE_NOTIFY)` then a synchronous hide. Also fires on leaving the _tip area_ rect, which WebKitGTK sets to the hovered element's rect |
| Qt widgets   | **300 ms** — `QTipLabel::hideTip()` starts `hideTimer` at 300 ms; only the expire timer and the immediate-kill events bypass it                                                     |
| KDE QML      | immediate — visibility is bound to `parent.hovered` — with a 200 ms fade-out                                                                                                        |
| Win32, macOS | immediate on leaving the tool rect (macOS fades out)                                                                                                                                |

## Show delay, and auto-hide while the pointer stays put

| Stack                                | Show delay                                                                               | Auto-hide while hovering                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| GTK                                  | 500 ms (`HOVER_TIMEOUT`); 60 ms in browse mode, which lasts 500 ms after the last tip    | **none** — the file creates exactly two timers, one to show, one to expire browse mode                |
| Qt widgets                           | 700 ms (`SH_ToolTip_WakeUpDelay`); 20 ms while awake (`SH_ToolTip_FallAsleepDelay`, 2 s) | **10 s** — `10000 + 40 * max(0, len - 100)` ms, and mouse movement does not reset it                  |
| KDE QML (qqc2-desktop-style, Plasma) | 700 ms (`Kirigami.Units.toolTipDelay`)                                                   | **none** — `timeout: -1`, with the source comment "Never time out while being hovered; it's annoying" |
| Win32, WinForms                      | 500 ms (`TTDT_INITIAL`, = double-click time)                                             | **5 s** (`TTDT_AUTOPOP`, = 10× double-click time); indefinite on Windows 11                           |
| WPF                                  | 1000 ms (`InitialShowDelay`)                                                             | **none** since .NET 6 — `ShowDuration` was changed from 5000 to `Int32.MaxValue`                      |
| macOS, Safari                        | ~1000 ms (`NSInitialToolTipDelay`) — UNVERIFIED, undocumented by Apple                   | **none found** — AppKit has no autopop equivalent, and wxWidgets leaves `SetAutoPop` a no-op on Cocoa |
| Firefox                              | 500 ms (`ui.tooltip.delay_ms`)                                                           | **none** — the 5 s `kTooltipAutoHideTime` was removed; a tip now dies on >7 px of pointer movement    |
| Chromium                             | 500 ms (`kDefaultShowTooltipDelay`)                                                      | **10 s** (`kDefaultHideTooltipDelay`)                                                                 |

Two patterns worth keeping in mind:

- **Fixed auto-hide is being abandoned.** WPF dropped it in .NET 6, WinForms on
  Windows 11 no longer applies it, and Firefox removed it outright after bug
  395668 ("TITLE tool-tip popups remain for only 5 seconds, might need more time
  to read"). Only Chromium and Qt still auto-dismiss, both at 10 s.
- **Re-show is much faster than first show.** GTK's browse mode (60 ms for 500
  ms after the last tip), Qt's fall-asleep delay (20 ms for 2 s), Win32's
  `TTDT_RESHOW` (100 ms) and WPF's `BetweenShowDelay` (100 ms) all make scanning
  across a row of controls feel instant while keeping the first tooltip slow.

WebKitGTK renders the HTML `title=` attribute through GTK's own tooltip
machinery — `PageClientImpl::toolTipChanged` → `webkitWebViewBaseSetTooltipText`
→ `gtk_widget_set_has_tooltip` — so native tooltips inside a Tauri webview on
Linux inherit the GTK row verbatim. Safari does the equivalent on macOS, handing
the tooltip to AppKit via `-addToolTipRect:owner:userData:`.

## Where our tooltip sits

`src/components/common/Tooltip.tsx`, for comparison, not as a target:

| Behaviour                 | Ours                                                         | Closest precedent                                                                                                   |
| ------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Show delay                | 120 ms                                                       | faster than every toolkit (500–1000 ms); roughly GTK's permanent browse mode                                        |
| Hide delay on leave       | 100 ms                                                       | between GTK's 0 ms and Qt's 300 ms                                                                                  |
| Shown on unfocused window | never; blur hides, and a fresh hover is needed after refocus | Qt, Win32 and AppKit show none on an inactive window, Qt also kills the tip on `WindowDeactivate`; GTK does neither |
| Auto-hide while hovering  | none                                                         | AppKit (none found), GTK, KDE QML, Firefox and WPF; Chromium and Qt widgets are the dissenters, both at 10 s        |

The focus gate is the whole Linux fix: hovers WebKitGTK reports on an unfocused
window — a stale one, or one the pointer produced while over a window stacked
above ours — never show. It lives in `gateOnWindowFocus` in
`src/utils/windowFocus.ts`, which every tooltip-like popup wraps its show/hide
in: `Tooltip.tsx`, the balance popup in `Navigation.tsx` and the amount tooltip
in `FundsInfo.tsx`. Routes tried before it and dropped: rewriting the live
`GdkEventCrossing` (reverted in e035674, needed `unsafe`), forwarding
`leave-notify-event` as an app event (e56a651), and a 300 ms mousemove timer
hit-testing the last pointer position with `elementFromPoint` (dbac5fd); none
cleared the hover in practice. Tauri's `cursorPosition()` is no guard either:
tao returns (0, 0) on Wayland.

Open questions, deliberately left open:

- **120 ms show delay.** Well below every native default. It predates the blur
  work and was left alone on purpose.
- **No auto-hide while the pointer stays put.** A timer that dismissed a
  motionless hover after 6 s was tried and dropped: no native toolkit we follow
  does that.
- **A focused window with a non-focus-taking window over it.** The pointer can
  sit on that window while ours keeps focus; a tooltip under it stays until the
  next real move or a blur. GTK itself behaves the same.

## Sources

GTK:

- [gtk/gtktooltip.c (gtk-3-24)](https://gitlab.gnome.org/GNOME/gtk/-/raw/gtk-3-24/gtk/gtktooltip.c),
  [gtk/gtktooltip.c (main, GTK4)](https://gitlab.gnome.org/GNOME/gtk/-/raw/main/gtk/gtktooltip.c)
- [gtk/gtksettings.c (gtk-3-24)](https://gitlab.gnome.org/GNOME/gtk/-/raw/gtk-3-24/gtk/gtksettings.c)
  — `gtk-tooltip-timeout` and friends are "Deprecated: 3.10: This setting is
  ignored" and gone in GTK4
- [gtk/gtkmain.c (gtk-3-24)](https://gitlab.gnome.org/GNOME/gtk/-/raw/gtk-3-24/gtk/gtkmain.c)
  — unconditional tooltip event dispatch

Qt and KDE:

- [qtbase src/widgets/kernel/qtooltip.cpp](https://raw.githubusercontent.com/qt/qtbase/dev/src/widgets/kernel/qtooltip.cpp)
- [qtbase src/widgets/kernel/qapplication.cpp](https://raw.githubusercontent.com/qt/qtbase/dev/src/widgets/kernel/qapplication.cpp)
  — the `isActiveWindow()` gate
- [qtbase src/widgets/styles/qcommonstyle.cpp](https://raw.githubusercontent.com/qt/qtbase/dev/src/widgets/styles/qcommonstyle.cpp)
- [QToolTip docs](https://doc.qt.io/qt-6/qtooltip.html),
  [QML ToolTip docs](https://doc.qt.io/qt-6/qml-qtquick-controls-tooltip.html)
- [qqc2-desktop-style ToolTip.qml](https://raw.githubusercontent.com/KDE/qqc2-desktop-style/master/org.kde.desktop/ToolTip.qml),
  [kirigami units.cpp](https://raw.githubusercontent.com/KDE/kirigami/master/src/platform/units.cpp)

Windows:

- [TTM_SETDELAYTIME](https://learn.microsoft.com/en-us/windows/win32/controls/ttm-setdelaytime),
  [Tooltip styles (TTS_ALWAYSTIP)](https://learn.microsoft.com/en-us/windows/win32/controls/tooltip-styles)
- [ToolTip.AutoPopDelay](https://learn.microsoft.com/en-us/dotnet/api/system.windows.forms.tooltip.autopopdelay),
  [ToolTip.ShowAlways](https://learn.microsoft.com/en-us/dotnet/api/system.windows.forms.tooltip.showalways)
- [dotnet/wpf ToolTipService.cs](https://github.com/dotnet/wpf/blob/main/src/Microsoft.DotNet.Wpf/src/PresentationFramework/System/Windows/Controls/ToolTipService.cs),
  [commit 9a89bc7 — ShowDuration 5000 → Int32.MaxValue](https://github.com/dotnet/wpf/commit/9a89bc76b2d13d906c31db46728e2bdd79efa946)

macOS:

- [NSWindow.allowsToolTipsWhenApplicationIsInactive](https://developer.apple.com/documentation/appkit/nswindow/allowstooltipswhenapplicationisinactive)
- [NSView.addToolTip(\_:owner:userData:)](https://developer.apple.com/documentation/appkit/nsview/1483229-addtooltip)

Browser engines:

- [searchfox nsXULTooltipListener.cpp](https://searchfox.org/mozilla-central/source/layout/xul/nsXULTooltipListener.cpp),
  [StaticPrefList.yaml](https://searchfox.org/mozilla-central/source/modules/libpref/init/StaticPrefList.yaml)
- [Bugzilla 395668 — removal of the 5 s auto-hide](https://bugzilla.mozilla.org/show_bug.cgi?id=395668),
  [Bugzilla 1569439 — stuck tooltips on Linux when switching apps](https://bugzilla.mozilla.org/show_bug.cgi?id=1569439)
- [Chromium ui/views/corewm/tooltip_controller.cc](https://source.chromium.org/chromium/chromium/src/+/main:ui/views/corewm/tooltip_controller.cc)
- [WebKit UIProcess/API/gtk/PageClientImpl.cpp](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/API/gtk/PageClientImpl.cpp),
  [UIProcess/mac/WebViewImpl.mm](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/mac/WebViewImpl.mm)
