"use client";

import Icon from "./Icon";
import { useTheme } from "./theme";

/** Light for the phone the night before, dark for the booth; follows the device until pressed. */
export default function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" onClick={toggle} aria-label={`Switch to the ${next} theme`} title={`Switch to the ${next} theme`} className="btn btn-quiet btn-icon">
      <span key={theme} className="pop grid place-items-center">
        <Icon name={theme === "dark" ? "moon" : "sun"} className="h-[18px] w-[18px]" />
      </span>
    </button>
  );
}
