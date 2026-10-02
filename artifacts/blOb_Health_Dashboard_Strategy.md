# Fitness dashboard — build strategy

This is a plan to approve before any screen is built. No app code ships from this document.

The pictures to match are in the repo:

- `artifacts/blOb_Productivity_Dashboard_Mobile.jpg`
- `artifacts/blOb_Productivity_Dashboard_Desktop.jpg`

The numbers on those pictures (8,642 steps, 82% rings, 7h 48m sleep, $12, Day 10) are a layout sample. The shipped screen uses the signed-in person’s own saved data. A card with nothing real behind it is left off the screen. Bob stays on a clear background. Colors come from `lib/theme.ts`. No stock icons.

## What changes for Daniel

Today, a signed-in person who opens the app lands on **Home**, the social feed. The bottom bar is Home, Lobby, +, Friends, and You. You opens the profile.

After this is approved and built, a killed app with a session open lands on the **Fitness dashboard**. Coming back from the background returns to the screen that was already open. Home stays the feed. Login stays the black screen with Google and email.

## 1. Screens, in order

### Logged out (unchanged)

Phone and desktop show the black sign-in screen. The person taps **Google** or types email. Nothing on that screen becomes a dashboard.

### Phone, signed in

The picture is the phone frame titled **You**. A killed app with a session lands on this dashboard. Coming back from the background restores the screen that was open. A link from a notification or a shared challenge still opens that challenge.

The bottom bar stays Home, Lobby, +, Friends, You. You is the selected tab.

**Top to bottom, as the picture draws it**

1. Title **You**. On the right: the coin count, the dollar balance, a globe, and a gear. Those two money figures are the in-app wallet. The gear opens Settings. There is no cash-out control.
2. Profile first: photo, name, `@handle · Edit profile`, then friends, live challenges, and streak. Tapping **Edit profile** opens the editor that already exists. The photo never becomes a public-only page by sitting here.
3. Chips: **Fitness** (selected), **Challenges**, **Sleep**, **Nutrition**, **All**. Nutrition is a label only. It does not open a card.
4. One Home line, only when a post is newer than the last Home visit. The pictures do not draw this line. It sits under the chips: who posted, a tap that opens Home, and **Dismiss**. One line. No count on the Home icon.
5. **Today · Apple Health** ring card: Move, Exercise, Stand, and a **HealthKit** chip. This card is drawn only in Phase 2, and only when Apple returned those three numbers. It is not drawn as zeros.
6. **Steps** (Phase 2, when a step count exists) beside **Lift volume** (Phase 1, when Lift sessions exist in the range).
7. **Sleep** (Phase 4, when a night was returned) beside **Earned**. The earned line is drawn only when a wallet ledger row for that range already exists. No ledger row means no earned line. The figure is the in-app wallet only.
8. **Active minutes** for the week, as a bar for each day that has minutes. Days with no minutes are not fake bars.
9. **30-Day Consistency**: day count and misses already stored. Official Weekly, Official Monthly, and Run 128 use the same kind of bar when the person is in them. The phone picture shows 30-Day. The desktop picture also shows Run 128.
10. **Trophies** only when that badge already exists. No badge means this row is absent. The screen does not invent a trophy.

The phone picture does not put Today / Week / Month / Year in the header. The chart itself is labeled with the range (**Active minutes · Week**). Week is the range that opens. A later tap can change that label to Today, Month, or Year without leaving You.

**What a tap does**

- **Home** opens the feed and counts as a Home visit.
- The Home line opens the feed. **Dismiss** hides it until a newer post exists.
- **Fitness** is the body above. **Challenges** shows the live-challenge bars. **Sleep** shows the sleep card only after Phase 4 has a real night. **All** shows every card that has data.
- **Edit profile** opens the profile editor. **View public**, a friend row, and a public profile link open that person’s public profile. They do not open this dashboard.
- The gear opens Settings.
- The coin and dollar figures open the wallet that already exists. They do not cash out.

