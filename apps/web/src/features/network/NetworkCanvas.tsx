import { toPng } from 'html-to-image';
import {
  AlertTriangle,
  Check,
  Download,
  Maximize2,
  Network as NetworkIcon,
  Redo2,
  Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactFlow, {
  Background,
  BaseEdge,
  Controls,
  getSmoothStepPath,
  Handle,
  MarkerType,
  MiniMap,
  NodeResizer,
  Panel,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type {
  NetworkConnection,
  NetworkDevice,
  NetworkMap,
  NetworkZone,
  SaveMapLayoutInput,
} from '@nis2/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { downloadBlob } from '@/lib/download';
import { cn } from '@/lib/cn';
import { DeviceTypeIcon } from './device-visuals';

interface DeviceNodeData {
  device: NetworkDevice;
}

interface ZoneNodeData {
  zone: NetworkZone;
}

type NetworkFlowNode = Node<DeviceNodeData | ZoneNodeData>;

const DEVICE_WIDTH = 190;
const DEVICE_HEIGHT = 82;
const DEFAULT_ZONE_BOUNDS = { x: 0, y: 0, width: 620, height: 440 };
const NODE_TYPES: NodeTypes = { device: DeviceNode, zone: ZoneNode };

function isDeviceNode(node: NetworkFlowNode): node is Node<DeviceNodeData> {
  return node.type === 'device';
}

function isZoneNode(node: NetworkFlowNode): node is Node<ZoneNodeData> {
  return node.type === 'zone';
}

export function NetworkCanvas(props: {
  map: NetworkMap;
  selectedDeviceId: string | null;
  onSelectDevice: (device: NetworkDevice | null) => void;
  onSelectConnection: (connection: NetworkConnection | null) => void;
  onSelectZone: (zone: NetworkZone | null) => void;
  onSaveLayout: (layout: SaveMapLayoutInput) => Promise<void>;
  onCreateConnection: (sourceDeviceId: string, targetDeviceId: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  return (
    <ReactFlowProvider>
      <NetworkCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function NetworkCanvasInner({
  map,
  selectedDeviceId,
  onSelectDevice,
  onSelectConnection,
  onSelectZone,
  onSaveLayout,
  onCreateConnection,
  onError,
}: {
  map: NetworkMap;
  selectedDeviceId: string | null;
  onSelectDevice: (device: NetworkDevice | null) => void;
  onSelectConnection: (connection: NetworkConnection | null) => void;
  onSelectZone: (zone: NetworkZone | null) => void;
  onSaveLayout: (layout: SaveMapLayoutInput) => Promise<void>;
  onCreateConnection: (sourceDeviceId: string, targetDeviceId: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { fitView, getNodes } = useReactFlow<DeviceNodeData | ZoneNodeData>();
  const [nodes, setNodes, onNodesChange] = useNodesState<DeviceNodeData | ZoneNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const previousAudit = useRef<string | null>(null);
  const zoneDrag = useRef<{
    zoneId: string;
    oldBounds: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const connectStart = useRef<string | null>(null);
  const resizeActive = useRef(false);
  const [exporting, setExporting] = useState(false);
  const [past, setPast] = useState<NetworkFlowNode[][]>([]);
  const [future, setFuture] = useState<NetworkFlowNode[][]>([]);

  useEffect(() => {
    setNodes(buildNodes(map, selectedDeviceId));
    setEdges(buildEdges(map));
    if (previousAudit.current !== map.audit.id) {
      previousAudit.current = map.audit.id;
      window.setTimeout(() => {
        void fitView({ padding: 0.15, duration: 300 });
      }, 50);
    }
  }, [fitView, map, selectedDeviceId, setEdges, setNodes]);

  const persistLayout = useCallback(
    async (nextNodes: NetworkFlowNode[]) => {
      const zoneNodes = nextNodes.filter(isZoneNode);
      const deviceNodes = nextNodes.filter(isDeviceNode);
      const layout: SaveMapLayoutInput = {
        devices: deviceNodes.map((node) => ({
          id: node.data.device.id,
          position: { x: node.position.x, y: node.position.y },
          zoneId: node.data.device.zoneId,
        })),
        zones: zoneNodes.map((node) => ({
          id: node.data.zone.id,
          bounds: {
            x: node.position.x,
            y: node.position.y,
            width: nodeSize(node, 'width', node.data.zone.bounds?.width ?? 620),
            height: nodeSize(node, 'height', node.data.zone.bounds?.height ?? 440),
          },
        })),
      };
      try {
        await onSaveLayout(layout);
      } catch {
        onError(t('network.canvas.saveLayoutError'));
      }
    },
    [onError, onSaveLayout, t],
  );

  const pushHistory = useCallback(() => {
    setPast((current) => [...current.slice(-49), cloneNodes(getNodes())]);
    setFuture([]);
  }, [getNodes]);

  const undo = useCallback(async () => {
    const previous = past[past.length - 1];
    if (!previous) return;
    setPast(past.slice(0, -1));
    setFuture([cloneNodes(getNodes()), ...future]);
    setNodes(previous);
    await persistLayout(previous);
  }, [future, getNodes, past, persistLayout, setNodes]);

  const redo = useCallback(async () => {
    const next = future[0];
    if (!next) return;
    setFuture(future.slice(1));
    setPast([...past, cloneNodes(getNodes())]);
    setNodes(next);
    await persistLayout(next);
  }, [future, getNodes, past, persistLayout, setNodes]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const resizing = changes.some((change) => change.type === 'dimensions' && change.resizing);
      if (resizing && !resizeActive.current) {
        resizeActive.current = true;
        pushHistory();
      }
      onNodesChange(changes);
      const resizeFinished = changes.some(
        (change) => change.type === 'dimensions' && change.resizing === false,
      );
      if (resizeFinished && resizeActive.current) {
        resizeActive.current = false;
        window.setTimeout(() => {
          void persistLayout(getNodes());
        }, 0);
      }
    },
    [getNodes, onNodesChange, persistLayout, pushHistory],
  );

  const handleNodeDragStop = useCallback(
    (event: React.MouseEvent, node: NetworkFlowNode) => {
      const currentNodes = getNodes();
      if (isZoneNode(node)) {
        const activeDrag = zoneDrag.current;
        zoneDrag.current = null;
        if (!activeDrag) return;
        const newBounds = {
          x: node.position.x,
          y: node.position.y,
          width: nodeSize(node, 'width', activeDrag.oldBounds.width),
          height: nodeSize(node, 'height', activeDrag.oldBounds.height),
        };
        const dx = newBounds.x - activeDrag.oldBounds.x;
        const dy = newBounds.y - activeDrag.oldBounds.y;
        if (dx === 0 && dy === 0) return;
        const nextNodes = currentNodes.map((candidate) => {
          if (!isDeviceNode(candidate) || candidate.data.device.zoneId !== activeDrag.zoneId) {
            return candidate;
          }
          return {
            ...candidate,
            position: { x: candidate.position.x + dx, y: candidate.position.y + dy },
          };
        });
        setNodes(nextNodes);
        void persistLayout(nextNodes);
        return;
      }

      if (!isDeviceNode(node)) return;
      const deviceCenter = {
        x: node.position.x + DEVICE_WIDTH / 2,
        y: node.position.y + DEVICE_HEIGHT / 2,
      };
      const targetZone = currentNodes.filter(isZoneNode).find((zoneNode) => {
        const bounds = {
          x: zoneNode.position.x,
          y: zoneNode.position.y,
          width: nodeSize(zoneNode, 'width', zoneNode.data.zone.bounds?.width ?? 620),
          height: nodeSize(zoneNode, 'height', zoneNode.data.zone.bounds?.height ?? 440),
        };
        return (
          deviceCenter.x >= bounds.x &&
          deviceCenter.x <= bounds.x + bounds.width &&
          deviceCenter.y >= bounds.y &&
          deviceCenter.y <= bounds.y + bounds.height
        );
      });
      const zoneId = targetZone?.data.zone.id ?? null;
      const nextNodes = currentNodes.map((candidate) => {
        if (!isDeviceNode(candidate)) return candidate;
        if (candidate.id !== node.id) return candidate;
        return {
          ...candidate,
          data: { device: { ...candidate.data.device, zoneId } },
        };
      });
      setNodes(nextNodes);
      void persistLayout(nextNodes);
    },
    [getNodes, persistLayout, setNodes],
  );

  const handleNodeDragStart = useCallback(
    (_event: React.MouseEvent, node: NetworkFlowNode) => {
      pushHistory();
      if (!isZoneNode(node)) return;
      zoneDrag.current = {
        zoneId: node.data.zone.id,
        oldBounds: {
          x: node.position.x,
          y: node.position.y,
          width: nodeSize(node, 'width', node.data.zone.bounds?.width ?? 620),
          height: nodeSize(node, 'height', node.data.zone.bounds?.height ?? 440),
        },
      };
    },
    [pushHistory],
  );

  const handleConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const startedAt = connectStart.current;
      connectStart.current = null;
      // React Flow reports the node with the source handle as "source". If the
      // user started on the target handle, reverse the pair so the arrow always
      // points from the device they picked up to the device they dropped on.
      const source = startedAt === connection.target ? connection.target : connection.source;
      const target = startedAt === connection.target ? connection.source : connection.target;
      if (source === target) return;
      try {
        await onCreateConnection(source, target);
      } catch {
        onError(t('network.canvas.connectError'));
      }
    },
    [onCreateConnection, onError, t],
  );

  const handleExport = async () => {
    const element = wrapperRef.current?.querySelector('.react-flow') as HTMLElement | null;
    if (!element) return;
    setExporting(true);
    try {
      const dark = document.documentElement.classList.contains('dark');
      const dataUrl = await toPng(element, {
        backgroundColor: dark ? '#0f172a' : '#f8fafc',
        pixelRatio: 2,
        filter: (candidate) => !candidate.classList?.contains('react-flow__panel'),
      });
      const blob = await (await fetch(dataUrl)).blob();
      downloadBlob(blob, `network-${map.audit.period.replace(/[^\w-]+/g, '-')}.png`);
    } catch {
      onError(t('network.canvas.exportError'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      ref={wrapperRef}
      className="relative h-[min(74vh,880px)] min-h-[480px] overflow-hidden rounded-xl border border-border bg-card"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_event, node) => {
          if (isDeviceNode(node)) {
            onSelectDevice(node.data.device);
            onSelectZone(null);
          } else if (isZoneNode(node)) {
            onSelectDevice(null);
            onSelectZone(node.data.zone);
          }
        }}
        onEdgeClick={(_event, edge) => {
          const connection = map.connections.find((candidate) => candidate.id === edge.id);
          if (connection) onSelectConnection(connection);
        }}
        onPaneClick={() => {
          onSelectDevice(null);
          onSelectConnection(null);
          onSelectZone(null);
        }}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        onConnectStart={(_event, params) => {
          connectStart.current = params.nodeId ?? null;
        }}
        onConnect={handleConnect}
        snapToGrid
        snapGrid={[20, 20]}
        deleteKeyCode={null}
        minZoom={0.25}
        maxZoom={1.8}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { strokeWidth: 2 },
          zIndex: 1,
        }}
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) => {
            if (isZoneNode(node as NetworkFlowNode)) {
              return (node.data as ZoneNodeData).zone.color ?? '#94a3b8';
            }
            return '#2563eb';
          }}
          maskColor="rgb(15 23 42 / 0.08)"
        />
        <Panel position="top-right" className="!m-3">
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void undo()}
              disabled={past.length === 0}
              title={t('network.canvas.undo')}
              aria-label={t('network.canvas.undo')}
            >
              <Undo2 className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void redo()}
              disabled={future.length === 0}
              title={t('network.canvas.redo')}
              aria-label={t('network.canvas.redo')}
            >
              <Redo2 className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleExport()}
              disabled={exporting}
            >
              <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {exporting ? t('network.canvas.exporting') : t('network.canvas.exportPng')}
            </Button>
          </div>
        </Panel>
        <Panel position="top-left" className="!m-3">
          <Badge variant="primary" className="bg-card/95 shadow-sm">
            <NetworkIcon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            {t('network.canvas.deviceCount', { count: map.devices.length })}
          </Badge>
        </Panel>
        {map.devices.length === 0 ? (
          <Panel position="bottom-center" className="!mb-4">
            <div className="pointer-events-none rounded-lg border border-border bg-card/95 px-4 py-3 text-sm text-muted-foreground shadow-sm">
              <span className="flex items-center gap-2">
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
                {t('network.canvas.empty')}
              </span>
            </div>
          </Panel>
        ) : null}
      </ReactFlow>
    </div>
  );
}

