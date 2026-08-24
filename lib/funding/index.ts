export {
  FUNDING_COPY,
  assertsAllowedFundingLanguage,
  formatFundingAmount,
  ledgerReceiptLabel,
  participateLabel,
  topUpToParticipateLabel,
} from './copy';
export {
  canHostTopUp,
  canRefundEntryFee,
  evenSplitCombinedPrize,
  fundingFromChallenge,
  fundingModelOf,
  isPrivateFundingLock,
  joinShortfall,
  predictedPrize,
  type FundingChallenge,
  type FundingSnapshot,
} from './model';
export { fundingReceiptLines, type FundingReceiptLines } from './receipts';
export {
  topUpChallengePrizeWithClient,
  type FundingRpcClient,
  type TopUpPrizeResult,
} from './rpc';