### Desktop, signed in

The wide picture is the same **You** page with a left rail. That rail is for a wide window only. blob.mobi at phone width keeps the phone shell and the bottom bar. It does not grow a side rail.

**Left rail**

- blOb mark at the top.
- **Move:** Home, Lobby, **Dashboard** (selected, mint).
- Friends, You.
- **Money:** Wallet, Earnings. Wallet opens the existing wallet. Earnings is this page’s earned figure, not a cash-out page.
- Bottom of the rail: photo, name, **You · Edit profile**.

**Page**

- Title **You**, and the line under it: profile stays first; the dashboard is the effort under it.
- Top right: **Today**, **Week** (selected in the picture), **Month**, **Year**, then the coin count and the dollar balance.
- Profile row, then **Edit profile**, **View public**, **Settings**.
- Chips: **Fitness** (selected), **Challenges**, **Sleep**, **Nutrition · soon**, **Practice**, **All**. Nutrition and Practice are labels. They are not cards.
- Small filters: **HealthKit**, **Health Connect**, **Lift**, **Check-ins**. A tap shows only rows from that source. No filter selected means all sources that have data. An iPhone chip says **HealthKit**. An Android chip says **Health Connect**. Android is never labeled HealthKit.
- Cards in the picture, left to right: activity rings, steps, weight moved, this week earned. Then active minutes for 7 days, sleep for the last 7 nights, and live challenges (30-Day and Run 128).
- **Recent lift + workouts** table: Session, When, Proof, Source. A paired row reads like the picture’s first line, **Lift + Health**, with one clock and one set of minutes. Proof is the selfie, the watch, or the pounds moved — whichever was actually saved.
- **Trophies this season**, only when that badge already exists. The earned card is only when a ledger row already exists. Neither is invented.
- The footnote in the picture: photo and public profile never leave this tab.

Rings, steps, and sleep on this page follow the same rule as the phone: the card is in the picture so we know where it sits, and it is omitted until the number is real. Web never reads HealthKit, so those three cards are absent on blob.mobi and the page says **Health syncs on the phone.**

**What stays private on both**

Gender, height, weight, BMI, body fat, date of birth, phone, and address stay on the private body-metrics screen. They are not on either picture, and they do not get added. The public profile does not gain them.

## 2. Data

### Already in blOb

| What the person did | Where it lives | What the dashboard can show in Phase 1 |
|---|---|---|
| A finished Lift | The saved Lift session: exercises, sets, weight, reps, finish time | Session list, max weight, volume (weight × reps on work sets). Warm-up sets stay out of volume, as they do on the Lift recap today. |
| Cardio inside a Lift | The cardio row on that session: method, duration, intensity 1–10 | Duration, and intensity when it was logged. Distance only when that row stored a distance. |
| A check-in | `proof_parts.health` on the check-in, and `checkin_stats` on the post | Duration, heart rate, calories, distance, and the day the workout ended, when those fields were saved. Source **Check-in**. A screenshot read (OCR) stays **Check-in**, not HealthKit. |
| Official Weekly / Monthly | The check-in for that Chicago calendar day | Days already counted in the live window. Weekly is 7 days. The month is that month’s length. |
| 30-Day and Run 128 | That challenge’s own check-ins | Progress already stored. The private day lookup is not rewritten. |
| Wallet | The in-app balance already on You | The same balance. No new money path. |
| Trophies | A badge row that already exists | That badge, or the block is absent. No invented trophy. |
| Earned | A wallet ledger row that already exists | That amount, in-app only. No ledger row means no earned line. |

A check-in stores the Health snapshot on the check-in itself (`proof_parts.health`): source `healthkit`, `health_connect`, `ocr`, or `manual`, plus start, end, duration, heart rate, energy, and distance when the attach had them. The post’s `checkin_stats` is the public chip line (duration, calories, heart rate, distance). It is not a second workout.

### Read from the phone (Phase 2 and later)

