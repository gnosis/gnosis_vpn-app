import Button from "@src/components/common/Button";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit } from "@tauri-apps/api/event";

export default function AirdropClaimBanner() {
  return (
    <div class="rounded-xl bg-[#E2F5FF] px-4 py-2 w-full max-w-md">
      <div class="font-bold">Only relevant for Testers:</div>
      <div class="text-sm">Claim here wxHOPR and xDAI.</div>
      <div class="flex justify-center mt-1">
        <Button
          onClick={async () => {
            const [mainWin, settingsWin] = await Promise.all([
              WebviewWindow.getByLabel("main"),
              WebviewWindow.getByLabel("settings"),
            ]);
            if (mainWin) {
              await mainWin.show();
              await mainWin.setFocus();
              void emit("navigate", { screen: "onboarding", step: "airdrop" });
            }
            if (settingsWin) {
              await settingsWin.hide();
            }
          }}
        >
          Claim Airdrop
        </Button>
      </div>
    </div>
  );
}
