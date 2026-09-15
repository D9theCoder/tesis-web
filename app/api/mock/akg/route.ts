import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { load } from "js-yaml";
import { createAkgMockSimulation } from "@/lib/akg-mock";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function runSeed(): Promise<NextResponse> {
  try {
    const seedPath = path.join(process.cwd(), "data", "akg-simulation.yaml");
    const source = await readFile(seedPath, "utf8");
    const seed = load(source);
    const simulation = createAkgMockSimulation(seed);
    return NextResponse.json(simulation, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unable to load AKG simulation seed";
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  return runSeed();
}

export async function POST(): Promise<NextResponse> {
  return runSeed();
}
