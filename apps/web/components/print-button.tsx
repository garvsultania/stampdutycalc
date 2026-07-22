"use client";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <Button onClick={() => window.print()} variant="gold" size="lg">
      <Printer /> Print / save as PDF
    </Button>
  );
}
