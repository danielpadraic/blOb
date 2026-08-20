import { asCopyTone, interpolateCopy, type CopyTone } from '@/lib/copy';

export const BOB_ENCOURAGEMENT_TONES = ['gentle', 'neutral', 'honest'] as const;
export type BobEncouragementTone = (typeof BOB_ENCOURAGEMENT_TONES)[number];

export const BOB_ENCOURAGEMENT_CATEGORIES = [
  'checkin_streak_5plus',
  'checkin_streak_2',
  'login_after_gap',
  'streak_broke',
  'gone_3',
  'gone_7',
  'gone_14',
  'miss_still_in',
  'miss_removed',
  'final_week',
  'podium_d3',
] as const;

export type BobEncouragementCategory = (typeof BOB_ENCOURAGEMENT_CATEGORIES)[number];

export const BOB_LINE_MAX = 140;

type ToneLines = Record<BobEncouragementTone, readonly string[]>;

/** 10 lines per tone. Tokens: {n}, {challenge}. Never “log” as the action. */
export const BOB_ENCOURAGEMENTS: Record<BobEncouragementCategory, ToneLines> = {
  checkin_streak_5plus: {
    gentle: [
      '{n} days checked in on {challenge}. That is a real run. I am proud of the showing up.',
      'Five-plus on {challenge}. Keep the thread. Check in when the window is open.',
      '{n} in a row. Quiet work. The board noticed. So did I.',
      'You kept {challenge} alive {n} days. That is the habit talking.',
      '{n} check-ins stacked. Nobody did this for you. Come back tomorrow.',
      'A streak of {n}. Soft shoulders. Still moving. That is enough.',
      '{challenge}: {n} days. The couch did not win. Check in again when it is time.',
      '{n} days of proof. I will not make a speech. Just keep going.',
      'You showed up {n} times. {challenge} still needs the next one.',
      '{n} days. Not luck. Check-ins. I like this version of you.',
    ],
    neutral: [
      '{n} days checked in on {challenge}. The streak is real. Keep it.',
      '{n} in a row. Check in on the next open window.',
      '{challenge}: {n} consecutive check-ins. Do the next one.',
      'Streak {n}. Proof is on the board. Come back.',
      '{n} days. No trophy for this. Just the next check-in.',
      'You have checked in {n} days on {challenge}. Continue.',
      '{n} check-ins stacked. Miss one and it resets. You know that.',
      '{challenge} streak: {n}. Check in again.',
      '{n} days of showing up. That is the whole sport.',
      'Five-plus. {n} on {challenge}. Keep the chain.',
    ],
    honest: [
      '{n} days. That is not a vibe. That is work on {challenge}. Do not blow it.',
      '{n} in a row. Impressive until you skip. Check in next window.',
      'Streak {n}. The board does not care how you feel. Check in.',
      '{challenge}: {n} days. You earned this. You can also lose it tomorrow.',
      '{n} check-ins. Nobody is clapping in the street. Do the next one anyway.',
      'Five-plus. Cute. The miss still counts. Check in.',
      '{n} days on {challenge}. Do not get sentimental. Get the next proof in.',
      'You showed up {n} times. That is the floor now. Stay on it.',
      '{n} in a row. I have seen people drop on day {n}. Do not.',
      'Streak {n}. Effort is weather. Check in when it is time. Not later.',
    ],
  },
  checkin_streak_2: {
    gentle: [
      'Two days on {challenge}. A start. Check in again when the window opens.',
      'Day two. That is how a run begins. I am with you.',
      'Checked in twice. Small and real. Keep the thread.',
      'Two in a row. Nobody else has to see it. I did.',
      '{challenge}: two days. Gentle. Still a streak. Come back.',
      'Second check-in. The first one was not a fluke if you return.',
      'Two days. Soft. Honest. Check in tomorrow’s window.',
      'You came back. That is the whole trick. Two on {challenge}.',
      'Day 2. I will not oversell it. I will ask you to keep going.',
      'Two check-ins stacked. That is a beginning. I like beginnings.',
    ],
    neutral: [
      'Two days checked in on {challenge}. Do it again.',
      'Streak: 2. Check in on the next window.',
      'Second check-in is on the board. Keep going.',
      '{challenge}: two in a row. Continue.',
      'Two days. A streak starts here. Check in again.',
      'You checked in twice. The third one is the test.',
      'Day two on {challenge}. Come back for day three.',
      'Two check-ins. That is data. Add another.',
      'Second day. No speech. Next window, check in.',
      'Two in a row. Keep {challenge} moving.',
    ],
    honest: [
      'Two days. That is not a personality. Check in again on {challenge}.',
      'Day two. Cute. Day three is where people flake. Don’t.',
      'Two check-ins. Proof, not a mood. Do the next one.',
      '{challenge}: two in a row. Nobody is impressed yet. Continue.',
      'Second day. The first was luck until you repeat it.',
      'Two days. I have seen this die on day three. Check in.',
      'Streak 2. Thin ice. Show up anyway.',
      'You came back once. That is the minimum. Check in again.',
      'Two. Not five. Not done. Next window, check in.',
      'Day two on {challenge}. Effort is the door. Open it again.',
    ],
  },
  login_after_gap: {
    gentle: [
      'You were gone a bit. I kept the light on. Come in.',
      'Welcome back. The work did not leave. Neither did I.',
      'A gap. Then you. That still counts as returning.',
      'Hey. No lecture. Check in if a window is open.',
      'You opened the app. That is a start. I am glad you did.',
      'Missed a day or two. The board waited. So did I.',
      'Back. Soft landing. Pick a challenge and check in if you can.',
      'The gap happened. You still walked in. Good.',
      'I did not unfriend you. Open a challenge. See what is due.',
      'Returned. No shame in the gap. Shame in never coming back, and you did.',
    ],
    neutral: [
      'You were out. You are in. Check what is due.',
      'Gap closed. Open a live challenge and check in if the window is open.',
      'Welcome back. The board did not pause for you.',
      'You opened blOb. See if a check-in is waiting.',
      'A couple days away. You are here. Continue.',
      'Back. Look at your challenges. Check in if you can.',
      'The gap is over. Work is not. Go.',
      'Returned. No recap. Next check-in is what matters.',
      'You came back. Open Home. See what moved.',
      'Away, then here. Check in on what is live.',
    ],
    honest: [
      'You disappeared. You came back. Do not make a third act of it.',
      'Gap. The challenges did not miss you. The windows still closed.',
      'Welcome back. The work stacked while you were gone. Deal with it.',
      'You opened the app. Good. Checking in is better.',
      'Away days. Nobody saved your seat. Earn it again.',
      'Returned. Cute. Open a challenge before you wander off.',
      'The gap was a choice. So is opening the app. Check in if you can.',
      'You left. You came back. I will not clap. I will wait for proof.',
      'Missed days. The board is still the board. Move.',
      'Here again. Fine. Do not ghost the next window.',
    ],
  },
  streak_broke: {
    gentle: [
      'The streak on {challenge} paused. You are still in. Check in next window.',
      'A miss. The chain snapped. You did not. Come back.',
      '{challenge} missed a day. Still joined. That is the mercy.',
      'Streak broke. The person did not. Next check-in starts another.',
      'You missed. I noticed. I am not leaving. Check in when it opens.',
      'The run ended. You are still on the board. That matters.',
      '{challenge}: a gap in the days. You can still finish if you show up.',
      'Broke the streak. Kept your seat. Use it.',
      'A miss. Soft landing. Next window is a new count.',
      'The chain is gone. You are not. Check in again.',
    ],
    neutral: [
      'Streak on {challenge} broke. You are still in. Check in next period.',
      'Missed a window. Seat remains. Continue.',
      '{challenge}: streak reset. Status is still in. Check in.',
      'The run ended. The challenge did not. Show up.',
      'Broke {n}-plus. Still joined. Next check-in is day one again.',
      'A miss. You were not removed. Check in when it opens.',
      'Streak over. Board still has you. Do the work.',
      '{challenge} missed. You stay. That is the rule. Use it.',
      'Chain snapped. Check in on the next window.',
      'Missed this period. Still active. Continue {challenge}.',
    ],
    honest: [
      'You dropped the streak on {challenge}. You still have a seat. Barely interesting. Check in.',
      'Missed. The chain is dead. You are not. Do not waste that.',
      'Streak broke. Nobody is shocked. Next window, check in.',
      '{challenge}: you missed. You are still in because the rules allowed it. Do not test them.',
      'The run ended because you did not show up. That is the whole story.',
      'Broke it. Still in. I will not pretend that is a win. Check in.',
      'Gap on {challenge}. Seat kept. Proof is what keeps it next time.',
      'You missed a period. The streak is gone. The entry fee is not. Move.',
      'Chain snapped. Cute. Check in before the next miss is the last one.',
      'Streak over. You stayed. Use the seat or lose it later. Your call.',
    ],
  },
  gone_3: {
    gentle: [
      'Three days. I still have your spot. Open a challenge.',
      'Three quiet days. Come in when you can. I kept the light on.',
      'A short gap. You are not forgotten. Check in if a window is open.',
      'Three days away. Welcome back if this is you. I hope it is.',
      'Hey. Three days. No scolding. Just the door, open.',
      'Three days. The board waited. Soft. Come look.',
      'A small absence. I did not unfriend you. Come in.',
      'Three days. Check what is live. Check in if you can.',
      'The app missed you a little. Three days. Come back.',
      'Three days out. You can still pick up {challenge} if it is open.',
    ],
    neutral: [
      'Three days since you opened blOb. Come in.',
      'Three-day gap. Check live challenges. Check in if you can.',
      'You were out three days. The windows did not wait.',
      'Three days away. Open Home. See what is due.',
      'Gap: 3 days. Return. Check in on what is live.',
      'Three days. You have challenges. Look at them.',
      'Short absence. You are here or you are not. Open the app.',
      'Three days quiet. Check {challenge} if you are still in.',
      'Three days. No recap. Next check-in is the recap.',
      'Come back. Three days is enough gap.',
    ],
    honest: [
      'Three days gone. The challenges did not pause. You did.',
      'Three days. That is a choice. Open the app or do not.',
      'You vanished for three. Windows closed without you.',
      'Three-day ghost. Cute. Check in or drop. Pick.',
      'Three days. I will not hunt you. The board already moved.',
      'Gone three. Come back with a check-in, not a feeling.',
      'Three days out. {challenge} did not save you a speech.',
      'You left for three. Fine. Do not leave for seven.',
      'Three days. Effort is weather. This weather was you not showing up.',
      'Three-day gap. Open it. Check in. Or admit you stopped.',
    ],
  },
  gone_7: {
    gentle: [
      'A week. I kept the seat conceptually. Come see what is live.',
      'Seven days. Soft knock. You can still walk in.',
      'A week away. No shame. Open a challenge if you have one.',
      'Seven quiet days. I am still here. So is the work.',
      'A week. Come in when you can. I will not make it weird.',
      'Seven days. The light stayed on. Check in if a window is open.',
      'A week’s gap. Welcome back is available. Take it.',
      'Seven days. {challenge} may still have you. Look.',
      'A week. I missed the check-ins, not the performance.',
      'Seven days out. Door’s open. That is the whole message.',
    ],
    neutral: [
      'Seven days since you opened blOb. Come in.',
      'A week away. Check live challenges. Check in if you can.',
      'Seven-day gap. The board moved. Catch up or read it.',
      'A week. Open Home. See what is due.',
      'Seven days quiet. You still have challenges. Look.',
      'Week gap. Return. Check in on what is live.',
      'Seven days. Windows closed without you. New ones may be open.',
      'A week out. {challenge} is still a page you can open.',
      'Seven days. No recap. Open the app.',
      'Week away. Come back. Check in if you are still in.',
    ],
    honest: [
      'A week gone. That is not a busy calendar. That is a pause.',
      'Seven days. The board forgot your face. Check in if you still have a seat.',
      'A week. I stopped waiting mid-week. You can still show up.',
      'Seven-day ghost. Challenges closed windows. You know this.',
      'A week out. Do not write me a novel. Check in or don’t.',
      'Seven days. {challenge} did not send flowers. Open it.',
      'Week gap. Effort left the chat. You can rejoin it.',
      'Seven days. Cute sabbatical. The miss still counted.',
      'A week. Come back with proof, not a mood.',
      'Seven days gone. I will not beg. The door is still a door.',
    ],
  },
  gone_14: {
    gentle: [
      'Two weeks. I did not delete you. Come in if you want the work.',
      'Fourteen days. Long gap. The door is still a door.',
      'Two weeks away. Soft knock. You can still walk in.',
      'Fourteen quiet days. I kept your name. Check what is live.',
      'Two weeks. No lecture. Open a challenge if you have one.',
      'A long gap. Welcome back is still on the table.',
      'Fourteen days. I missed the check-ins. That is all.',
      'Two weeks. {challenge} may have moved on. Look anyway.',
      'Long quiet. You are allowed to return. I hope you do.',
      'Fourteen days. The light is dimmer. It is not off.',
    ],
    neutral: [
      'Fourteen days since you opened blOb. Come in.',
      'Two weeks away. Check what is still live. Check in if you can.',
      'Fourteen-day gap. The board did not freeze.',
      'Two weeks. Open Home. See what remains.',
      'Fourteen days quiet. Challenges may have ended. Look.',
      'Two-week gap. Return. Check in on what is live.',
      'Fourteen days. Windows closed. New ones exist. Or not.',
      'Two weeks out. {challenge} is a tap away if you are still in.',
      'Fourteen days. No recap. Open the app or do not.',
      'Two weeks. Come back. Check in if a seat remains.',
    ],
    honest: [
      'Two weeks. You left. The board kept score without you.',
      'Fourteen days. That is not busy. That is gone.',
      'Two weeks ghost. Do not expect a parade. Check in if you still can.',
      'Fourteen days. Challenges ended. Some of them. You missed them.',
      'Two weeks. I stopped drafting this in my head. Then you opened it.',
      'Fourteen-day hole. {challenge} did not wait. Look anyway.',
      'Two weeks. Come back with a check-in or do not come back as a brand.',
      'Fourteen days. The miss is the story. Change it or don’t.',
      'Two weeks gone. Effort is weather. This was drought.',
      'Fourteen days. Door’s open. I will not hold it with both hands.',
    ],
  },
  miss_still_in: {
    gentle: [
      'You missed this window on {challenge}. You are still in. Next one matters.',
      'A miss. Seat kept. Check in when it opens again.',
      '{challenge}: missed the period. Still joined. I am glad the rules allowed it.',
      'Missed today. Still on the board. Come back for the next window.',
      'You skipped a check-in. You were not removed. Use that.',
      'A miss. Soft. You stay. Check in next time.',
      '{challenge} missed. You remain. That is the mercy. Do not waste it.',
      'Window closed without you. You are still in. Next window, check in.',
      'Missed this period. Still active. I will see you on the next one.',
      'A gap in the days. Seat still yours. Check in when you can.',
    ],
    neutral: [
      'Missed this period on {challenge}. You are still in. Check in next window.',
      'No check-in this window. Status: still in. Continue.',
      '{challenge}: missed. Not removed. Next period, check in.',
      'Window closed. You stay. Do the next one.',
      'Missed. Still joined. That is the rule. Use it.',
      'No proof this period. Seat remains. Check in next time.',
      '{challenge} miss. Still active. Next window is the recovery.',
      'Missed this one. You were not dropped. Check in.',
      'Period missed. Still in. Continue {challenge}.',
      'A miss. Not an out. Check in on the next open window.',
    ],
    honest: [
      'You missed {challenge}. You are still in because the rules allowed a miss. Do not collect another.',
      'No check-in. Seat kept. That is not a compliment. Check in next window.',
      'Missed the period. Still joined. I would not push that luck.',
      '{challenge}: you skipped. You were not removed. Yet.',
      'Window closed empty. You stay. Next miss may not be so kind.',
      'A miss. Cute. The board still has you. Bring proof next time.',
      'You did not check in. You are still in. That gap is now on the record.',
      'Missed. Not out. Do not confuse those. Check in.',
      '{challenge} missed. Seat remains. Use it or lose it later.',
      'No proof this period. Still active. I will remember if you miss again.',
    ],
  },
  miss_removed: {
    gentle: [
      'You are out of {challenge}. Missed proof. The work you did still happened.',
      'Removed for a miss. I am sorry it ended this way. The next one is open eventually.',
      '{challenge} dropped you. The stake stays with the people who stayed. That is the sport.',
      'Out. A missed window. You can join another. I will be there.',
      'You missed, and the rules ran. You are out. The workouts already happened. I do not take those back.',
      'Removed. Soft as I can say it: the board needed the check-in. It did not get it.',
      '{challenge}: out for no proof. Come back on a new one when you are ready.',
      'You dropped. The seat is gone. You are not gone from me.',
      'Out. Missed the window. Next challenge, check in like it matters. It does.',
      'Removed from {challenge}. The effort is not erased. The seat is.',
    ],
    neutral: [
      'You are out of {challenge}. Missed this period. No proof.',
      'Eliminated: miss. The stake stays with who stayed.',
      '{challenge}: removed for a missed window. Join the next one if you want.',
      'Out. No check-in. That is the rule.',
      'Missed. Removed. The board is public.',
      'You dropped {challenge}. Check-in did not arrive. Seat is gone.',
      'Eliminated for miss / no proof. Next challenge is a new seat.',
      'Out of {challenge}. The people who checked in kept going.',
      'Removed. Missed period. You can start another challenge later.',
      'No proof. Out. That is the whole notice.',
    ],
    honest: [
      'You are out of {challenge}. You missed. The stake does not come with you.',
      'Removed. No check-in. I will not dress it up.',
      '{challenge} dropped you. The window closed. You were not in it.',
      'Out. Missed proof. The board already moved.',
      'You did not check in. You are out. That is the contract.',
      'Eliminated. The workouts you did stay done. The prize does not.',
      'Missed. Removed. Do not ask the board for a feeling.',
      '{challenge}: out. Show up next time or do not buy in.',
      'No proof. Seat gone. I do not take the work back. I take the seat.',
      'You dropped. The people who checked in did not. That is the split.',
    ],
  },
  final_week: {
    gentle: [
      'Last week of {challenge}. You are still in. Check in like it is the first day.',
      'Seven days or less. I am still with you. One window at a time.',
      '{challenge} is almost done. You stayed. Keep checking in.',
      'Final stretch. Soft. The board still needs today’s proof.',
      'Last week. You did not come this far to ghost a window.',
      '{challenge}: the end is close. You are in. Check in.',
      'A week or less. Quiet pride. Then the next check-in.',
      'Final week. I will not crowd you. I will remind you the window opens.',
      'Almost there. Still in. Check in until {challenge} ends.',
      'Last days. You kept the seat. Keep the check-ins.',
    ],
    neutral: [
      'Final week of {challenge}. You are still in. Check in each window.',
      'Seven days or less left. Stay on the board. Check in.',
      '{challenge} ends soon. Still joined. Do the remaining check-ins.',
      'Last week. No extra rules. Same check-in.',
      'Under a week. You are in. Keep going.',
      '{challenge}: final stretch. Check in while windows are open.',
      'Ends in ≤7 days. Still active. Check in.',
      'Last week. The board still counts days. Check in.',
      'Almost over. You stayed. Finish the check-ins.',
      'Final week of {challenge}. Continue.',
    ],
    honest: [
      'Last week of {challenge}. People drop here. Do not.',
      'Seven days or less. You are in. That can change. Check in.',
      '{challenge} is almost over. The remaining windows still count. All of them.',
      'Final stretch. Cute if you make it. Not cute if you miss now.',
      'Under a week. The miss in week one is forgotten. A miss now is the story.',
      'Last week. Check in. Do not get poetic. Get proof in.',
      '{challenge} ends soon. Still in is not finished. Check in.',
      'Final week. I have seen seats lost here. Keep yours.',
      '≤7 days. Same sport. Check in or get out the honest way.',
      'Almost done. That is when people relax. Do not. Check in.',
    ],
  },
  podium_d3: {
    gentle: [
      'Top three on {challenge}. Three days or less. Soft. Still check in.',
      'You are placed. The window is short. I am proud. Check in anyway.',
      '{challenge}: rank {n}. Almost over. Keep the seat you earned.',
      'Podium range. Three days. Do not let a miss rewrite it.',
      'You are up there. Quiet. The last windows still count.',
      'Top 3. Short clock. Check in like you are still hungry. You should be.',
      '{challenge} has you near the front. Three days. Stay kind to the work.',
      'Placed. Not finished. Check in.',
      'Rank {n}. Ends soon. I will watch the last windows with you.',
      'Podium-close. Three days. You did the hard part. Do the last part.',
    ],
    neutral: [
      'Rank {n} on {challenge}. Three days or less. Check in.',
      'Top three. Clock is short. Stay in. Check in.',
      '{challenge}: placed 1–3. Ends soon. Do not miss.',
      'Podium range. ≤3 days. Check in each remaining window.',
      'You are 1st–3rd. Not over. Check in.',
      'Rank {n}. Final three days. Keep the check-ins coming.',
      '{challenge} podium watch. Still in. Check in.',
      'Top 3. Short remaining time. Continue.',
      'Placed. Ends in ≤3 days. Check in.',
      'Rank {n} with three days left. Do the work.',
    ],
    honest: [
      'Rank {n} on {challenge}. Three days. A miss here is a story you will hate.',
      'Top three. Cute. The last window can still dump you. Check in.',
      '{challenge}: podium range. Do not coast. Check in.',
      'You are placed. The clock is mean. Check in anyway.',
      'Rank {n}. ≤3 days. I have seen fourth place born in a skipped window.',
      'Top 3. Not done. Check in or donate the seat.',
      'Podium. Three days. Effort is still the door. Open it.',
      '{challenge} has you high. A miss is how that ends. Don’t.',
      'Rank {n}. Short clock. No speeches. Check in.',
      'Placed. Ends soon. The board does not save you a feeling. Check in.',
    ],
  },
};