Today the iPhone asks Health only for workouts, heart rate, active energy, walking/running distance, cycling distance, swimming distance, and workout route. Android asks Health Connect for workouts in a time window, plus heart rate and distance when the attach needs them.

The dashboard does not invent a category the phone did not return.

| Category | Show it when | Source chip |
|---|---|---|
| Workout: type, start, end, duration, distance, active energy, average and max heart rate | The workout record includes that field | HealthKit or Health Connect |
| Steps | A step count came back | HealthKit or Health Connect |
| Distance | A distance sample came back and it is not already the miles on a paired workout row | HealthKit or Health Connect |
| Heart-rate samples | Samples came back | HealthKit or Health Connect |
| Stand, move, exercise | That platform returned the number | HealthKit on iPhone. Health Connect on Android only if that record type is actually returned. |
| Sleep | A sleep record came back | Same rule |

Missing permission is a button labeled **Allow Health**, plus on iPhone the line **Settings → Apps → Health → Data Access & Devices → blOb**. The system sheet opens from the dashboard screen, not from a sheet that covers it. That ask does not clear or skip the same ask on check-in. After a reinstall, both screens still show **Allow Health** and that settings path. Android uses Health Connect. It does not list Samsung Health or Fitbit. Web shows no Allow Health button.

Steps, sleep, and stand are not in today’s permission list. The first build that asks for them is a new TestFlight, because the phone binary is what Apple and Google show the permission on.

### One row when two sources cover one workout

Compare clocks. A Health workout has a start and an end. A Lift session has the time it was performed and the time it was completed. A check-in Health snapshot has `startedAt` and `endedAt`.

If those windows overlap, the dashboard shows **one row** and both chips. On iPhone the health chip says **HealthKit**. On Android it says **Health Connect**.

Counting rules, so nothing is added twice:

- **Weight and reps** come from the Lift sets. Health does not have the set list. They are not added again from the watch.
- **Minutes** are the length of that one window. If both sources have a duration, show one duration, not the sum.
- **Miles** are shown once. If both sources have a distance, keep one figure and name both sources. Do not add them.

A check-in that only has a photo and no health snapshot is not paired to a watch workout. It stays a check-in.

### Which day it counts on

Never UTC.

- Official Weekly and Official Monthly use the **America/Chicago** calendar date, which is already how a day is counted.
- Any other challenge uses that challenge’s own timezone.
- A workout with no challenge uses the phone’s timezone.
- The day on the row is the calendar date of **endedAt** in that timezone. If `endedAt` is missing, the date is blank. The screen does not guess.

## 3. Phases

Each phase is shippable on its own. Later phases do not turn earlier screens into placeholders.

### Phase 1 — Landing dashboard, blOb data only

Build the signed-in landing screen, the Home prompt, the range control, Lift and cardio and check-ins, and live challenge progress. Trophies and the earned line appear only when that badge or ledger row already exists.

No Health read in this phase. No new permission.

**blob.mobi:** yes, after the production deploy of `blob-beta-three`.

**TestFlight:** yes. The installed app does not pick up JavaScript by itself. The phone needs the next TestFlight before cold start opens this screen.

### Phase 2 — Health on the phone

Ask for Health the way check-in already does: **Allow Health** on the screen, then the iPhone settings path if access is missing. Asking here does not clear or skip the ask on check-in. Read the categories already permitted (workouts, heart rate, active energy, distance). Show those numbers with a source chip, paired to Lift and check-ins by the overlap rule. iPhone says **HealthKit**. Android says **Health Connect**.

Steps, stand, move, and exercise appear only when a new permission is in the binary and the platform returns a number. Until then those rows are absent, not zero.

**blob.mobi:** the sentence **Health syncs on the phone.** No rings.

**TestFlight:** yes. Required for any Health number, and required again if the build is the first one that asks for steps or stand.

### Phase 3 — Strength charts

For each exercise in the Lift catalog that this person has logged: a chart of max weight, and a chart of total volume (weight × reps on work sets), for the same Week / Month / Year range as the dashboard. Tap the exercise in the recent list and open that chart.

