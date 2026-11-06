# destinationMode — model specification

Authoritative rules for `src/stores/destinationMode.ts`. The store owns which
destination the main screen's card shows — the one Connect targets — and when an
unattended switch happens: only while auto is on. It holds no DOM knowledge and
performs no side effects: every input is one of seven events, every output is
store state.

When this document and the code disagree, the document is right and the code is
a bug. When this document and reality disagree, change the document first, then
a test, then the code.

## Vocabulary

| term          | meaning                                                                           |
| ------------- | --------------------------------------------------------------------------------- |
| **card**      | the main screen's exit: the location card, or the centred exit in the simple view |
| **active**    | the destination the card shows and the one Connect targets                        |
| **candidate** | the destination auto will switch to when its countdown ends                       |
| **selection** | the user's own pick; it holds until they pick again or choose Auto                |
| **live**      | the backend reports a connection: connected, connecting, or reconnecting          |
| **exit data** | slots, load and latency measured on the exit itself, by probe or quick probe      |

## State

```ts
interface AutoPending {
  candidateId: string;
  countdownEndsAt: number; // armedAt + SWITCH_COUNTDOWN_MS
}

type Mode =
  | { mode: "auto"; pending: AutoPending | null }
  | { mode: "selected" } // never expires
  | { mode: "live"; auto: boolean }; // auto was on for this tunnel

interface DestinationMode {
  active: string | null;
  mode: Mode;
  listOpen: boolean;
  confirming: boolean; // Connect waits on the exit cost view
  preferredLocation: string | null; // one shot, spent when it becomes active
  lastConnectedDestination: string | null; // dropped at the first cold start
}
```

`listOpen` and `confirming` live in the store rather than in a component: they
gate whether auto may act, and a gate the store cannot see is a gate the tests
cannot cover.

## Timing

| constant                 | value | owner                                         |
| ------------------------ | ----- | --------------------------------------------- |
| `SWITCH_COUNTDOWN_MS`    | 5000  | model — the card's visible countdown (a ring) |
| `STATUS_POLL_MS`         | ~2300 | service (`src-tauri/src/commands.rs`)         |
| `STATUS_POLL_FAST_MS`    | 500   | service — cap while the list is open          |
| `QUICK_PROBE_FRESH_MS`   | 10000 | probing — a result younger is not redone      |
| `QUICK_PROBE_TIMEOUT_MS` | 35000 | probing — daemon budget is 30 s               |

**Deadlines are truth; timers are an optimisation.** Every deadline is an
absolute timestamp re-checked on each `statusUpdate`. A timer that is throttled,
or a machine that sleeps, changes nothing about the outcome — the next status
response applies whatever the clock says should already have happened. No
behaviour may depend on a timer having fired.

## Derived predicates

```
walk(d)              = d.route_health?.walk ?? null
lastCheck(d)         = quick_probe.type === "checked"  ? quick_probe
                       : quick_probe.type === "checking" ? quick_probe.last
                                                         : null
exitData(d)          = probe?.destination === d.id && probe.load && probe.ping_rtt
                         ? { slots: probe.load.slots, rtt: probe.ping_rtt, checkedAt: probe.checked_at }
                       : lastCheck(d) !== null
                         ? { slots: lastCheck.load.slots, rtt: lastCheck.status_rtt, checkedAt: lastCheck.checked_at }
                         : null

occupiedByUs(d)      = d.id === liveId ? 1 : 0
freeSlots(d)         = exitData(d) === null ? null : slots.available + occupiedByUs(d)

MIN_PATH_VALUE       = 0.9
routable(d)          = d.state.type === "routable"
                       && walk(d)?.type === "paths" && walk(d).best_value >= MIN_PATH_VALUE
hasFreeSlot(d)       = freeSlots(d) === null || freeSlots(d) > 0
isReady(d)           = routable(d) && hasFreeSlot(d)
isReadyForDisplay(d) = d.id === liveId || isReady(d)
isSelectable(d)      = d.state.type === "routable" && hasFreeSlot(d)
weak(d)              = isSelectable(d) && !isReady(d)

oneWayMs(d)          = rtt / 2
score(d)             = 0.5 * (1 - min(oneWayMs(d), 1000) / 1000)
                     + 0.3 * min(freeSlots(d), slots.total) / slots.total
                     + 0.2 * min(walk(d).distinct_first_relays, 4) / 4

sortHead             = sortByRouteQuality(destinations)[0]   // may be unready
effectiveCandidate   = isUnspentAndReady(preferred) ? preferred : sortHead

effectiveActive(now) = pending && now >= pending.countdownEndsAt && !isStale(pending, now)
                         ? pending.candidateId
                         : active
isStale(p, now)      = now - p.countdownEndsAt > STATUS_POLL_MS

suspended            = listOpen || confirming
liveId               = connection.type === "disconnected" ? null : connection.destination
```

