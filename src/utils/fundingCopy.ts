/**
 * The Add funds page's wording, kept together because it needs product
 * sign-off; change it here and nowhere else.
 */
export const FUNDING_TOOL_URL = "https://funding.vpn.gnosis.eth.limo/";

export const FUNDING_COPY = {
  addressLabel: "Your Gnosis VPN address",
  copy: "Copy",
  copied: "Copied",
  fundingTool: "Funding tool",
  networkLine: {
    before: "Send on ",
    network: "Gnosis Chain",
    after: " only. Other networks won't arrive.",
  },
  whatToSend: "What to send",
  wxhopr: { name: "wxHOPR", purpose: "Pays for your traffic" },
  xdai: { name: "xDAI", purpose: "Pays network fees" },
  /** `amount` already carries the unit, e.g. "50 wxHOPR". */
  sendAtLeast: {
    before: "Send at least ",
    after: " to keep browsing",
  },
  idle: "Your balance updates by itself, usually within 2 minutes of sending.",
  waiting: {
    title: "Waiting for your transfer…",
    detail: "Checking every few seconds. You can leave this page.",
  },
  /** `amount` carries the unit; `balance` is the new balance with unit. */
  received: {
    title: (amount: string) => `Received ${amount}`,
    traffic: (balance: string) => `Traffic balance is now ${balance}.`,
    gas: (balance: string) => `Gas balance is now ${balance}.`,
  },
} as const;