export type PickBobLineInput = {
  category: BobEncouragementCategory;
  tone?: string | null;
  n?: number | string | null;
  challenge?: string | null;
  usedIndexes?: Iterable<number>;
};

export type PickedBobLine = {
  index: number;
  text: string;
};

function asCategory(value: string): BobEncouragementCategory | null {
  return (BOB_ENCOURAGEMENT_CATEGORIES as readonly string[]).includes(value)
    ? (value as BobEncouragementCategory)
    : null;
}

export function interpolateBobLine(
  template: string,
  vars?: { n?: number | string | null; challenge?: string | null },
): string {
  const challenge = String(vars?.challenge ?? 'this challenge').trim() || 'this challenge';
  const clipped = challenge.length > 48 ? `${challenge.slice(0, 45).trimEnd()}…` : challenge;
  return interpolateCopy(template, {
    n: vars?.n ?? '',
    challenge: clipped,
  }).replace(/\s+/g, ' ').trim();
}

export function pickBobLine(input: PickBobLineInput): PickedBobLine | null {
  const category = asCategory(String(input.category ?? ''));
  if (!category) {
    return null;
  }
  const tone = asCopyTone(input.tone) as BobEncouragementTone;
  const lines = BOB_ENCOURAGEMENTS[category][tone];
  const used = new Set<number>();
  for (const index of input.usedIndexes ?? []) {
    used.add(index);
  }
  const eligible: PickedBobLine[] = [];
  lines.forEach((template, index) => {
    if (used.has(index)) {
      return;
    }
    const text = interpolateBobLine(template, {
      n: input.n,
      challenge: input.challenge,
    });
    if (!text || text.length > BOB_LINE_MAX) {
      return;
    }
    const lower = text.toLowerCase();
    if (/\blog\b/.test(lower) && !lower.includes('check-in') && !lower.includes('checked in')) {
      return;
    }
    eligible.push({ index, text });
  });
  if (eligible.length === 0) {
    return null;
  }
  return eligible[Math.floor(Math.random() * eligible.length)] ?? null;
}
