import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

/**
 * DSH's Button, ported with its own stylesheet: the same 36px / 28px controls, the same token families
 * (--dsw-alias-button-*, --dsw-alias-interactive-bg-*), and the same hover and active states.
 */
export type DshButtonVariant = "primary" | "ghost" | "outline" | "toolbar";
export interface DshButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: DshButtonVariant;
  readonly size?: "md" | "sm";
  readonly icon?: ReactNode;
}

export const DshButton = forwardRef<HTMLButtonElement, DshButtonProps>(function DshButton(props, ref) {
  const { variant = "ghost", size = "md", icon, className, children, ...rest } = props;
  return (
    <button {...rest} ref={ref} className={["dsh-button", size, variant, className ?? ""].join(" ").trim()}>
      {icon === undefined ? null : <span className="dsh-button-icon">{icon}</span>}
      {children}
    </button>
  );
});