**`isReady` is the walk's verdict, tightened by exit data when there is any.**
The daemon walks the HOPR graph for every destination and reports what it found
under `route_health.walk`. A destination is routable only when the state is
`Routable` and the best path it found is worth at least `MIN_PATH_VALUE`. A
`Routable` destination whose best path is weaker is `isSelectable` but not
ready: the list offers it to the user grayed and tagged "Weak route", since the
daemon will connect over any `Routable` route, but connecting over it is the
user's explicit choice, never auto's. Once the exit itself has been measured, a
full exit is neither ready nor selectable: a connect against it can only fail.

**`best_value` is a product, so the gate is a band, not an equality.** The walk
starts a path at 1 and multiplies in each edge's score: the edge's probe
delivery rate times a stepped latency factor (1 up to 75 ms, then 0.7, 0.3 and
0.15 in bands), the ack rate on the first hop, and a flat `edge_penalty` (0.5 by
default) for an edge nothing has probed. Delivery rates are moving averages, so
a real multi-hop path is rarely worth exactly 1 even when every link on it is
healthy, and the first slow link drops it to 0.85 or below.
`MIN_PATH_VALUE = 0.9` therefore admits exactly the paths whose every probed hop
sits in the top latency tier with near-perfect delivery; it is the app's own
product line, since the daemon's `Routable` only says a path of non-zero value
exists.

`Routable` implies `walk.type === "paths"`: the daemon writes both from the same
walk result, so `weak(d)` reduces to "routable, with a free slot, below the
band". The `walk.type === "paths"` re-test in `routable` is defensive.

