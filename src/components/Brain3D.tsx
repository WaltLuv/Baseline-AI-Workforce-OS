"use client";

/**
 * The 3D Brain — the signature view of everything this machine remembers.
 *
 * WebGL force graph (three + react-force-graph-3d) loaded only on this tab via
 * next/dynamic, so no other page pays for the bundle. Node colour = kind;
 * status overrides it: stale glows amber, missing glows red. The data comes
 * from /api/memory/brain and nothing else.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import ForceGraph3D, { type ForceGraphMethods } from "react-force-graph-3d";
import SpriteText from "three-spritetext";
import * as THREE from "three";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { BrainGraph, BrainNode } from "@/lib/brain.server";

const KIND_COLOR: Record<string, string> = {
  hub: "#e0b184",
  workspace: "#a78bfa",
  note: "#d8cfc2",
  decision: "#4ade80",
  session: "#22d3ee",
  skill: "#a3e635",
  vector_store: "#fb7185",
  notion: "#f4efe6",
};
const STALE = "#f5b14c";
const MISSING = "#ef5a5a";

function colorOf(n: BrainNode): string {
  if (n.status === "missing") return MISSING;
  if (n.status === "stale") return STALE;
  return KIND_COLOR[n.kind] ?? "#d8cfc2";
}

export default function Brain3D({
  graph,
  height = 560,
  onSelect,
}: {
  graph: BrainGraph;
  height?: number;
  onSelect?: (node: BrainNode) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<ForceGraphMethods<any, any> | undefined>(undefined);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    // Bloom is what makes it a brain instead of a scatter plot.
    const fg = fgRef.current;
    if (!fg) return;
    try {
      const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 1.4, 0.6, 0.1);
      fg.postProcessingComposer().addPass(bloom);
    } catch {
      /* no WebGL post-processing — the graph still renders */
    }
    // run once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nodeObject = useCallback((node: object) => {
    const n = node as BrainNode & { x?: number };
    const group = new THREE.Group();
    const geometry = new THREE.SphereGeometry(Math.max(2, n.size * 0.55), 16, 16);
    const material = new THREE.MeshLambertMaterial({
      color: colorOf(n),
      transparent: true,
      opacity: n.status === "missing" ? 0.55 : 0.92,
    });
    group.add(new THREE.Mesh(geometry, material));
    if (n.kind === "hub" || n.kind === "workspace" || n.kind === "vector_store") {
      const label = new SpriteText(n.label, n.kind === "hub" ? 5 : 3.4, colorOf(n));
      label.position.y = n.size * 0.55 + 5;
      group.add(label);
    }
    return group;
  }, []);

  return (
    <div ref={wrapRef} className="overflow-hidden rounded-xl border border-[var(--line)]" style={{ height }}>
      <ForceGraph3D
        ref={fgRef}
        width={width}
        height={height}
        graphData={{ nodes: graph.nodes.map((n) => ({ ...n })), links: graph.links.map((l) => ({ ...l })) }}
        backgroundColor="#0d0a12"
        nodeThreeObject={nodeObject}
        nodeLabel={(node: object) => {
          const n = node as BrainNode;
          return `<div style="font-family:ui-monospace,monospace;font-size:11px;padding:2px 4px">${n.label}<br/><span style="opacity:.65">${n.kind} · ${n.status}${n.detail ? ` · ${n.detail}` : ""}</span></div>`;
        }}
        linkColor={(link: object) => {
          const l = link as { kind?: string };
          return l.kind === "wikilink" ? "rgba(167,139,250,0.5)" : l.kind === "cross" ? "rgba(251,113,133,0.45)" : "rgba(224,177,132,0.22)";
        }}
        linkWidth={(link: object) => ((link as { kind?: string }).kind === "core" ? 1.2 : 0.5)}
        onNodeClick={(node: object) => onSelect?.(node as BrainNode)}
        showNavInfo={false}
        warmupTicks={60}
        cooldownTicks={140}
      />
    </div>
  );
}
