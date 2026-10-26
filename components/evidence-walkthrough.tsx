"use client";

import { useRef, useState } from "react";

import styles from "@/components/evidence-walkthrough.module.css";

const steps = [
  { title: "Request", text: "A recorded attempt links the candidate, the method, and the request that carried it. Sending something is not evidence that it worked." },
  { title: "Response and signal", text: "The response, the transport, and any detected signal are separate facts. A page that loads or a pattern that matches does not establish exploitation." },
  { title: "Verifier", text: "The verifier reads the linked response against the required controls. Missing controls limit the conclusion; missing proof is not a negative finding." },
  { title: "Review", text: "A Human or AI review is bound to the artifact it scored. A final score needs eligible candidates, every component, and arithmetic that adds up." },
];

export function EvidenceWalkthrough() {
  const [step, setStep] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = steps[step];

  const stepTab = (delta: number) => {
    const next = (step + delta + steps.length) % steps.length;
    setStep(next);
    tabs.current[next]?.focus();
  };

  return (
    <section className={styles.walkthrough} aria-label="Evidence walkthrough">
      <div className="ui-tabs" role="tablist" aria-label="Evidence walkthrough stages">
        {steps.map((item, index) => (
          <button
            key={item.title}
            type="button"
            role="tab"
            id={`evidence-tab-${index}`}
            className="ui-tab"
            aria-selected={step === index}
            aria-controls="evidence-walkthrough-panel"
            tabIndex={step === index ? 0 : -1}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            onClick={() => setStep(index)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              event.preventDefault();
              stepTab(event.key === "ArrowRight" ? 1 : -1);
            }}
          >
            {item.title}
          </button>
        ))}
      </div>
      <div
        className={styles.panel}
        id="evidence-walkthrough-panel"
        role="tabpanel"
        aria-labelledby={`evidence-tab-${step}`}
        tabIndex={0}
      >
        <h3>{current.title}</h3>
        <p key={step}>{current.text}</p>
      </div>
      <p className={`helper-copy ${styles.note}`}>Illustrative evidence flow, not an experiment result.</p>
    </section>
  );
}
