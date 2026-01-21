import * as React from "react";

type Variant = "default" | "primary" | "destructive" | "outline";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClass: Record<Variant, string> = {
  default: "bg-gray-900 text-white hover:bg-gray-800",
  primary: "bg-primary text-white hover:brightness-95",
  destructive: "bg-red-600 text-white hover:bg-red-500",
  outline:
    "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30",
};

const sizeClass: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-base",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = "default", size = "md", ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={
        "inline-flex items-center justify-center rounded-md font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed " +
        variantClass[variant] +
        " " +
        sizeClass[size] +
        " " +
        (className || "")
      }
      {...props}
    />
  );
});

Button.displayName = "Button";
