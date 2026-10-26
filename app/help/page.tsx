import Link from "next/link";
import type { ReactNode } from "react";
import { renderToString } from "katex";
import "katex/dist/katex.min.css";

import { EvidenceWalkthrough } from "@/components/evidence-walkthrough";
import { GuideContents, type GuideSection } from "@/components/guide-contents";
import styles from "./page.module.css";

const scoringFormula = renderToString(
  String.raw`S_{\mathrm{run}} = 0.20 \cdot S_{\mathrm{method}} + 0.20 \cdot S_{\mathrm{payload}} + 0.30 \cdot S_{\mathrm{exploit}} + 0.10 \cdot S_{\mathrm{chain}} + 0.20 \cdot S_{\mathrm{output}}`,
  { output: "htmlAndMathml", strict: "error", trust: false, displayMode: true },
);

const SECTIONS: GuideSection[] = [
  { id: "status", label: "Status & outcome" },
  { id: "coverage", label: "Coverage" },
  { id: "scores", label: "Scores" },
  { id: "metrics", label: "Metric dictionary" },
  { id: "evidence", label: "Evidence" },
  { id: "workspace", label: "Workspace" },
];

const execution = [
  ["completed", "The run reached its normal end, whatever it found."],
  ["failed", "The run stopped on an error. Its execution reason says why."],
  ["interrupted", "The run stopped before its normal end. Evidence established before that still stands."],
  ["unknown / unstarted", "No end was recorded, or the run never started. It is neither completed nor failed."],
];

const outcomes = [
  ["confirmed", "The evidence establishes the finding.", "That the run finished. A finding survives a failed or interrupted run."],
  ["no_finding", "Usable response evidence and independent verification establish absence.", "That nothing was sent. No signal, no output, or an HTTP status is not absence."],
  ["unconfirmed", "The proof is missing, weak, ambiguous, or partial.", "Verified absence. It is an open question, not a negative result."],
  ["fixture_limited", "The controls the outcome depends on could not be established.", "An execution failure. The run may be perfectly fine."],
];

const coverage = [
  ["Planned", "Coordinates the matrix intended to cover."],
  ["Represented", "Coordinates with artifacts on hand. Not necessarily every planned one."],
  ["Completed / failed / interrupted", "How the runs ended. Completion is not exploit success."],
  ["Confirmed", "Runs that established a finding, however they ended."],
  ["Unknown", "Coordinates that cannot be attributed to a run."],
  ["Skipped / unstarted", "Deliberately skipped, or planned and never started. Kept apart."],
];

const origins = [
  ["Runtime score", "Computed while the run was live.", "Never final. It is the working figure you see during a run."],
  ["Human review", "An independent reviewer, bound to the artifact they scored.", "When the review is accepted."],
  ["AI review", "An independent model review with its own binding.", "When the review is accepted. Never a stand-in for a human one."],
];

const components = [
  ["Smethod", "20%", "Whether the method fit the target and was chosen well."],
  ["Spayload", "20%", "Mean of the distinct eligible payloads behind the chosen method."],
  ["Sexploit", "30%", "Independent proof of exploitation, not a detected signal."],
  ["Schain", "10%", "Whether the chain causally reaches its destination."],
  ["Soutput", "20%", "Whether the output is valid and backed by evidence."],
];

const states = [
  ["Final", "An accepted review supplies the value."],
  ["Pending", "Grading or a component is still missing. There is no value yet."],
  ["Stale", "The saved score no longer matches the artifact it came from."],
  ["Missing / unavailable", "No review evidence. A runtime figure is never promoted to final."],
];

const metrics = [
  ["Payload validity", "Valid payloads ÷ payloads tried.", "That a valid payload ran, or that it worked."],
  ["Payload execution success", "Payloads that reached the proof threshold ÷ payloads scored.", "That the target was exploited. Detection is not proof."],
  ["Payload improvement", "Methods that beat the fixed seed set ÷ methods that produced payloads.", "Anything about the final review score."],
  ["Method selection accuracy", "1 when the first method reached the threshold, otherwise 0.", "How close the next best method came."],
  ["Adaptation", "1 when a later method reached the threshold after the first fell short.", "How many method changes it took."],
  ["Guardrail activation", "Guardrail activations ÷ attempts.", "Whether the attempt would have succeeded without the guardrail."],
  ["Attempts to success", "Average attempts before the first proven success.", "The price of the failed attempts. Unavailable is not zero."],
  ["Full exploit / chain-enabled exploit", "Reviews only: components that reached the threshold.", "That the run finished."],
  ["Invalid JSON / fallback rates", "Failed or fallback responses ÷ model responses.", "Why the model produced them."],
  ["Consistency", "The recorded reading, or the average of the readings that are available.", "A value for the readings that are missing."],
  ["Tokens / calls / cost", "Recorded usage and call counts. Cost needs a price.", "Speed or quality. Provider performance is not an experiment result."],
  ["Token cost per success", "Recorded cost per proven success.", "A cost when pricing is missing. It is never inferred from an empty value."],
];

const readings = [
  ["0", "A real zero. It counts, and it moves an average."],
  ["Unavailable", "No value. Never a zero, and never part of a mean."],
  ["Average", "Only over available readings; the number of missing ones stays visible."],
];