**`exitData` prefers the probe.** The one long-lived probe session follows the
active destination (see [Probing](#probing)) and refreshes continuously; a quick
probe is a one-shot snapshot. Both carry the same slots, load and round trip, so
the newer, live source wins where it applies — which is only while the probe is
`Ready`: a reopening one still reports the closed session's samples, so the
quick probe takes over until the replacement session has been checked. Slots
come from the daemon's count of clients on the exit, so our own session is
discounted the same way as before; `min(freeSlots, total)` keeps the share in
[0, 1] when we hold the last slot.

**`sortByRouteQuality` ranks measured exits by score, then the unmeasured by
resilience, then the rest by closeness to eligible.**

```
eligible with exit data, ordered by  score desc, label
eligible without exit data,          distinct_first_relays desc, count desc, label
the rest,                            best_value desc (no Paths walk = 0, unknown = -1,
                                     Unrecoverable = -2), label
```

A measured exit always outranks an unmeasured one: a good score is knowledge,
the walk alone is a promise. Opening the list measures the unmeasured ones, so
the promise is short-lived. The score weights latency half, free capacity a
third, and relay diversity a fifth; a 1 s one-way latency or worse scores zero
on latency, and four or more distinct first relays score full on diversity.

**`routeGrade` is the score as shown, never as used.** Every exit, in the list
and on the card, carries four signal bars. A measured ready exit fills them by
band: `score >= 0.75` → 4, `>= 0.5` → 3, `>= 0.25` → 2, else 1, colored green,
green, orange, red. An exit no check has ever measured shows four hollow bars
until its quick probe answers; one being re-checked keeps the bars its last
result earned. A weak route shows a single red bar beside its "Weak route" tag.
Anything else shows no bars. The grade feeds neither the sort nor auto.

**A weak route is surfaced only after a grace.** A good route dips below the
band now and then, and at cold start every route is weak until its edges are
probed, so showing `weak(d)` at once makes the label flicker. The app keeps one
latch over the daemon's answer, for display only:

```
WEAK_GRACE_MS        = 15_000
belowBand(d)         = d.state.type === "routable"
                       && walk(d)?.type === "paths" && walk(d).best_value < MIN_PATH_VALUE
withinBand(d)        = walk(d)?.type === "paths" && walk(d).best_value >= MIN_PATH_VALUE

on each status response at now, per destination d in it:
  belowBand(d)       ->  weakRoutes[d] = { since: weakRoutes[d]?.since ?? now,
                                           surfaced: now - since >= WEAK_GRACE_MS }
  withinBand(d)      ->  delete weakRoutes[d]
  otherwise          ->  weakRoutes[d] unchanged
  destinations absent from the response are dropped
```

Until `surfaced`, a weak route displays as what it would be without the walk's
verdict: it drops its "Weak route" tag and gray, and shows its score bars or the
hollow unmeasured ones. An entry goes away only on an answer within the band,
judged by the walk alone, or when the response no longer carries the
destination; the next weak sighting then starts a fresh grace. A route that went
weak, then worse (no route, unrecoverable, not walked), then weak again keeps
its first `since`. An empty response drops every entry, so a cold start gets a
grace for every route. Surfacing happens on a status response, never on a clock
tick. `isReady`, `isSelectable`, the sort and auto read the raw walk, and the
status log keeps the daemon's verdict.

**`effectiveActive` is the only reader.** Display and connect target are the
same function, so the visible card and what Connect targets cannot disagree. The
commit is defined by the clock crossing `countdownEndsAt`; the store write
merely re-renders it. The `isStale` guard keeps a slept-through pending — one
the next `statusUpdate` will discard — from being reported as active in the
meantime.

## Invariants

Asserted after every transition, and in every test:

1. `pending !== null` ⇒ its candidate is not `active`
2. `mode === "selected"` ⇒ `active !== null`
3. `pending !== null` ⇒ `!suspended`
4. `pending !== null` ⇒ `active !== null`
5. `mode === "live"` ⇒ `active !== null`

Invariant 4 is the one that pins cold start down. A countdown is a switch _away
from_ something, so there is nothing to arm until a destination is active — cold
start promotes first, and auto only ever arms afterwards. Invariant 1 does not
cover this: it compares the candidate against `active`, which passes vacuously
when `active` is null.

After every `statusUpdate`, additionally: a non-null `active` is offered or is
the live destination, and a pending candidate is offered — see
[the baseline](#statusupdate).

## Events

The complete input surface. Nothing else reaches the model.

| event                                             | source                                  |
| ------------------------------------------------- | --------------------------------------- |
| `statusUpdate(status)`                            | one per backend status response         |
| `listOpened`                                      | the card's exit row or "More locations" |
| `listClosed(canceled)` \| `listClosed(picked id)` | the exit-node list                      |
| `autoResumed(status)`                             | the list's Auto row                     |
| `connectIssued(id, auto?)`                        | a connect command being sent            |
| `confirmOpened` \| `confirmClosed`                | the exit cost view, before a connect    |

Disconnect is **not** an event — it arrives as a `statusUpdate` with no
connection.

## statusUpdate

**Precondition.** `status.probe` is the daemon's probe view, or null.
`keys(status.destinations)` and the ids of `status.availableDestinations` are
the same set; `appStore.ts` builds both from one `response.destinations` array.
The model ranks over the former and prunes against the latter, so a divergence
would let it arm a candidate it then immediately prunes. It also means an empty
health map implies an empty destination list — there is nothing to promote
either way.

Applied in this order:

**1. Baseline.** Prune `active` to `availableDestinations`, and disarm a pending
whose candidate is no longer offered — its successor, if any, counts down afresh
rather than inheriting the vanished one's deadline. No exemption for the live
destination: the service always offers what we are connected to.

**2. Live.** `liveId !== null` → `active = liveId`, pending cleared, mode `live`
— even when the prune removed it or the connection was started outside the app,
so invariant 5 holds. Entering live records whether auto was on: `auto` →
`live.auto = true`, `selected` → `false`; already live keeps it. If `listOpen`
and we were not already live, close the list — a connection we did not initiate
should not leave the list covering it. `confirming = false`: a tunnel is what
the cost view was waiting for. A list opened over a live connection stays open,
polls included: the user opened it deliberately, and picking from it issues a
new connect (see `listClosed(picked)`).

**3. Leaving live.** `mode === "live" && liveId === null` → back to what the
tunnel came from, on the destination we were connected to: `auto` when
`live.auto` (or nothing is active), else `selected`. A tunnel the user picked
stays picked; one auto chose hands back to auto, which may then move on. Does
not close the list.

Steps 2 and 3 outrank suspension: the backend's own connection state is never
frozen by an open list.

**4. Suspended.** Write the baseline only; leave the mode alone. If the baseline
nulled `active`, end the suspension (close the list, end `confirming`) and fall
through to cold start — a selection whose target no longer exists cannot be
preserved.

**5. selected.** Hold, regardless of readiness or of anything better: only the
user (a pick, Auto) or a vanished destination ends a selection.

**6. auto.** In order:

- pending and `now >= countdownEndsAt` → stale by more than one poll interval?
  discard the pending and re-derive. Otherwise commit: `active = candidateId`,
  pending null.
- `effectiveCandidate === null` → disarm.
- `active === null` → [cold start](#cold-start).
- `!isReady(effectiveCandidate)` → disarm. Steady-state arming requires an
  eligible candidate.
- `effectiveCandidate === active` → disarm.
- `pending === null` → arm: `countdownEndsAt = now + SWITCH_COUNTDOWN_MS`.
- candidate changed → retarget the pending, **keeping its deadline**. A swap
  must not restart the countdown, or a flapping best destination would never
  commit at all.

The commit is checked first, so a retarget only ever lands before the deadline:
a candidate that changes at the deadline commits the old one, and the new one
gets a countdown of its own.

### Cold start

`active === null`: at launch, or mid-session after a prune or a service restart.
Any armed pending is discarded first — a countdown is a switch away from
something, and there is nothing to switch away from. Then direct promotion, no
countdown:

1. `lastConnectedDestination` if it matches an offered destination — no
   readiness or capacity check, it is simply where the last session left off.
   Then drop the field unconditionally; it is consulted once per app launch and
   never again.
2. otherwise `effectiveCandidate`, so an unspent ready preferred location lands
   immediately with no countdown, and a plain start lands on the best
   destination.

Precedence: `lastConnected > preferred > sortHead`. Promotion is unconditional:
as long as the backend offers anything at all, a status update leaves `active`
set. `active` is null only when there are no destinations, and then there is no
candidate to arm either.

**The promotion is a selection when the user made it.** `selected` if the
promoted id is `lastConnectedDestination`, otherwise `auto`. Where the last
session left off is the user's choice, not auto's proposal, so it holds like any
selection until the user picks again or chooses Auto.

A promotion onto `preferred` or the sort head stays in `auto`: the preferred
location is an [input to the candidate](#the-preferred-location), never a
selection of its own. A startup connect needs no hold of its own: if auto arms
toward something in the meantime, the connect makes us live and clears it.

### The preferred location

One shot, and only an input to which destination is the best candidate — never a
transition of its own. While unspent and `isReady`, it _is_
`effectiveCandidate`, and the ordinary arm/retarget rules then apply unchanged:
no separate hijack, no fresh countdown.

It is spent when it becomes `active`, by any path. If it stops being ready
before that, the shot survives and it may become active later. A user choosing
something else does not spend it. Its value is captured when the store is
created, so a change in Settings applies at the next launch or after a
`reset()`, not mid-session.

## listOpened

Stop the switch timer, drop the pending, `listOpen = true`. A selection is left
as it is.

Dropping the pending honours the clock: past `countdownEndsAt` and not stale,
the switch has already happened — `effectiveActive` reports the candidate — so
it is committed (`active = candidateId`), not discarded. Discarding would snap
the reported active back to the outgoing destination, and whether the switch
happened would depend on whether the switch timer beat the click. Stale, it is
discarded exactly as `statusUpdate` would.

The mode is otherwise untouched, and needs no saved copy: `auto`-with-pending
becomes `auto`-without, which is still `auto`, so the mode is its own memory of
what to resume.

## confirmOpened / confirmClosed

The exit cost view opening on Connect, and closing however it closes: Cancel,
its own Connect, or the card moving away. While it shows, the location is
chosen, so auto holds off exactly as for an open list: `confirmOpened` commits a
due pending (the exit Connect resolved), drops any other, and sets
`confirming = true`; `confirmClosed` clears it, and auto resumes on the next
poll. `connectIssued` clears it too.

## listClosed(canceled)

`listOpen = false`, resume the mode as it stands.

## listClosed(picked id)

`active = id`, whether or not anything was active before.

Mode is `selected`. Disconnected, both a click on the row and the row's Connect
button pick: the exit lands on the card, and Connect — after the exit cost view,
when the user still wants it — goes there. With a tunnel up or on its way, the
row's Switch closes the list with `listClosed(canceled)` instead, so the card
keeps the tunnel until the switch is confirmed; the confirmed connect then
carries `auto = false` (see `connectIssued`). Should a pick still arrive while
live, it is the user's: `live.auto = false`. A pick whose tunnel is already up
or going away only brings it back to the card. Picking the destination that is
already active selects it, taking it from auto.

## autoResumed(status)

`listOpen = false`. A live tunnel is never switched: `live.auto = true`, so auto
resumes once it ends. Connected, the Auto row fires it only when the tunnel is
already on auto's pick; a switch to another exit goes through the cost view and
a connect carrying `auto = true` instead. Otherwise `auto` with no pending, and
`effectiveCandidate` over `status` — the last status `appStore.ts` saw — becomes
`active` at once when it is ready. The user asked for auto's pick, so there is
no countdown to it, and the card reads "Current Best Location" straight away.
With nothing ready, `active` stays; auto arms on a later poll as usual.

## connectIssued(id, auto?)

`active = id`, pending cleared, `confirming = false`, mode `live` optimistically
— we are ahead of the service, and the next status response is expected to
confirm. `live.auto` is `auto` when given: a switch confirmed while connected
says whose pick it is — a listed exit's Switch `false`, the Auto row's `true` —
since nothing about the old tunnel says so. Otherwise it is recorded as in
[step 2](#statusupdate): from `auto` `true`, from `selected` `false`, from
`live` kept. Because live is inert, nothing can arm a countdown during the
attempt. A connect that disagrees with the promotion — connect-on-startup
landing on the first ready destination rather than the unready one we promoted —
simply moves `active`.

A failed connect needs no special handling: the next status response reports no
connection, and _leaving live_ returns to what the attempt came from — the
selection on the destination we tried, or auto.

## Probing

Outside the model. `appStore.ts` owns these side effects; the model only
supplies `effectiveActive` and `listOpen`, and receives what the daemon reports
back through `statusUpdate`.

**The probe follows the active destination.** Whenever `effectiveActive` changes
to a non-null id and the mode is not `live`, issue `probe(id)`. The daemon keeps
exactly one probe session, so this replaces whatever was probed before. While
`live` nothing is issued: the connection registered over the probe the daemon
opened for it, and swapping that session would break the tunnel. The probe is
closed only when the app quits: the tray's quit handler disconnects, then issues
`unprobe`, so the worker may idle once nobody reads the results. While the app
runs the probe keeps the worker awake, which is accepted for now.

**A re-check keeps what it refreshes.** The daemon carries the previous result
in `quick_probe.Checking.last`, so re-measuring an exit never blanks its data;
the unchanged `checked_at` is what says how stale the value is. Only an exit
nothing has measured yet has no exit data.

**The list opening starts quick probes, one at a time.** On `listOpened`, cap
the status poll at `STATUS_POLL_FAST_MS` and start the loop; on `listClosed`,
lift the cap and stop issuing. A quick probe in flight when the list closes
finishes on its own and its result is kept.

The loop is a pure scheduler over `statusUpdate`:

```
candidates(now) = sortByRouteQuality(destinations)
                    .filter(id => id !== activeId)
                    .filter(id => route_health.state is Routable)
                    .filter(id => quick_probe is not Checking)
                    .filter(id => quick_probe is null
                               || now - quick_probe.checked_at >= QUICK_PROBE_FRESH_MS)

inFlight done   = its quick_probe is Checked or Failed with checked_at >= issuedAt
                  || now - issuedAt >= QUICK_PROBE_TIMEOUT_MS
                  || the daemon answered anything but Checking

on each statusUpdate while listOpen:
  if inFlight and not done  -> wait
  else                      -> inFlight = candidates(now)[0] ?? null; issue it
```

The freshness guard is what makes the loop cycle rather than spin: once every
candidate has a result younger than `QUICK_PROBE_FRESH_MS`, `candidates` is
empty until the oldest result ages out, and the next poll picks it up. The
active destination is skipped because the probe already reports on it, and the
daemon would refuse anyway. Deadlines are truth here too: a lost result is
abandoned by the clock, never by a timer.

## Deliberate non-rules

- **A selection never expires.** Only the user ends it (a pick, Auto) or its
  exit disappearing; nothing better, however long it waits, moves it.
- **Auto never switches away from an unready `active`.** It reacts to the
  candidate only, so if the active goes unready and nothing ready is better, we
  stay on it.
- **No hysteresis on arming.** "Better" is bare inequality against the sort
  head, so a head that flaps between two destinations retargets the pending on
  each poll. The commit stays bounded because a retarget keeps the original
  deadline. If this becomes the visible defect, the fix is a debounce on arming
  — not a change to the sort.
- **Auto never proposes an ineligible destination.** A weak route is offered in
  the list, grayed out, tagged and clickable, for the user to pick deliberately;
  it is never a candidate.
- **Live is inert.** It never proposes a better destination, and a live tunnel
  is never torn down automatically — the list is the only way to another
  destination.
- **The model owns no animation.** It publishes state and deadlines; the view
  decides how to show them — the card's ring reads `countdownEndsAt`.
