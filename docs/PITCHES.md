# CivicPulse — Pitch Materials

## 30-second elevator pitch

Cities run on complaints nobody tracks. CivicPulse turns reporting into a social feed:
snap a photo, drop your location, done. The community upvotes what matters, and instead of
fifty lonely reports about the same pothole, near-identical submissions merge into one
issue — so its real popularity shows. A transparent priority score — severity, upvotes,
safety, location, minus age — decides what the city fixes first, and citizens watch every
issue move from reported to confirmed-fixed. Reporting is as easy as posting. Priority is
crowd-verified, not a black box.

## 1-minute pitch

The problem: civic issues go unreported because filing a complaint is bureaucratic, and
even when they are reported, nothing surfaces the ones affecting the most people.

CivicPulse makes reporting feel like posting. You see a pothole — you're in the app for
thirty seconds: photo, location, one line. AI suggests what it is and how bad, but you
always confirm. If four neighbors already reported the same pothole, we don't give you a
fifth lonely card — we say “add your upvote instead” and merge you in, so that issue now
honestly shows 5 people and climbs the priority ladder to CRITICAL. Upvotes are one per
person, enforced server-side, so the numbers mean something.

On the other side, the city gets a command center: a density map, a priority-ranked queue,
auto-routed departments, and analytics phrased as decisions — “road reports are up 28%
this month.” When they fix something, they post an after-photo and the people who reported
it confirm it's actually fixed. No fake resolutions.

The demo runs end-to-end: report → merge → trend → verify → fix → confirm.

## 3-minute demo script

**Setup** — seeded neighborhood: Riverside & Westbrook. Two demo accounts (Aisha, citizen;
Tom, authority) available from one-tap buttons on the auth screen. Password `demo1234`.

**Act 1 — The feed is the product.**
Open the home feed. It looks like a social app, not a government portal. The top card is
“Deep pothole on Oak St” — trending 🔥, verified, CRITICAL priority, 52 upvotes. Two details
to call out: the badge *“4 other people reported this too”* — this is duplicate merging at
work, so those upvotes are concentrated, not splintered — and the upvote button itself.
Tap it: bounce animation, count ticks up, and the priority score ticks with it. One vote
per person, guaranteed server-side.

**Act 2 — Reporting is as easy as posting.**
Tap the floating **+**. Choose a photo (or “retake” to capture live). For location, use
“my current location” or pick Oak St from the nearby spots. Type one line:
“Deep pothole near the school, cars are swerving.” Submit.

The AI pass runs — note it's presented as a suggestion: *Pothole · Infrastructure ·
~88% confidence · high severity*, with a plain-language explanation. There's a
“correct it” path to prove the AI is never authoritative. But here's the magic: the
duplicate pass found our pothole. CivicPulse asks: *“This looks like an existing report —
add your upvote instead?”* We merge. The issue now shows 6 reporters and its priority
climbs. The story is real: no duplicate cards, real crowd signal.

**Act 3 — The city responds.**
Sign out, sign in as Tom (authority). The command center shows totals, a red-flaring
density map at Riverside, and the queue. Verify Aisha's fresh report, assign it to Roads
(it auto-routes by category; you can override), mark it In Progress, then **Resolve** with
a note and an after-photo.

**Act 4 — Trust, end to end.**
Back as Aisha: a notification — “your issue was marked resolved. Confirm the fix so it
shows as done.” Open it: the after photo, the full timeline (reported → AI analyzed →
verified → assigned → in progress → resolved), and a **“Is it actually fixed?”** prompt —
only reporters can confirm, which is what stops fake resolutions. Tap *Yes, it's fixed*:
the issue turns Confirmed, the dashboard's resolved count ticks up, and the neighborhood
just got a little more honest.

**Close** — What you saw: report → merge → priority → verify → fix → confirm, one loop,
both sides of the table, no black boxes anywhere.
