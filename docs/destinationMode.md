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
  resumeLastSession: boolean; // the first cold start resumes status.recent[0]
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
percentOfBest(d)     = d.route_health?.percent_of_best ?? null   // 0–100
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

hasFreeSlot(d)       = freeSlots(d) === null || freeSlots(d) > 0
isSelectable(d)      = d.state.type === "routable" && hasFreeSlot(d)
isReady(d)           = isSelectable(d) && percentOfBest(d) !== null
isReadyForDisplay(d) = d.id === liveId || isReady(d)

grade(d)             = !isSelectable(d)    ? none
                       : percentOfBest(d) === null ? unmeasured
                       : bars(percentOfBest(d))      // >= 90: 4, >= 60: 3, >= 25: 2, else 1
gradeRank(d)         = graded: 4 - bars, unmeasured: 4, none: 5   // lower is better

sortHead             = sortByGrade(destinations)[0]   // may be unready
effectiveCandidate   = isUnspentAndReady(preferred) ? preferred : sortHead

effectiveActive(now) = pending && now >= pending.countdownEndsAt && !isStale(pending, now)
                         ? pending.candidateId
                         : active
isStale(p, now)      = now - p.countdownEndsAt > STATUS_POLL_MS

suspended            = listOpen || confirming
liveId               = connection.type === "disconnected" ? null : connection.destination
```

**The daemon compares, the app draws.** The daemon walks the HOPR graph for
every destination and reports `route_health.percent_of_best`: the exit's path
value as a share of the best exit's right now, 0–100. The app holds no path
values. A `Routable` destination with a free slot is `isSelectable`; once the
daemon has a percent for it, it is also ready. Once the exit itself has been
measured, a full exit is neither: a connect against it can only fail.

**The percent is relative, from the best exit's path value.** Per exit the
daemon takes the weaker of its forward and return legs' best path values, then
that value's share of the best exit's, so the top exit is always 100 however
weak the network. A path's value is a product over its edges, so a change on a
link every exit shares scales all exits alike and moves no percent
(`gnosis_vpn-lib/src/route_health.rs`, `percents_of_best`).

**The app owns the bar cuts.** `>= 90` → 4 bars, `>= 60` → 3, `>= 25` → 2, else

1. They sit just above the planner's latency factors (0.7, 0.3, 0.15): one more
   slow hop on an exit's path drops it one bar.

`route_health.walked_at` is null until the first walk, which is what tells
"Checking…" apart from "No route".

**`exitData` prefers the probe.** The one long-lived probe session follows the
active destination (see [Probing](#probing)) and refreshes continuously; a quick
probe is a one-shot snapshot. Both carry the same slots, load and round trip, so
the newer, live source wins where it applies — which is only while the probe is
`Ready`: a reopening one still reports the closed session's samples, so the
quick probe takes over until the replacement session has been checked. Slots
come from the daemon's count of clients on the exit, so our own session is
discounted the same way as before: holding the last slot does not make our own
exit full.

**`sortByGrade` is the one order.** The Quality tab, auto's sort head, the
startup pick and the quick-probe order all use it:

```
gradeRank asc, then A–Z by the name the list shows, then by full label
```

**`grade` is shown as bars only.** Every exit, in the list and on the card,
carries four signal bars: filled by grade, colored green, green, orange, red. No
word sits next to them, since a word like "Excellent" would claim an absolute
quality the percent does not measure; the tooltip says e.g. "Route 3 of 4, 72%
of the best exit right now". A selectable exit without a percent shows four
hollow bars and "Not measured yet". Anything else shows no bars, and the card
says why instead (No route, Full, Checking…, the unrecoverable reason).

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
- `effectiveCandidate` is the sort head and `gradeRank` is not strictly better
  than `active`'s → disarm. The sort breaks ties by name, and a name is never a
  reason to switch. An unspent ready preferred location skips this check.
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

1. `status.recent[0]`, the service's most recent exit, if it is offered — no
   readiness or capacity check, it is simply where the last session left off.
   Then clear `resumeLastSession` unconditionally; it is consulted once per app
   launch and never again.
2. otherwise `effectiveCandidate`, so an unspent ready preferred location lands
   immediately with no countdown, and a plain start lands on the best
   destination.

Precedence: `mostRecent > preferred > sortHead`. Promotion is unconditional: as
long as the backend offers anything at all, a status update leaves `active` set.
`active` is null only when there are no destinations, and then there is no
candidate to arm either. The view hides the card behind its no-exits notice
while nothing is live and no destination `isSelectable`; `active` survives
underneath, so a selection outlives a route outage.

**The promotion is a selection when the user made it.** `selected` if the
promoted id is `status.recent[0]`, otherwise `auto`. Where the last session left
off is the user's choice, not auto's proposal, so it holds like any selection
until the user picks again or chooses Auto.

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
candidates(now) = sortByGrade(destinations)
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
- **No hysteresis on arming beyond the grade.** "Better" is a strictly better
  grade than `active`'s, so a head that flaps between two better destinations
  retargets the pending on each poll. The commit stays bounded because a
  retarget keeps the original deadline. If this becomes the visible defect, the
  fix is a debounce on arming — not a change to the sort.
- **Auto never proposes an ungraded destination.** A selectable exit the daemon
  has not graded yet is offered in the list for the user to pick deliberately;
  it is never a candidate.
- **Live is inert.** It never proposes a better destination, and a live tunnel
  is never torn down automatically — the list is the only way to another
  destination.
- **The model owns no animation.** It publishes state and deadlines; the view
  decides how to show them — the card's ring reads `countdownEndsAt`.
