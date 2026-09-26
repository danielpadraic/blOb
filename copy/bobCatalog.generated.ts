/** Product alert lines. Gentle | Honest. One action, challenge name in the sentence. */
export const BOB_CATALOG = {
  checkin_streak_5plus: {
    gentle: ['You are in on {challenge}. Keep the streak.'],
    honest: ['{challenge}: keep the streak.'],
  },
  checkin_streak_2: {
    gentle: ['You checked in to {challenge}. Keep the streak.'],
    honest: ['{challenge}: check in tomorrow.'],
  },
  login_after_gap: {
    gentle: ['Time to check in to {challenge}.'],
    honest: ['{challenge}: check in today.'],
  },
  streak_broke: {
    gentle: ['{challenge}: the streak reset. Check in today.'],
    honest: ['{challenge}: the streak reset. Check in today.'],
  },
  gone_3: {
    gentle: ['Time to check in to {challenge}.'],
    honest: ['{challenge}: check in today.'],
  },
  gone_7: {
    gentle: ['Time to check in to {challenge}.'],
    honest: ['{challenge}: check in today.'],
  },
  gone_14: {
    gentle: ['Time to check in to {challenge}.'],
    honest: ['{challenge}: check in today.'],
  },
  miss_still_in: {
    gentle: ['You missed a day on {challenge}. You are still in.'],
    honest: ['{challenge}: a miss is a miss.'],
  },
  miss_removed: {
    gentle: ['You are out of {challenge}.'],
    honest: ['{challenge}: a miss is a miss.'],
  },
  final_week: {
    gentle: ['{challenge}: last days. Check in.'],
    honest: ['{challenge}: last days. Check in or miss.'],
  },
  podium_d3: {
    gentle: ['{challenge}: three days left. Check in.'],
    honest: ['{challenge}: three days. Check in or miss the day.'],
  },
} as const;
