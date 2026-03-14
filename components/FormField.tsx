import type { ComponentChildren } from "preact";

interface FormFieldProps {
  label: string;
  children: ComponentChildren;
}

export function FormField({ label, children }: FormFieldProps) {
  return (
    <div>
      <label class="block text-sm font-medium mb-1">{label}</label>
      {children}
    </div>
  );
}
