import { useEffect, useRef, useState, type PointerEvent } from "react";
import { QrCode } from "lucide-react";
import {
  ensureCertificateFonts,
  fontFamilyFor,
  LINE_GAP,
  type CertificateRender,
  type DesignField,
  type FieldKey,
} from "@/lib/certificates";

/**
 * Draws a certificate in the browser the same way the server draws the PDF:
 * the design as the background, each field placed by its fractions. Text is
 * centred on `y` with line-height 1, which is how render.ts places baselines.
 * The QR is a stand-in square here; the PDF carries the real code.
 */
interface Props {
  imageUrl: string;
  width: number;
  height: number;
  fields: DesignField[];
  values: CertificateRender["values"];
  /** Admin editor: highlight one field and report clicks as fractions. */
  selected?: FieldKey | null;
  onPick?: (point: { x: number; y: number }) => void;
  className?: string;
  alt?: string;
}

function textFor(field: DesignField, values: Props["values"]) {
  const raw = field.key === "qr" ? "" : (values[field.key as keyof Props["values"]] ?? "");
  if (!raw.trim()) return "";
  const text = `${field.prefix ?? ""}${raw}`.trim();
  return field.upper ? text.toUpperCase() : text;
}

export default function CertificatePreview({ imageUrl, width, height, fields, values, selected, onPick, className, alt }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    ensureCertificateFonts();
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    if (!onPick || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    onPick({
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    });
  };

  return (
    <div
      ref={ref}
      className={`cert-preview${onPick ? " is-editable" : ""}${className ? ` ${className}` : ""}`}
      style={{ aspectRatio: `${width} / ${height}` }}
      onPointerDown={pick}
      role={onPick ? "button" : "img"}
      aria-label={alt ?? "Certificate"}
    >
      <img src={imageUrl} alt="" draggable={false} />
      {box.h > 0 &&
        fields.map((f) => {
          if (f.key === "qr") {
            const side = f.size * box.h;
            return (
              <span
                key={f.key}
                className={`cert-qr${selected === f.key ? " is-selected" : ""}`}
                style={{ left: f.x * box.w - side / 2, top: f.y * box.h - side / 2, width: side, height: side }}
              >
                <QrCode style={{ width: side * 0.7, height: side * 0.7 }} />
              </span>
            );
          }
          const text = textFor(f, values);
          if (!text && selected !== f.key) return null;
          const lines = (text || `[${f.key}]`).split(/\r?\n/).filter(Boolean);
          const size = f.size * box.h;
          const align = f.align ?? "center";
          const shift = align === "left" ? "0%" : align === "right" ? "-100%" : "-50%";
          return (
            <span
              key={f.key}
              className={`cert-text${selected === f.key ? " is-selected" : ""}`}
              style={{
                left: f.x * box.w,
                top: f.y * box.h,
                transform: `translate(${shift}, -50%)`,
                fontFamily: fontFamilyFor(f.font),
                fontSize: size,
                lineHeight: LINE_GAP,
                color: f.color ?? "#111111",
                textAlign: align,
              }}
            >
              {lines.map((l, i) => (
                <span key={i} style={{ display: "block", lineHeight: 1, marginTop: i ? size * (LINE_GAP - 1) : 0 }}>
                  {l}
                </span>
              ))}
            </span>
          );
        })}
    </div>
  );
}
