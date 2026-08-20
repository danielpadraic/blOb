export const LEGAL_TOS_VERSION = '2026-08-19';
export const LEGAL_PRIVACY_VERSION = '2026-08-19';
export const LEGAL_UPDATED_LABEL = 'Last updated August 19, 2026';

export type LegalDocId = 'terms' | 'privacy';

export type LegalSection = {
  heading: string;
  body: string[];
};

export const LEGAL_DOCS: Record<
  LegalDocId,
  { title: string; version: string; updated: string; sections: LegalSection[] }
> = {
  terms: {
    title: 'Terms of Service and User Agreement',
    version: LEGAL_TOS_VERSION,
    updated: LEGAL_UPDATED_LABEL,
    sections: [
      {
        heading: '1. Agreement',
        body: [
          'These Terms of Service and this User Agreement (“Terms”) govern your use of blOb, including the website, mobile applications, and related services (the “Service”).',
          'By creating an account or using the Service, you agree to these Terms. If you do not agree, do not use the Service.',
        ],
      },
      {
        heading: '2. Eligibility',
        body: [
          'You must be at least 18 years old and able to form a binding contract to use the Service.',
          'You are responsible for the accuracy of the information you provide and for keeping your login credentials secure.',
        ],
      },
      {
        heading: '3. Contests of skill',
        body: [
          'You will only create or join contests of your own personal effort and skill. No gambling, pure chance, or risk-based activity without personal skill.',
          'Official challenges and user-created challenges on blOb are contests of personal effort and skill. They are not lotteries, raffles, or games of chance.',
          'We may remove a challenge, withhold a payout, or close an account if a contest is chance-based, misrepresented, or otherwise prohibited.',
        ],
      },
      {
        heading: '4. Coins and real money',
        body: [
          'Coins are in-app rewards for showing up. They have no cash value, are not legal tender, and are not interchangeable with real-money balances.',
          'Real-money balances are used for Official and other paid challenges. They are not a bank deposit. Available balances and withdrawals are subject to identity checks, payment-processor rules, and applicable law.',
          'Official prizes are not credited as Coins. Coin grants never move Official prize money.',
        ],
      },
      {
        heading: '5. Official challenges and paid contests',
        body: [
          'Official challenge days are determined in America/Chicago time. Daily Official windows end at 11:59 p.m. Central Time unless the challenge rules state otherwise.',
          'Joining a paid or Official challenge may require a stake, identity verification, and acceptance of the specific challenge rules shown before you join.',
          'If you drop, miss a required proof, or violate the rules, you may forfeit your stake according to those rules. We do not joke about money, legal, or identity-verification requirements.',
        ],
      },
      {
        heading: '6. Proof, fairness, and enforcement',
        body: [
          'Some challenges require proof, such as a selfie, a heart-rate screenshot, or another method listed on the challenge.',
          'We may review, flag, or reject proof that is incomplete, reused, or not yours. Competitors may flag proof. Repeated abuse can result in removal from a challenge or the Service.',
          'You may not delete posts used as challenge proof in order to evade review.',
        ],
      },
      {
        heading: '7. Your content',
        body: [
          'You retain ownership of content you post. You grant blOb a non-exclusive license to host, display, and distribute that content as needed to operate the Service.',
          'Do not post content that is illegal, infringing, or that you do not have the right to share.',
        ],
      },
      {
        heading: '8. Accounts and termination',
        body: [
          'We may suspend or terminate an account that violates these Terms, applicable law, or challenge rules.',
          'You may close your account by contacting support. Some records, including payment, grant, and legal-acceptance records, are retained as required by law or to complete open contests.',
        ],
      },
      {
        heading: '9. Disclaimers and limitation of liability',
        body: [
          'The Service is provided “as is.” We do not warrant uninterrupted availability or that every challenge will fill or pay out.',
          'To the fullest extent permitted by law, blOb is not liable for indirect, incidental, or consequential damages, or for lost profits, arising from your use of the Service.',
          'Nothing in these Terms limits liability that cannot be limited under applicable law.',
        ],
      },
      {
        heading: '10. Changes',
        body: [
          'We may update these Terms. The version identifier and last-updated date appear at the top of this document. Continued use after an update constitutes acceptance of the revised Terms where permitted by law.',
        ],
      },
      {
        heading: '11. Contact',
        body: [
          'Questions about these Terms: legal@blob.app.',
        ],
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    version: LEGAL_PRIVACY_VERSION,
    updated: LEGAL_UPDATED_LABEL,
    sections: [
      {
        heading: '1. Scope',
        body: [
          'This Privacy Policy describes how blOb collects, uses, and shares information when you use the Service.',
          'It does not cover third-party sites or payment processors except as described below.',
        ],
      },
      {
        heading: '2. Information we collect',
        body: [
          'Account data: email, display name, username, and authentication identifiers (including Google sign-in if you choose it).',
          'Profile data you choose to add: photo, bio, training preferences, and fitness history.',
          'Body metrics you choose to add: gender, height, weight, body-fat estimate, and related fields. These stay private. Completing a fitness profile does not publish them.',
          'Usage data: challenges you create or join, proofs you submit, messages, friend relationships, notifications, and device tokens used to deliver alerts.',
          'Payment data needed for real-money and Official stakes is handled by our payment and identity vendors. We do not store full card numbers.',
        ],
      },
      {
        heading: '3. How we use information',
        body: [
          'To operate your account, wallet, notifications, and challenges.',
          'To match you with appropriate challenges and to place Official competitors fairly. Body metrics used for placement are not shown on your public profile unless you choose to share fitness stats.',
          'To credit Coin grants you earn, write ledger rows, and show balances.',
          'To detect fraud, enforce contest rules, and meet legal obligations including identity verification for real-money activity.',
        ],
      },
      {
        heading: '4. Sharing',
        body: [
          'Public profile fields you set (name, username, photo, bio) can be seen by other users.',
          'Challenge proofs and posts you attach to a challenge are visible to people who can see that challenge.',
          'We share data with infrastructure, analytics, push, and payment vendors as needed to run the Service.',
          'We may disclose information if required by law or to protect the safety of users or the integrity of a contest.',
        ],
      },
      {
        heading: '5. Retention',
        body: [
          'We keep account, ledger, grant, notification, and legal-acceptance records for as long as your account is open and as required after closure to complete contests, prevent fraud, and meet tax or regulatory duties.',
          'You may request access or deletion of personal data subject to those legal holds.',
        ],
      },
      {
        heading: '6. Your choices',
        body: [
          'You can edit profile fields in the app. Body metrics remain private unless you turn on public fitness stats.',
          'You can disable push notifications in system settings. In-app alerts still work.',
          'You can contact privacy@blob.app to request a copy of your data or to ask that we delete what the law allows us to delete.',
        ],
      },
      {
        heading: '7. Children',
        body: [
          'The Service is not directed to anyone under 18. We do not knowingly collect personal information from children.',
        ],
      },
      {
        heading: '8. Changes',
        body: [
          'We may update this Privacy Policy. The version identifier and last-updated date appear at the top of this document.',
        ],
      },
      {
        heading: '9. Contact',
        body: [
          'Privacy questions: privacy@blob.app.',
        ],
      },
    ],
  },
};

export const SKILL_ATTESTATION =
  'I will only create or join contests of my own personal effort and skill. No gambling, pure chance, or risk-based activity without personal skill.';
