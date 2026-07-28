import { IconArrowLeft } from "@tabler/icons-preact";

interface BackLinkProps {
  href: string;
  label: string;
}

export function BackLink({ href, label }: BackLinkProps) {
  return (
    <a href={href} class="link text-sm">
      <IconArrowLeft class="size-3.5 inline mr-1" />
      {label}
    </a>
  );
}
