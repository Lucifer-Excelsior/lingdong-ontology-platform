import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow, type Connection, type Node } from "@xyflow/react";
import { api } from "../api/client";
import type { DialogId, InferredRelation, OntologyClass, OntologyProperty } from "../api/types";
import { OntologyCanvasSearchBar } from "../components/ontology/OntologyCanvasSearchBar";
import { OntologyCanvasToolbar, type CanvasFocusMode } from "../components/ontology/OntologyCanvasToolbar";
import { capturePositions, computeVisibleNodeIds, type DomainRoleFilter, type PosMap } from "../components/ontology/canvasFocusUtils";
import { getRolePermissions } from "../utils/rbac";
import { ConnectEdgeModal } from "./ConnectEdgeModal";
import { OntologyClassNode, type ClassNodeData } from "./OntologyClassNode";
import { buildGraphEdges, buildInitialNodes, COL_W, ROW_H } from "./ontologyGraphLayout";

const nodeTypes = { ontologyClass: OntologyClassNode };

interface CanvasInnerProps {
  workspaceId: string;
  revisionId?: string;
  classes: OntologyClass[];
  properties: OntologyProperty[];
  inferredRelations?: InferredRelation[];
  showInferred?: boolean;
  selectedLocalName: string;
  currentRole?: string;
  onSelectClass: (localName: string) => void;
  onOpenDialog: (dialog: DialogId) => void;
  onToast: (msg: string) => void;
}

