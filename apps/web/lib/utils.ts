import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { indiaTodayISO } from "./legal-date";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Indian-system currency formatting: 1,00,00,000. Accepts the engine's exact decimal strings. */
export function inr(amount: string | number): string {
  const n = typeof amount === "number" ? amount.toString() : amount;
  const neg = n.startsWith("-");
  const [intPart, frac] = (neg ? n.slice(1) : n).split(".");
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3;
  return `${neg ? "−" : ""}₹${grouped}${frac ? "." + frac : ""}`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function todayISO(): string {
  return indiaTodayISO();
}
