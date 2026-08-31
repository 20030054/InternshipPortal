import { cn } from "@/lib/utils";

/**
 * M15: the one form-field primitive every action form uses — none
 * existed before this module since M13's dashboards were read-only.
 * Plain, uncontrolled inputs (name + native `type`/`required`) rather
 * than a controlled-component library: `ActionForm`
 * (`src/components/action-form.tsx`) reads values off the DOM at
 * submit time via `form.elements`, matching this project's existing
 * "as little client-side machinery as the job needs" bias (D-036/
 * D-037/D-038's own reasoning about narrow, hand-written pieces over
 * a general-purpose dependency).
 */
const inputClass =
  "h-10 rounded border border-deep/20 bg-white px-3 text-sm text-ink " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mid " +
  "disabled:pointer-events-none disabled:opacity-50";

export function Field({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={cn("flex flex-col gap-1 text-sm", className)}>
      <span className="font-medium text-deep">
        {label}
        {props.required && <span aria-hidden className="text-danger"> *</span>}
      </span>
      <input className={inputClass} {...props} />
    </label>
  );
}

export function TextAreaField({
  label,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className={cn("flex flex-col gap-1 text-sm", className)}>
      <span className="font-medium text-deep">
        {label}
        {props.required && <span aria-hidden className="text-danger"> *</span>}
      </span>
      <textarea className={cn(inputClass, "h-auto min-h-24 py-2")} {...props} />
    </label>
  );
}

export function SelectField({
  label,
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className={cn("flex flex-col gap-1 text-sm", className)}>
      <span className="font-medium text-deep">
        {label}
        {props.required && <span aria-hidden className="text-danger"> *</span>}
      </span>
      <select className={inputClass} {...props}>
        {children}
      </select>
    </label>
  );
}

export function CheckboxField({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={cn("flex items-center gap-2 text-sm text-ink", className)}>
      <input type="checkbox" className="h-4 w-4 rounded border-deep/30" {...props} />
      {label}
    </label>
  );
}
