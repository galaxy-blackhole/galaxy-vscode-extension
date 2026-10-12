import { memo, type ReactNode } from "react";

/**
 * DSH's DisclosureRow, ported: the same 24px process row, the same markup, and the component's own stylesheet.
 * The upstream package ships as one bundle that pulls the whole code-block stack (shiki, katex, hundreds of
 * grammars), so using one row from it would cost tens of megabytes; the row itself is small, so it is reproduced
 * here against DSH's own CSS and design tokens. Class names are prefixed to keep them out of our namespace.
 */
export interface DshDisclosureRowProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly open: boolean;
  readonly expandable: boolean;
  readonly onToggle: () => void;
  readonly running?: boolean;
  readonly previewChevron?: boolean;
  readonly collapsedContent?: ReactNode;
  readonly children?: ReactNode;
  readonly className?: string;
}

function ChevronIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const DshDisclosureRow = memo(function DshDisclosureRow(props: DshDisclosureRowProps) {
  const leading = props.previewChevron ? (
    <span className="dsh-row-leading">
      <span className="dsh-row-icon-idle">{props.icon}</span>
      <span className="dsh-row-chevron"><ChevronIcon /></span>
    </span>
  ) : (
    <span className="dsh-row-leading dsh-row-icon-idle">{props.icon}</span>
  );
  return (
    <div className={"dsh-row-root" + (props.className === undefined ? "" : " " + props.className)}>
      <div
        className="dsh-row"
        data-expandable={props.expandable ? "" : undefined}
        data-running={props.running ? "" : undefined}
        onClick={props.expandable ? props.onToggle : undefined}
      >
        {props.expandable ? (
          <button type="button" className="dsh-row-leading" onClick={props.onToggle} aria-expanded={props.open} aria-label={props.title}>
            {leading}
          </button>
        ) : leading}
        <span className="dsh-row-title">{props.title}</span>
        {props.open ? null : props.collapsedContent}
      </div>
      {props.open ? props.children : null}
    </div>
  );
});
