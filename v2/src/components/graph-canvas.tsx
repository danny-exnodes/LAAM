"use client";

import { ReactFlow, Background, Controls, MiniMap, Position } from "@xyflow/react";
import type { Node, Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

export function GraphCanvas({
  nodes,
  edges,
}: {
  nodes: Node[];
  edges: Edge[];
}) {
  // Horizontal layout: edges leave the right side and enter the left side.
  const positioned = nodes.map((n) => ({
    ...n,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  }));
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={positioned}
        edges={edges}
        fitView
        minZoom={0.2}
        nodesDraggable={false}
        nodesConnectable={false}
      >
        <Background />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}
