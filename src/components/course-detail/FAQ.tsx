import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface FaqItem {
  question: string;
  answer: string;
}

interface Props {
  faqs?: FaqItem[] | null;
}

const FAQ = ({ faqs }: Props) => {
  if (!faqs || faqs.length === 0) return null;

  return (
    <section>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-4">
        Frequently asked
      </p>
      <Accordion type="single" collapsible className="bg-surface border border-border rounded-xl divide-y divide-border">
        {faqs.map((item, i) => (
          <AccordionItem key={i} value={`faq-${i}`} className="border-b-0 px-5">
            <AccordionTrigger className="text-left text-sm font-medium py-4 hover:no-underline">
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4 whitespace-pre-wrap">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
};

export default FAQ;
