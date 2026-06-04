import { jsx as _jsx } from "react/jsx-runtime";
import { cloneElement, isValidElement } from "react";
import { clsx } from "clsx";
const buttonClasses = (variant, className) => clsx("inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50", variant === "primary" && "bg-slate-950 text-white hover:bg-slate-800 focus-visible:outline-slate-950", variant === "secondary" && "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50", variant === "ghost" && "text-slate-700 hover:bg-slate-100", variant === "danger" && "bg-red-600 text-white hover:bg-red-500 focus-visible:outline-red-600", className);
export function Button({ asChild = false, children, className, variant = "primary", ...props }) {
    if (asChild && isValidElement(children)) {
        const child = children;
        return cloneElement(child, {
            className: clsx(buttonClasses(variant, className), child.props.className)
        });
    }
    return (_jsx("button", { className: buttonClasses(variant, className), ...props, children: children }));
}
export function Card({ className, ...props }) {
    return _jsx("section", { className: clsx("rounded-lg border border-slate-200 bg-white shadow-sm", className), ...props });
}
export function Badge({ className, ...props }) {
    return (_jsx("span", { className: clsx("inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600", className), ...props }));
}
export function Input({ className, ...props }) {
    return (_jsx("input", { className: clsx("h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100", className), ...props }));
}
