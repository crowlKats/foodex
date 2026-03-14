import TbArrowLeft from "tb-icons/TbArrowLeft";

interface BackLinkProps {
  href: string;
  label: string;
}

export function BackLink({ href, label }: BackLinkProps) {
  return (
    <a href={href} class="link text-sm">
      <TbArrowLeft class="size-3.5 inline mr-1" />
      {label}
    </a>
  );
}
