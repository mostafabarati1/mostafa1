import { Layers, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const ITEMS = [
  { icon: Wallet, label: "بدون نیاز به کارت بانکی برای شروع" },
  { icon: ShieldCheck, label: "پرداخت از طریق درگاه بانکی معتبر" },
  { icon: Sparkles, label: "توضیح هوش مصنوعی فارسی روی هر سؤال" },
  { icon: Layers, label: "سؤالات در سه سطح آسان، متوسط و سخت" },
];

export function TrustStrip() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-10">
      <div className="flex flex-wrap gap-4">
        {ITEMS.map(({ icon: Icon, label }) => (
          <Badge key={label} variant="secondary" className="gap-2 px-3 py-2 text-sm">
            <Icon className="size-4" />
            <span className="text-muted-foreground">{label}</span>
          </Badge>
        ))}
      </div>
    </section>
  );
}
