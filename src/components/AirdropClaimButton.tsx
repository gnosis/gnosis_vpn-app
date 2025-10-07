import Button from "@src/components/common/Button";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit } from "@tauri-apps/api/event";

export default function AirdropClaim() {
  return (
    <div class="rounded-xl bg-[#E2F5FF] px-4 py-2 w-full">
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
              globalThis.setTimeout(() => {
                void emit("navigate", "onboarding");
                // After navigating to onboarding, set step to airdrop
                globalThis.setTimeout(() => {
                  void emit("onboarding:set-step", "airdrop");
                }, 25);
              }, 25);
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