function CanvasInner({
  workspaceId,
  revisionId,
  classes,
  properties,
  inferredRelations = [],
  showInferred = false,
  selectedLocalName,
  currentRole,
  onSelectClass,
  onToast,
}: CanvasInnerProps) {
  const queryClient = useQueryClient();
  const { fitView, zoomTo } = useReactFlow();
  const { canModel } = getRolePermissions(currentRole);
  const [connectDraft, setConnectDraft] = useState({ open: false, source: "", target: "" });
  const [focusMode, setFocusMode] = useState<CanvasFocusMode>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<DomainRoleFilter>("all");
  const [undoStack, setUndoStack] = useState<PosMap[]>([]);
  const [redoStack, setRedoStack] = useState<PosMap[]>([]);
  const dragStartPosRef = useRef<PosMap | null>(null);

  const structureKey = `${workspaceId}|${revisionId ?? ""}|${classes.map((c) => c.localName).join(",")}`;
  const lastStructureKeyRef = useRef("");

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ClassNodeData>>([]);

  useEffect(() => {
    if (lastStructureKeyRef.current !== structureKey) {
      lastStructureKeyRef.current = structureKey;
      setNodes(buildInitialNodes(classes, selectedLocalName));
      setUndoStack([]);
      setRedoStack([]);
      return;
    }
    const clsMap = new Map(classes.map((c) => [c.localName, c]));
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        data: { cls: clsMap.get(n.id) ?? n.data.cls, isSelected: n.id === selectedLocalName },
      }))
    );
  }, [structureKey, classes, selectedLocalName, setNodes]);

  const computedEdges = useMemo(
    () => buildGraphEdges(classes, properties, inferredRelations, showInferred, selectedLocalName),
    [classes, properties, inferredRelations, showInferred, selectedLocalName]
  );

  const [edges, setEdges, onEdgesChange] = useEdgesState(computedEdges);
  useEffect(() => setEdges(computedEdges), [computedEdges, setEdges]);

  const visibleNodeIds = useMemo(
    () => computeVisibleNodeIds(focusMode, classes, selectedLocalName, computedEdges, searchQuery, roleFilter),
    [focusMode, classes, selectedLocalName, computedEdges, searchQuery, roleFilter]
  );

  const visibleNodes = useMemo(
    () => (visibleNodeIds ? nodes.filter((n) => visibleNodeIds.has(n.id)) : nodes),
    [nodes, visibleNodeIds]
  );
  const visibleEdges = useMemo(
    () => (visibleNodeIds ? edges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)) : edges),
    [edges, visibleNodeIds]
  );

  const persistLayout = async (posMap: PosMap) => {
    try {
      await api.saveOntologyLayout(workspaceId, posMap);
      void queryClient.invalidateQueries({ queryKey: ["ontology", workspaceId] });
    } catch (err) {
      onToast(err instanceof Error ? err.message : "保存画布布局失败");
    }
  };

  const applyPosMap = (posMap: PosMap) => {
    setNodes((prev) => prev.map((n) => (posMap[n.id] ? { ...n, position: posMap[n.id] } : n)));
    void persistLayout(posMap);
  };

  const handleConnect = (connection: Connection) => {
    if (!canModel) return;
    if (connection.source && connection.target) {
      setConnectDraft({ open: true, source: connection.source, target: connection.target });
    }
  };

  const handleNodeDragStart = () => {
    if (!canModel) return;
    dragStartPosRef.current = capturePositions(nodes);
  };

  const handleNodeDragStop = () => {
    if (!canModel) return;
    if (dragStartPosRef.current) {
      const snap = dragStartPosRef.current;
      setUndoStack((prev) => [...prev.slice(-19), snap]);
      setRedoStack([]);
      dragStartPosRef.current = null;
    }
    void persistLayout(capturePositions(nodes));
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const target = undoStack[undoStack.length - 1];
    setRedoStack((prev) => [...prev.slice(-19), capturePositions(nodes)]);
    setUndoStack((prev) => prev.slice(0, -1));
    applyPosMap(target);
    onToast("已撤销上一步画布坐标排布");
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const target = redoStack[redoStack.length - 1];
    setUndoStack((prev) => [...prev.slice(-19), capturePositions(nodes)]);
    setRedoStack((prev) => prev.slice(0, -1));
    applyPosMap(target);
    onToast("已重做画布坐标排布");
  };

  const handleAutoLayout = () => {
    if (!canModel) return;
    setUndoStack((prev) => [...prev.slice(-19), capturePositions(nodes)]);
    setRedoStack([]);
    const posMap: PosMap = {};
    const arranged = nodes.map((n, idx) => {
      const pos = { x: (idx % 3) * COL_W + 48, y: Math.floor(idx / 3) * ROW_H + 64 };
      posMap[n.id] = pos;
      return { ...n, position: pos };
    });
    setNodes(arranged);
    void persistLayout(posMap);
    window.setTimeout(() => void fitView({ padding: 0.18, duration: 250 }), 30);
    onToast("已按网格层次自动排布全部节点并保存坐标");
  };

  return (
    <div className="flex-1 relative canvas-grid flex flex-col justify-between overflow-hidden">
      <div className="relative flex-1 w-full min-h-[560px]">
        <ReactFlow
          nodes={visibleNodes}
          edges={visibleEdges}
          nodeTypes={nodeTypes}
          nodesDraggable={canModel}
          nodesConnectable={canModel}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          onNodeDragStart={handleNodeDragStart}
          onNodeDragStop={handleNodeDragStop}
          onNodeClick={(_, node) => onSelectClass(node.id)}
          onEdgeClick={(_, edge) => {
            const full = (edge.data as { fullLabel?: string } | undefined)?.fullLabel;
            if (full) onToast(`OWL 2 EL 推理隐式边详情：${full}`);
          }}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.4}
          maxZoom={1.8}
        >
          <Background color="#e2e8f0" gap={20} size={1} />
          <MiniMap pannable zoomable position="bottom-left" className="!bg-[var(--card)] !border !border-[var(--border)] !rounded-lg" />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>

        <OntologyCanvasSearchBar
          query={searchQuery}
          roleFilter={roleFilter}
          visibleCount={visibleNodes.length}
          totalCount={classes.length}
          onChangeQuery={setSearchQuery}
          onChangeRoleFilter={(role) => { setRoleFilter(role); window.setTimeout(() => void fitView({ padding: 0.2, duration: 220 }), 30); }}
          onFocusFirstMatch={() => {
            const first = visibleNodes[0];
            if (!first) return;
            onSelectClass(first.id);
            window.setTimeout(() => void fitView({ nodes: [{ id: first.id }], padding: 0.4, duration: 240 }), 30);
          }}
        />
        <OntologyCanvasToolbar
          focusMode={focusMode} showInferred={showInferred} canModel={canModel} canUndo={undoStack.length > 0} canRedo={redoStack.length > 0}
          onChangeFocusMode={(m) => { setFocusMode(m); window.setTimeout(() => void fitView({ padding: 0.2, duration: 220 }), 30); }}
          onOpenConnect={() => setConnectDraft({ open: true, source: selectedLocalName || classes[0]?.localName || "", target: classes.find((c) => c.localName !== selectedLocalName)?.localName || classes[0]?.localName || "" })}
          onAutoLayout={handleAutoLayout} onUndo={handleUndo} onRedo={handleRedo}
          onResetZoom={() => { void zoomTo(1, { duration: 200 }); onToast("画布缩放已重置为 100%"); }}
        />
      </div>
      <ConnectEdgeModal workspaceId={workspaceId} open={connectDraft.open} classes={classes} initialSource={connectDraft.source} initialTarget={connectDraft.target} canModel={canModel} onClose={() => setConnectDraft((prev) => ({ ...prev, open: false }))} onToast={onToast} />
    </div>
  );
}

export function OntologyCanvasPane(props: CanvasInnerProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
