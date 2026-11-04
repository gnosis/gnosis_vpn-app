/** Wallet outline; `billsClass` tints the three bills, e.g. by balance level. */
export default function WalletIcon(props: { billsClass?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="5" width="19" height="14" rx="4" />
      <path d="M21.5 10h-3a2 2 0 0 0 0 4h3" />
      <path d="M6.5 9h5.5M6.5 12h5.5M6.5 15h5.5" class={props.billsClass} />
    </svg>
  );
}