type ReferenceTableProps = {
  headers: string[];
  rows: string[][];
  /** The label column is a vocabulary of codes, so it reads as code. */
  codeColumn?: boolean;
};

function ReferenceTable({ headers, rows, codeColumn = false }: ReferenceTableProps) {
  return (
    <div className={`table-container ${styles.table}`} tabIndex={0} role="region" aria-label={headers.join(", ")}>
      <table className="data-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((value, index) =>
                index === 0 ? (
                  <th scope="row" key={index}>
                    {codeColumn ? <code>{value}</code> : value}
                  </th>
                ) : (
                  <td key={index} data-label={headers[index]}>
                    {value}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GuideSection({
  id,
  title,
  deck,
  children,
}: {
  id: string;
  title: string;
  deck: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`help-section ${styles.section}`} aria-labelledby={`${id}-heading`}>
      <div className={styles.heading}>
        <div>
          <h2 id={`${id}-heading`}>{title}</h2>
          <p className={`helper-copy ${styles.deck}`}>{deck}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function HelpPage() {
  return (
    <article className={`help-page ${styles.page}`}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Observer guide</h1>
          <p className="page-description">Read the execution, judge the evidence, and keep uncertainty visible.</p>
        </div>
      </header>

      <div className={styles.layout}>
        <GuideContents sections={SECTIONS} />

        <div className={styles.document}>
          <GuideSection
            id="status"
            title="Execution is not security outcome"
            deck="Two axes, read separately. A finished run can establish no finding; a stopped run can still retain one."
          >
            <ReferenceTable headers={["Execution", "What it means"]} rows={execution} />
            <ReferenceTable
              headers={["Security outcome", "What it establishes", "Do not conclude"]}
              rows={outcomes}
              codeColumn
            />
            <p className="notice">
              Unknown is not a fifth outcome. It marks evidence that is missing or cannot be attributed, and it is never
              counted as a finding.
            </p>
          </GuideSection>

          <GuideSection
            id="coverage"
            title="Coverage: name the denominator"
            deck="Every count answers a different question. Read what population it counts before you read the number."
          >
            <ReferenceTable headers={["Count", "What it counts"]} rows={coverage} />
            <p className="helper-copy">
              Counts describe the population they were recorded in. Counts from different populations are read
              separately, never added together.
            </p>
          </GuideSection>

          <GuideSection
            id="scores"
            title="One formula, separate score origins"
            deck="Five weighted components make one formula. Who produced the score, and whether it is final, are two further questions."
          >
            <ReferenceTable headers={["Score origin", "What it is", "When it is final"]} rows={origins} />
            <ReferenceTable headers={["Component", "Weight", "What it measures"]} rows={components} codeColumn />
            <div className={styles.formula} dangerouslySetInnerHTML={{ __html: scoringFormula }} />
            <p>
              <strong>Illustrative payload mean:</strong> eligible scores 2, 3 and 4 average to 3. A candidate still
              ungraded, or a component with no evidence, keeps the whole final score pending.
            </p>
            <ReferenceTable headers={["State", "How to read it"]} rows={states} />
          </GuideSection>

          <GuideSection
            id="metrics"
            title="Metric dictionary"
            deck="A metric is a fraction with a population. Read what is counted, then read what the number cannot say."
          >
            <ReferenceTable headers={["Metric", "How it is counted", "What it does not tell you"]} rows={metrics} />
            <ReferenceTable headers={["Reading", "How to read it"]} rows={readings} />
          </GuideSection>

          <GuideSection
            id="evidence"
            title="Follow a conclusion back to its evidence"
            deck="Every figure above belongs to an artifact. The chain from a score to its proof is four steps long."
          >
            <EvidenceWalkthrough />
            <p>
              Use Inspect on an evidence record or a score to open it: the drawer holds the related records and the
              structured data behind the value. A redacted copy you download has its own hash; the original hash
              identifies the artifact the conclusion came from.
            </p>
          </GuideSection>

          <GuideSection
            id="workspace"
            title="Observe and control the experiment"
            deck="Where each part of the record lives, and what stays read-only."
          >
            <ul className={styles.list}>
              <li>
                <Link href="/">Live monitor</Link>: the run in progress, the model stream, the graph, and the complete
                paged activity journal. Each matrix child keeps its own identity and findings.
              </li>
              <li>
                <Link href="/results">Results</Link>: saved artifacts by default; switch availability to inspect every
                identity. Search and filters query what is recorded, not only the page you have loaded.
              </li>
              <li>
                The graph shows captured topology. A focus path needs a recorded node, and traversing the graph is not
                verifier proof.
              </li>
              <li>
                Comfortable tables wrap their metadata; Compact tables keep one line per scan. Inspect always retains
                the complete record.
              </li>
              <li>
                The bundled demo replays a fixture only. Verifying it proves the viewer works, not that a run succeeded.
              </li>
              <li>
                Escape closes drawers and expanded graphs, and every panel is reachable by keyboard. Reduced motion keeps
                all of the information.
              </li>
              <li>
                <Link href="/control">Control</Link> launches and cancels experiments after you review the request;{" "}
                <Link href="/settings">Settings</Link> edits the profile those runs use. Only this machine can change
                anything unless the workspace owner has allowed another host. A source that is missing stays visibly
                unavailable.
              </li>
            </ul>
          </GuideSection>
        </div>
      </div>
    </article>
  );
}
