import { useEffect, useRef, useState } from "react";

const stats = [
  { value: 67746, suffix: "+", label: "Learners" },
  { value: 4.86, suffix: "", label: "Avg Rating", decimals: 2 },
  { value: 821, suffix: "+", label: "Cities" },
  { value: 3000, suffix: "+", label: "Collaborations" },
];

function useCountUp(target: number, inView: boolean, decimals = 0) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const duration = 1600;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(parseFloat((eased * target).toFixed(decimals)));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, target, decimals]);
  return val;
}

const CredibilityBar = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setInView(true); },
      { threshold: 0.3 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="grid grid-cols-2 gap-4 rounded-2xl border border-border/50 bg-card/60 p-6 backdrop-blur-sm sm:grid-cols-4 sm:gap-8 sm:p-8"
    >
      {stats.map((s) => {
        const count = useCountUp(s.value, inView, s.decimals || 0);
        return (
          <div key={s.label} className="text-center">
            <p className="font-display text-2xl font-bold text-foreground sm:text-3xl">
              {s.decimals ? count.toFixed(s.decimals) : Math.floor(count).toLocaleString()}
              <span className="text-highlight">{s.suffix}</span>
            </p>
            <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {s.label}
            </p>
          </div>
        );
      })}
    </div>
  );
};

export default CredibilityBar;
