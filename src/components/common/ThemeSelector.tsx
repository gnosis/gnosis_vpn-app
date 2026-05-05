import SegmentedControl from "./SegmentedControl.tsx";

type Theme = "auto" | "light" | "dark";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

interface ThemeSelectorProps {
  value: Theme;
  onChange: (theme: Theme) => void;
}

export default function ThemeSelector(props: ThemeSelectorProps) {
  return (
    <div class="flex items-center justify-between">
      <span class="text-text-primary">Theme</span>
      <SegmentedControl
        options={OPTIONS}
        value={props.value}
        onChange={props.onChange}
      />
    </div>
  );
}
