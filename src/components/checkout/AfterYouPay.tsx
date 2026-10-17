import { CreditCard, KeyRound, PlayCircle, UserCheck } from "lucide-react";

/**
 * "What happens after you pay": three plain steps under the Pay button, so a
 * buyer knows the payment sheet, the one-time code (guests) and where the
 * course opens before they commit. Guests are the half of buyers who used to
 * stall after paying because nothing told them a sign-in step followed.
 */
export default function AfterYouPay({ isGuest }: { isGuest: boolean }) {
  const steps = [
    { icon: CreditCard, text: "Pay by UPI, card or netbanking on Razorpay's secure screen." },
    isGuest
      ? { icon: KeyRound, text: "Confirm your phone number with a one-time code. Your course is tied to that number." }
      : { icon: UserCheck, text: "The course is added to the account you're signed in to." },
    { icon: PlayCircle, text: "Lesson 1 opens straight away. Watch on your phone, tablet or laptop." },
  ];
  return (
    <section aria-labelledby="after-you-pay" className="space-y-3">
      <h2 id="after-you-pay" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        What happens after you pay
      </h2>
      <ol className="space-y-2.5">
        {steps.map(({ icon: Icon, text }, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-foreground">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 border border-border">
              <Icon className="h-3.5 w-3.5 text-[hsl(var(--cream))]" aria-hidden />
            </span>
            <span className="leading-relaxed">{text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
