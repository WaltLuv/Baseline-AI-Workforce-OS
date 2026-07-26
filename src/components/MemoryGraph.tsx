"use client";

import { useEffect, useRef, useState } from "react";
import type { MemoryGraph as Graph } from "@/lib/memory";

interface Sim {
  id: string;
  label: string;
  group: string;
  r: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const PALETTE = ["#e0b184", "#a78bfa", "#4ade80", "#22d3ee", "#fb7185", "#fbbf24", "#60a5fa", "#f0abfc"];

/**
 * A force-directed view of the note graph, drawn on a canvas.
 *
 * Written by hand rather than pulled from a graph library: it keeps the app
 * dependency-free and offline, and the simulation only needs to be good enough
 * to read the shape of a few hundred notes.
 */
export default function MemoryGraph({ graph, onSelect }: { graph: Graph; onSelect?: (id: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const stateRef = useRef<{ nodes: Sim[]; drag: Sim | null; pointer: { x: number; y: number } | null }>({
    nodes: [],
    drag: null,
    pointer: null,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const groups = [...new Set(graph.nodes.map((n) => n.group))];
    const colourOf = (g: string) => PALETTE[Math.max(0, groups.indexOf(g)) % PALETTE.length];

    // Seed positions on a circle so the layout unfolds instead of exploding.
    const nodes: Sim[] = graph.nodes.map((n, i) => {
      const angle = (i / Math.max(1, graph.nodes.length)) * Math.PI * 2;
      const radius = 120 + (i % 7) * 26;
      return {
        id: n.id,
        label: n.label,
        group: n.group,
        r: Math.max(3.5, Math.min(13, n.size * 0.45)),
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
      };
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links = graph.links
      .map((l) => ({ s: byId.get(l.source), t: byId.get(l.target), kind: l.kind }))
      .filter((l): l is { s: Sim; t: Sim; kind: "wikilink" | "folder" } => Boolean(l.s && l.t));
    stateRef.current.nodes = nodes;

    let raf = 0;
    let alpha = 1;
    let width = 0;
    let height = 0;

    function resize() {
      const parent = canvas!.parentElement;
      if (!parent) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = parent.clientWidth;
      height = parent.clientHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    function step() {
      const { drag, pointer } = stateRef.current;

      // Repulsion — O(n²) is fine at this scale and keeps the code readable.
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) {
            dx = (Math.random() - 0.5) * 2;
            dy = (Math.random() - 0.5) * 2;
            d2 = 1;
          }
          if (d2 > 90_000) continue;
          const force = (900 * alpha) / d2;
          const d = Math.sqrt(d2);
          a.vx -= (dx / d) * force;
          a.vy -= (dy / d) * force;
          b.vx += (dx / d) * force;
          b.vy += (dy / d) * force;
        }
      }

      // Springs
      for (const l of links) {
        const dx = l.t.x - l.s.x;
        const dy = l.t.y - l.s.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const force = ((d - 74) * 0.011 * alpha);
        l.s.vx += (dx / d) * force;
        l.s.vy += (dy / d) * force;
        l.t.vx -= (dx / d) * force;
        l.t.vy -= (dy / d) * force;
      }

      for (const n of nodes) {
        n.vx -= n.x * 0.0016 * alpha;
        n.vy -= n.y * 0.0016 * alpha;
        n.vx *= 0.86;
        n.vy *= 0.86;
        if (n !== drag) {
          n.x += n.vx;
          n.y += n.vy;
        }
      }
      alpha = Math.max(0.06, alpha * 0.995);

      // Draw
      ctx!.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;

      ctx!.lineWidth = 1;
      for (const l of links) {
        ctx!.strokeStyle = l.kind === "folder" ? "rgba(244,239,230,0.05)" : "rgba(224,177,132,0.16)";
        ctx!.beginPath();
        ctx!.moveTo(cx + l.s.x, cy + l.s.y);
        ctx!.lineTo(cx + l.t.x, cy + l.t.y);
        ctx!.stroke();
      }

      let hovered: Sim | null = null;
      for (const n of nodes) {
        const px = cx + n.x;
        const py = cy + n.y;
        const near = pointer && Math.hypot(pointer.x - px, pointer.y - py) < n.r + 6;
        if (near) hovered = n;
        const colour = colourOf(n.group);
        ctx!.beginPath();
        ctx!.arc(px, py, n.r, 0, Math.PI * 2);
        ctx!.fillStyle = colour;
        ctx!.globalAlpha = near ? 1 : 0.82;
        ctx!.fill();
        ctx!.globalAlpha = 1;
        if (near) {
          ctx!.strokeStyle = "rgba(255,255,255,0.75)";
          ctx!.lineWidth = 1.5;
          ctx!.stroke();
        }
      }

      if (hovered) {
        const px = cx + hovered.x;
        const py = cy + hovered.y;
        ctx!.font = "12px ui-sans-serif, system-ui, sans-serif";
        const text = hovered.label.slice(0, 44);
        const w = ctx!.measureText(text).width;
        ctx!.fillStyle = "rgba(13,10,18,0.92)";
        ctx!.fillRect(px + 10, py - 12, w + 14, 22);
        ctx!.strokeStyle = "rgba(244,239,230,0.14)";
        ctx!.lineWidth = 1;
        ctx!.strokeRect(px + 10, py - 12, w + 14, 22);
        ctx!.fillStyle = "#f4efe6";
        ctx!.fillText(text, px + 17, py + 3);
      }
      setHover((prev) => (hovered?.id ?? null) === prev ? prev : (hovered?.id ?? null));

      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);

    function pointFrom(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function onMove(e: PointerEvent) {
      const p = pointFrom(e);
      stateRef.current.pointer = p;
      const drag = stateRef.current.drag;
      if (drag) {
        drag.x = p.x - width / 2;
        drag.y = p.y - height / 2;
        alpha = Math.max(alpha, 0.35);
      }
    }
    function onDown(e: PointerEvent) {
      const p = pointFrom(e);
      const cx = width / 2;
      const cy = height / 2;
      const hit = nodes.find((n) => Math.hypot(cx + n.x - p.x, cy + n.y - p.y) < n.r + 6);
      if (hit) {
        stateRef.current.drag = hit;
        canvas!.setPointerCapture(e.pointerId);
      }
    }
    function onUp(e: PointerEvent) {
      const drag = stateRef.current.drag;
      if (drag && onSelect) onSelect(drag.id);
      stateRef.current.drag = null;
      try { canvas!.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    }
    function onLeave() {
      stateRef.current.pointer = null;
    }

    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [graph, onSelect]);

  return (
    <div className="relative h-[540px] w-full overflow-hidden rounded-b-[13px]">
      <canvas ref={canvasRef} className="block h-full w-full cursor-grab active:cursor-grabbing" />
      <div className="pointer-events-none absolute bottom-3 left-4 text-[10.5px] text-[var(--fg-mute)]">
        {graph.nodes.length} nodes · {graph.links.length} links · drag a node to pull the graph
        {hover ? " · release to open" : ""}
      </div>
    </div>
  );
}
