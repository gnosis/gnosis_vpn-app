import { createSignal, onCleanup, Show } from "solid-js";
import type { StartupIssue } from "@src/services/vpnService.ts";
import {
  type StartupIssueAction,
  startupIssueHint,
} from "@src/utils/status.ts";
import { openSettings } from "@src/utils/settingsPage.ts";
import Banner from "@src/components/common/Banner.tsx";
import WarningIcon from "@src/components/icons/WarningIcon.tsx";

const OPEN_FOR_ACTION: Record<StartupIssueAction, () => void> = {
  "send-logs": () => openSettings("general"),
  "check-update": () => openSettings("check-update"),
};

export default function StartupIssueBanner(
  props: { issue: StartupIssue | null | undefined },
) {
  // The show delay has to elapse between status updates.
  const [nowMs, setNowMs] = createSignal(Date.now());
  const tick = setInterval(() => setNowMs(Date.now()), 1000);
  onCleanup(() => clearInterval(tick));
  const hint = () => startupIssueHint(props.issue, nowMs());
  const onClick = () => {
    const action = hint()?.action;
    return action ? OPEN_FOR_ACTION[action] : undefined;
  };

  return (
    <Show when={hint()}>
      {(hint) => (
        <Banner
          icon={<WarningIcon filled />}
          variant="warning"
          onClick={onClick()}
        >
          {hint().text}
        </Banner>
      )}
    </Show>
  );
}