function DeviceNode({ data, selected }: NodeProps<DeviceNodeData>) {
  const { t } = useTranslation();
  const { device } = data;
  const complete = device.informationComplete;
  const risk = device.riskCodes.length > 0;
  return (
    <div
      className={cn(
        'relative flex h-full w-full items-start gap-2.5 rounded-lg border-2 bg-card p-3 text-left shadow-sm transition-shadow',
        selected ? 'border-primary-500 shadow-md' : 'border-border',
        complete && !risk && 'border-success-500/70',
        complete && risk && 'border-warning-500/70',
      )}
      style={{ width: DEVICE_WIDTH, height: DEVICE_HEIGHT }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-background !bg-primary-600"
      />
      <div className="rounded-md bg-primary-50 p-1.5 text-primary-700 dark:bg-primary-500/15 dark:text-primary-200">
        <DeviceTypeIcon type={device.type} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{device.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {device.ipAddresses[0] ?? t('network.device.noIp')}
        </p>
        <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
          {device.macAddress ?? t('network.device.noMac')}
        </p>
      </div>
      <div
        className={cn(
          'absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-background px-1 text-[10px] font-bold text-white shadow-sm',
          complete && risk ? 'bg-warning-500' : complete ? 'bg-success-600' : 'bg-neutral-500',
        )}
        title={t(
          complete
            ? risk
              ? 'network.device.completeWithRisk'
              : 'network.device.complete'
            : 'network.device.completeness',
          { value: device.completeness },
        )}
      >
        {complete ? (
          risk ? (
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          )
        ) : (
          `${device.completeness}%`
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-2 !border-background !bg-primary-600"
      />
    </div>
  );
}

function ZoneNode({ data, selected }: NodeProps<ZoneNodeData>) {
  const color = data.zone.color ?? '#94a3b8';
  return (
    <div
      className={cn(
        'h-full w-full rounded-xl border-2 border-dashed',
        selected && 'ring-2 ring-ring ring-offset-2',
      )}
      style={{
        borderColor: `${color}88`,
        backgroundColor: `${color}14`,
      }}
    >
      <NodeResizer
        minWidth={180}
        minHeight={120}
        isVisible={selected}
        lineClassName="!border-primary-500"
        handleClassName="!h-3 !w-3 !rounded-sm !border-2 !border-background !bg-primary-600"
      />
      <div
        className="inline-flex items-center rounded-br-lg rounded-tl-xl px-3 py-1.5 text-xs font-semibold"
        style={{ backgroundColor: `${color}22`, color }}
      >
        {data.zone.name}
      </div>
    </div>
  );
}

function NetworkEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
}: EdgeProps) {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });
  return <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />;
}

