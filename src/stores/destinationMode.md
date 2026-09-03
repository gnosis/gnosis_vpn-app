# destinationMode — model specification

Authoritative rules for `destinationMode.ts`. The store owns which destination
the carousel shows, which card is "the one Connect will use", and when an
unattended switch happens. It holds no DOM knowledge and performs no side
effects: every input is one of six events, every output is store state.

When this document and the code disagree, the document is right and the code is
a bug. When this document and reality disagree, change the document first, then
a test, then the code.

## Vocabulary

| term          | meaning                                                                  |
| ------------- | ------------------------------------------------------------------------ |
| **entry**     | a card in the carousel, keyed by destination id                          |
| **sequence**  | the entries' left-to-right order; oldest first, unique                   |
| **active**    | the entry the UI centres and the one Connect targets                     |
| **candidate** | a destination auto intends to switch to, mid-countdown                   |
| **live**      | the backend reports a connection: connected, connecting, or reconnecting |

## State

```ts
interface Entry {
  key: number; // render identity; monotonic, never reused
  wasActive: boolean; // set once when the entry becomes active, never unset
}

interface AutoPending {
  candidateId: string;
  countdownEndsAt: number; // armedAt + SWITCH_COUNTDOWN_MS
  settleAt: number; // countdownEndsAt + SWITCH_CROSSOVER_MS
}

type Mode =
  | { mode: "auto"; pending: AutoPending | null }
  | { mode: "selected"; autoRevertAt: number | null } // null while suspended
  | { mode: "live" };

interface DestinationMode {
  entries: Record<string, Entry>;
  sequence: string[];
  active: string | null;
  mode: Mode;
  nextKey: number;
  listOpen: boolean;
  dragging: boolean;
  preferredLocation: string | null; // one shot, spent when it becomes active
  lastConnectedDestination: string | null; // dropped at the first cold start
}
```

`listOpen` and `dragging` live in the store rather than in a component: both
gate whether auto may act, and a gate the store cannot see is a gate the tests
cannot cover.

