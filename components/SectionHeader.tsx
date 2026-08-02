import type { ComponentChildren } from "preact";

interface SectionHeaderProps {
  title: string;
  /** Controls rendered flush right on the header rule (toggles, links). */
  children?: ComponentChildren;
}

/** Heading for a card section: a quiet label sitting on a full-width rule. */
export function SectionHeader({ title, children }: SectionHeaderProps) {
  return (
    <div class="section-header">
      <h2 class="section-title">{title}</h2>
      {children}
    </div>
  );
}
