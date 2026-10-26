"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./guide-contents.module.css";

export type GuideSection = { id: string; label: string };

/**
 * The guide's own wayfinding: a rail beside the document on wide screens, a
 * sticky strip above it on phones. It tracks the section being read so a long
 * read never loses its place, and it stays a plain list of anchors without JS.
 */
export function GuideContents({ sections }: { sections: GuideSection[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const targets = sections
      .map((section) => document.getElementById(section.id))
      .filter((element): element is HTMLElement => element !== null);
    if (targets.length === 0) return;

    // The section being read is the last one whose heading has passed the line
    // under the sticky chrome. Reading positions beats intersection bands here:
    // several sections can be on screen at once, and only one is being read.
    let frame = 0;
    const measure = () => {
      frame = 0;
      let current = sections[0]?.id ?? "";
      for (const target of targets) {
        if (target.getBoundingClientRect().top <= 140) current = target.id;
      }
      // The last section cannot always reach the reading line: at the end of the
      // document the reader is in it, so it takes the marker.
      const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
      if (atEnd) current = targets[targets.length - 1].id;
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sections]);

  useEffect(() => {
    const list = listRef.current;
    const link = list?.querySelector<HTMLElement>(`a[href="#${active}"]`);
    if (!list || !link || list.scrollWidth <= list.clientWidth) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollTo({ left: Math.max(0, link.offsetLeft - 16), behavior: reduce ? "auto" : "smooth" });
  }, [active]);

  return (
    <nav className={styles.contents} aria-label="Guide sections">
      <p className={`helper-copy ${styles.label}`}>On this page</p>
      <ol className={styles.list} ref={listRef}>
        {sections.map((section) => (
          <li key={section.id} className={styles.item}>
            <a
              className={styles.link}
              href={`#${section.id}`}
              aria-current={active === section.id ? "location" : undefined}
            >
              {section.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