`wasActive` is the sole justification for an entry outliving its usefulness —
see [the sweep](#the-sweep).

## Timing

| constant                  | value | owner                                     |
| ------------------------- | ----- | ----------------------------------------- |
| `SWITCH_COUNTDOWN_MS`     | 5000  | model — visible countdown before a switch |
| `SWITCH_CROSSOVER_MS`     | 666   | model — countdown end to commit           |
| `SWITCH_ANIMATE_MS`       | 1000  | view — total slide duration               |
| `SELECTED_AUTO_REVERT_MS` | 10000 | model — a selection's lifetime            |
| `STATUS_POLL_MS`          | ~2300 | service (`src-tauri/src/commands.rs`)     |

**Deadlines are truth; timers are an optimisation.** Every deadline is an
absolute timestamp re-checked on each `statusUpdate`. A timer that is throttled,
or a machine that sleeps, changes nothing about the outcome — the next status
response applies whatever the clock says should already have happened. No
behaviour may depend on a timer having fired.

## Derived predicates

```
occupiedByUs(d)      = d.id === liveId ? 1 : 0
freeSlots(d)         = slots === null ? null : slots.available + occupiedByUs(d)
connectedClients(d)  = slots === null ? null : slots.connected - occupiedByUs(d)

isReady(d)           = d.state === "ReadyToConnect" && freeSlots(d) > 0
isReadyForDisplay(d) = d.id === liveId || isReady(d)

sortHead             = sortByCapacityAwareLatency(destinations)[0]   // may be unready
effectiveCandidate   = isUnspentAndReady(preferred) ? preferred : sortHead

effectiveActive(now) = pending && now >= pending.settleAt && !isStale(pending, now)
                         ? pending.candidateId
                         : active
isStale(p, now)      = now - p.settleAt > STATUS_POLL_MS

suspended            = listOpen || dragging
liveId               = connected ?? connecting ?? reconnecting  ->  destination_id
```

**`isReady` requires capacity.** A destination with no free slot cannot be
connected to, so treating it as ready only produces failing connects.
`Connecting` is deliberately not ready either: a connecting destination is the
live one, and the live one is handled by `isReadyForDisplay`.

**`freeSlots` discounts our own session.** While connected we occupy a slot, so
raw `available` under-reports the live destination's capacity — a 1-slot
destination we are connected to would read as full. `connectedClients` applies
the same discount to the sort's capacity malus. Only the numbers
`sortByCapacityAwareLatency` reads change; its ordering rules are untouched.

**`effectiveActive` is the only reader.** `currentDisplayId` and
`resolveConnectTarget` are both this function, so the visible card and the
connect target cannot disagree. The commit is defined by the clock crossing
`settleAt`; the store write merely re-renders it. The `isStale` guard keeps a
slept-through pending — one the next `statusUpdate` will discard — from being
reported as active in the meantime.

## The sweep

> Every entry is either ever-active history, or the current pending candidate.
> Nothing else may exist.

Run at the end of every transition:

```
drop each id where !entries[id].wasActive && id !== pending?.candidateId
sequence = sequence.filter(id => id in entries)
```

This replaces per-path removal bookkeeping. A card minted for a candidate
disappears when that candidate is abandoned, however it was abandoned; a card
that was once active stays as history. No transition needs to remember which of
the two it is dealing with.

## Invariants

Asserted after every transition, and in every test:

1. `sequence` has no duplicates
2. `set(sequence) === set(keys(entries))`
3. `active === null || active in entries`
4. `pending !== null` ⇒ its candidate is in `entries` and is not `active`
5. `mode === "selected"` ⇒ `active !== null`
6. every entry satisfies `wasActive || id === pending?.candidateId`
7. keys are unique and never reused; `nextKey` is strictly monotonic
8. `pending !== null` ⇒ `!suspended`

## Events

The complete input surface. Nothing else reaches the model.

| event                                             | source                                                     |
| ------------------------------------------------- | ---------------------------------------------------------- |
| `statusUpdate(status)`                            | one per backend status response                            |
| `listOpened`                                      | the destination selector button                            |
| `listClosed(canceled)` \| `listClosed(picked id)` | the exit-node list                                         |
| `dragStarted`                                     | first pointer movement on the carousel                     |
| `slideCommitted(id)`                              | the carousel settling on a card, or a tap on a peeking one |
| `connectIssued(id)`                               | a connect command being sent                               |

Disconnect is **not** an event — it arrives as a `statusUpdate` with no
connection.

## statusUpdate

**Precondition.** `keys(status.destinations)` and the ids of
`status.availableDestinations` are the same set; `appStore.ts` builds both from
one `response.destinations` array. The model ranks over the former and prunes
against the latter, so a divergence would let it arm a candidate it then
immediately prunes. It also means an empty health map implies an empty
destination list — there is nothing to promote either way.

Applied in this order:

**1. Baseline.** Prune `entries`, `sequence` and `active` to
`availableDestinations`. No exemption for the live destination: the service
always offers what we are connected to.

**2. Live.** `liveId !== null` → `active = liveId` (`wasActive`), pending
cleared, mode `live`, sweep. The entry is minted if the prune removed it, so
invariant 3 survives even if that guarantee is ever broken. If `listOpen`, close
the list — a connection we did not initiate from the list should not leave the
list covering it.

**3. Leaving live.** `mode === "live" && liveId === null` → `selected` on the
destination we were connected to, with a fresh `SELECTED_AUTO_REVERT_MS`, then
auto. Holding the card keeps auto from sliding you off it seconds after you
disconnected. Does not close the list.

Steps 2 and 3 outrank suspension: the backend's own connection state is never
frozen by an open list or a drag.

**4. Suspended.** Write the baseline only; leave the mode alone. If the baseline
nulled `active`, end the suspension (close the list, end the drag) and fall
through to cold start — a selection whose target no longer exists cannot be
preserved.

**5. selected.** `autoRevertAt !== null && now >= autoRevertAt` → auto.
Otherwise hold, regardless of readiness: only the flat deadline or a vanished
destination ends a selection.

**6. auto.** In order:

- pending and `now >= settleAt` → stale by more than one poll interval? discard
  the pending and re-derive. Otherwise commit: `active = candidateId`
  (`wasActive`), pending null.
- `effectiveCandidate === null` → disarm.
- `active === null` → [cold start](#cold-start).
- `!isReady(effectiveCandidate)` → disarm. Steady-state arming requires ready
  plus capacity.
- `effectiveCandidate === active` → disarm: clear the pending and let the sweep
  drop its card unless it is history.
- `pending === null` → arm: mint the entry if new, append to `sequence`, set
  `countdownEndsAt = now + SWITCH_COUNTDOWN_MS` and
  `settleAt = countdownEndsAt +
  SWITCH_CROSSOVER_MS`.
- candidate changed, `now < countdownEndsAt` → retarget the pending, **keeping
  both deadlines**. A swap must not restart the countdown, or a flapping best
  destination would never commit at all.
- candidate changed, `now >= countdownEndsAt` → **freeze**. Inside the crossover
  the view is already sliding toward a specific card; the in-flight switch wins
  and the new candidate is considered on the next poll.

Arming appends the candidate to `sequence` only when its entry is new. A
candidate that is already history keeps its slot, which means **a candidate is
not necessarily the last card** — readers must not assume it is.

### Cold start

`active === null`: at launch, or mid-session after a prune or a service restart.
Direct promotion, no countdown, entry minted with `wasActive: true`:

1. `lastConnectedDestination` if it matches an offered destination — no
   readiness or capacity check, it is simply where the last session left off.
   Then drop the field unconditionally; it is consulted once per app launch and
   never again.
2. otherwise `effectiveCandidate`, so an unspent ready preferred location lands
   immediately with no startup animation.

Precedence: `lastConnected > preferred > sortHead`.

### The preferred location

One shot, and only an input to which destination is the best candidate — never a
transition of its own. While unspent and `isReady`, it _is_
`effectiveCandidate`, and the ordinary arm/retarget/freeze rules then apply
unchanged: no separate hijack, no fresh countdown.

It is spent when it becomes `active`, by any path. If it stops being ready
before that, the shot survives and it may become active later. A user choosing
something else does not spend it. Its value is captured when the store is
created, so a change in Settings applies at the next launch or after a
`reset()`, not mid-session.

## listOpened

Stop both timers, clear the pending, sweep, `listOpen = true`. In `selected`,
set `autoRevertAt = null`.

The mode is otherwise untouched, and needs no saved copy: `auto`-with-pending
becomes `auto`-without, which is still `auto`, so the mode is its own memory of
what to resume.

## listClosed(canceled)

`listOpen = false`, resume the mode as it stands. A resumed `selected` gets a
fresh `SELECTED_AUTO_REVERT_MS`.

## listClosed(picked id)

Replace at index: put `id` where the outgoing `active` sat, remove any other
occurrence of `id`, drop the outgoing entry, drop entries no longer in
`sequence`, mint a fresh key so the card mounts rather than slides.
`active = id` (`wasActive`).

```
sequence [a, b, c], active b, pick c  ->  sequence [a, c], active c
```

The strip therefore shortens when the pick is already in it. Only automatic
commits grow it.

Mode is `selected` with a fresh deadline — **except when the pick also
connects.** While connected, the list fires `pickDestination` → `connect` →
`onClose`, so `connectIssued` has already entered `live` by the time this event
arrives; the sequence edit applies and the mode write is skipped. Picking the
destination that is already active is equivalent to cancelling, plus a fresh
deadline.

A pick with no `active` yet mints the entry, appends it, and becomes active.

## dragStarted

`selected` with `autoRevertAt = null`, `dragging = true`; clear the pending,
stop the timers, sweep. Touching the strip is a selection from its first
movement, and the deadline does not run while the finger is down.

## slideCommitted(id)

`active = id` (`wasActive`), `dragging = false`, `selected` with a fresh
deadline. An automatic commit is the different case: it stays in `auto`.

While `live`, this also issues a connect to `id` — see `connectIssued`.

An id absent from `entries` cannot normally arrive: a prune removes the card
from `sequence`, the view re-renders, and the scroller can only settle on a
survivor. The model guards anyway so a store-write race cannot violate invariant
3 — end the drag, leave `active` untouched, resume with a fresh deadline.

**The view must guarantee that every `dragStarted` is followed by a
`slideCommitted`.** Otherwise the model holds a suspended `selected` forever.

## connectIssued(id)

`active = id` (`wasActive`), pending cleared, mode `live` optimistically — we
are ahead of the service, and the next status response is expected to confirm.
Because live is inert, nothing can arm a countdown during the attempt.

A failed connect needs no special handling: the next status response reports no
connection, and _leaving live_ parks us in `selected` on the destination we
tried.

## Deliberate non-rules

- **Auto never switches away from an unready `active`.** It reacts to the
  candidate only, so if the active goes unready and nothing ready is better, we
  stay on it.
- **No hysteresis on arming.** "Better" is bare inequality against the sort
  head, so a head that flaps between two destinations mints and fades a
  candidate card on each poll. The commit stays bounded because a retarget keeps
  the original deadline. If this becomes the visible defect, the fix is a
  debounce on arming — not a change to the sort.
- **Live is inert.** It never proposes a better destination; a live tunnel is
  never torn down automatically.
- **The model owns no animation.** It publishes state and deadlines; the view
  decides how to move. In particular the view may not assume a pending candidate
  is the last card.