const EDGE_TYPES = { network: NetworkEdge };

function cloneNodes(nodes: NetworkFlowNode[]): NetworkFlowNode[] {
  return nodes.map((node) => ({
    ...node,
    position: { ...node.position },
    data: { ...node.data },
  }));
}

function buildNodes(map: NetworkMap, selectedDeviceId: string | null): NetworkFlowNode[] {
  const zoneNodes: NetworkFlowNode[] = map.zones.map((zone) => {
    const bounds = zone.bounds ?? DEFAULT_ZONE_BOUNDS;
    return {
      id: `zone-${zone.id}`,
      type: 'zone',
      position: { x: bounds.x, y: bounds.y },
      style: { width: bounds.width, height: bounds.height },
      data: { zone },
      draggable: true,
      selectable: true,
      zIndex: 0,
    };
  });
  const deviceNodes: NetworkFlowNode[] = map.devices.map((device, index) => ({
    id: device.id,
    type: 'device',
    position: device.position ?? {
      x: 80 + (index % 4) * 240,
      y: 80 + Math.floor(index / 4) * 180,
    },
    data: { device },
    selected: device.id === selectedDeviceId,
    zIndex: 10,
  }));
  return [...zoneNodes, ...deviceNodes];
}

function buildEdges(map: NetworkMap): Edge[] {
  return map.connections.map((connection) => ({
    id: connection.id,
    source: connection.sourceDeviceId,
    target: connection.targetDeviceId,
    type: 'network',
    label: edgeLabel(connection),
    labelBgPadding: [4, 2],
    labelBgBorderRadius: 4,
    style: { stroke: 'hsl(var(--primary-600))', strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--primary-600))' },
  }));
}

function edgeLabel(connection: NetworkConnection): string {
  const parts: string[] = [connection.type];
  if (connection.speedMbps) parts.push(`${connection.speedMbps} Mbps`);
  if (connection.vlan !== null) parts.push(`VLAN ${connection.vlan}`);
  return parts.join(' · ');
}

function nodeSize(node: NetworkFlowNode, dimension: 'width' | 'height', fallback: number): number {
  const measured = dimension === 'width' ? node.width : node.height;
  if (typeof measured === 'number' && measured > 0) return measured;
  const styled = node.style?.[dimension];
  if (typeof styled === 'number') return styled;
  return fallback;
}

export { EDGE_TYPES };
