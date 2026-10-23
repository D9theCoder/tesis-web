"use client";
import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import styles from "@/components/evidence-walkthrough.module.css";
const steps = [
  { title: "Request", text: "A recorded execution attempt links the candidate, method, request and visit IDs. Executed does not mean confirmed." },
  { title: "Response and signal", text: "Transport, response evidence and signal detection are separate facts. HTTP 200 or a detected signal does not establish exploitation." },
  { title: "Verifier", text: "The verifier examines linked evidence and required independent controls. Missing controls can limit the conclusion; missing proof is not a negative finding." },
  { title: "Source-bound review", text: "Independent Human and AI receipts bind to the original execution and SHA-256. Final scores require eligible candidates, complete components and valid arithmetic." },
];
export function EvidenceWalkthrough() {
  const [step, setStep] = useState(0);
  return <section className={`evidence-walkthrough ${styles.walkthrough}`} aria-label="Evidence walkthrough">
    <ol className={styles.steps}>{steps.map((item, index) => <li key={item.title}><button className="ui-button" aria-pressed={step === index} onClick={() => setStep(index)}><span>{index + 1}</span>{item.title}</button></li>)}</ol>
    <div className="walkthrough-reading" key={step} role="status"><h3>{steps[step].title}</h3><p>{steps[step].text}</p></div>
    <div className="page-actions"><Button disabled={step === 0} onClick={() => setStep(step - 1)}>Previous fact</Button><Button disabled={step === steps.length - 1} onClick={() => setStep(step + 1)}>Next fact</Button><Button onClick={() => setStep(0)}>Restart walkthrough</Button></div>
    <p className="helper-copy">Illustrative evidence flow, not an experiment result. Nothing plays automatically.</p>
  </section>;
}