Cardio on that screen is duration, distance when it exists, and intensity. It is not a weight chart.

A chart with a single point shows that point and the date. It does not draw a fake trend.

**blob.mobi:** yes. The numbers are already in Lift sessions.

**TestFlight:** yes, for the phone. No new Health permission.

### Phase 4 — Sleep and whatever the platform actually returns

Sleep, and any of stand / move / exercise not shipped in Phase 2, only after a real sample comes back. Still no invented night of sleep.

**blob.mobi:** still the one sentence. No sleep ring.

**TestFlight:** yes, because this asks Health for types the app does not ask for today.

## Guards

1. **Cold start vs resume.** A killed app with a session opens the dashboard. Coming back from the background restores the screen that was open: a Lift session, Live, a composer draft, check-in. Do not dump that person onto the dashboard.
2. **Someone else’s profile is not this dashboard.** Friends, a public link, and View public stay the public profile. Rings, steps, sleep, Lift volume, earnings, and the Home prompt are owner-only.
3. **Health Connect is not labeled HealthKit.** iPhone chips say HealthKit. Android chips say Health Connect. The filter includes both.
4. **blob.mobi stays in the phone-width shell.** The desktop rail is a wide-screen layout only. A phone browser must not grow a side rail or lose the bottom bar.
5. **These paths stay as they are.** + Check In still opens the challenge picker, then that challenge’s submit camera. It must not open the dashboard or Wave. A notification or shared challenge still opens that challenge. The wallet still closes back to the screen that opened it. Last-open challenge must not become the default route because the dashboard opened.
6. **Allow Health on the dashboard uses the same ask as check-in:** the system sheet from the screen, not from a sheet that covers it. Asking on the dashboard must not clear or skip the ask on check-in. After a reinstall, both screens still show Allow Health plus Settings → Apps → Health → Data Access & Devices → blOb.

Trophies and the earned line render only when that badge or ledger row already exists. Do not invent either.

## 4. What this must not break

- The check-in camera, including the web camera and gallery path.
- Official day lock: one Chicago day, one check-in, and a past day stays on that day.
- One Home card when the same morning is stamped on Official Weekly and Official Monthly.
- Settlement, entry fees, and prizes. This screen does not pay anyone.
- Body-metric privacy. The public profile does not gain gender, height, weight, BMI, body fat, date of birth, phone, or address.
- The Health permission fix: the system Health sheet is asked from the screen, not from a sheet that covers it. The dashboard ask and the check-in ask both stay.
- + Check In: challenge picker, then that challenge’s submit camera. Not the dashboard. Not Wave.
- A notification or a shared challenge opens that challenge.
- The wallet closes back to the screen that opened it.
- Coming back from the background restores the open screen. Last-open challenge does not become the default route.
- The Fitness recap card: it stays an extra slide after the selfies. This dashboard does not replace that JPEG.

## 5. Risks

**Health permission after a reinstall.** A reinstall can drop blOb from Health → Data Access & Devices. The dashboard and check-in both show **Allow Health** and **Settings → Apps → Health → Data Access & Devices → blOb**, not “no workouts,” until access is real. Asking on one screen does not skip the other.

**Duplicate miles.** A watch workout and a Lift or check-in that overlap must be one row. Adding both distances is a bug. The overlap rule in section 2 is the check.

**A chart with one point.** Phase 3 still opens the chart. One point, labeled with its day. No line that pretends there is a history.

**Web users who expect rings.** The desktop picture shows activity rings, steps, and sleep. blob.mobi at phone width keeps the bottom bar and does not grow a side rail. It does not draw those three cards. It shows Lift, check-ins, and challenges when those rows exist, and says Health syncs on the phone. An empty ring is a miss. Trophies and the earned line appear only when that badge or ledger row already exists.

## Approval

These six guards are part of the plan. Phase 1 is the only work that may start.
