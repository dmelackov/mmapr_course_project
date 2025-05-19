<template>
    <div class="flex flex-col gap-4">
        <!-- Панель управления -->
        <div class="p-4 bg-white shadow-md rounded self-start flex items-center gap-3">
            <label class="font-semibold">Режим:</label>
            <SelectButton v-model="mode"
                :options="modes"
                :option-label="val => val === 'normal' ? 'Обычный' : 'Соединение'"
                class="text-sm" />
            <Button @click="createSystem">
                Создать систему
            </Button>
        </div>

        <!-- SVG холст -->
        <div class="relative w-full h-[800px] bg-gray-100 overflow-hidden">
            <svg ref="svgRef"
                class="w-full h-full"
                :viewBox="`0 0 ${width} ${height}`"
                @click="onSvgClick">
                <!-- Сетка -->
                <g class="stroke-gray-200">
                    <line v-for="x in gridLinesX"
                        :key="'x' + x"
                        :x1="x"
                        :y1="0"
                        :x2="x"
                        :y2="height" />
                    <line v-for="y in gridLinesY"
                        :key="'y' + y"
                        :x1="0"
                        :y1="y"
                        :x2="width"
                        :y2="y" />
                </g>

                <!-- Рёбра -->
                <g class="stroke-black">
                    <g v-for="edge in edges"
                        :key="edge.id">
                        <path :d="getEdgePath(edge)"
                            stroke-width="2"
                            fill="none"
                            marker-end="url(#arrow)"
                            class="cursor-pointer"
                            @click.stop="editEdge(edge)"
                            @contextmenu.prevent="removeEdge(edge)" />
                        <text :x="getEdgeMidPoint(edge).x"
                            :y="getEdgeMidPoint(edge).y - 5"
                            class="fill-black text-sm select-none"
                            text-anchor="middle">
                            {{ edge.label }}
                        </text>
                    </g>
                </g>

                <!-- Маркер стрелки -->
                <defs>
                    <marker id="arrow"
                        markerWidth="10"
                        markerHeight="10"
                        refX="10"
                        refY="5"
                        orient="auto">
                        <path d="M 0 0 L 10 5 L 0 10 z"
                            fill="#000" />
                    </marker>
                </defs>

                <!-- Узлы -->
                <g>
                    <g v-for="node in nodes"
                        :key="node.id"
                        @mousedown.stop.prevent="handleNodeClick(node, $event)">
                        <rect :x="node.x - nodeSize / 2"
                            :y="node.y - nodeSize / 2"
                            :width="nodeSize"
                            :height="nodeSize"
                            :fill="selectedNodes.includes(node) ? '#166534' : '#22c55e'"
                            class="cursor-pointer"
                            @contextmenu.prevent="removeNode(node)" />
                        <text :x="node.x"
                            :y="node.y + 5"
                            text-anchor="middle"
                            class="text-sm font-bold pointer-events-none">
                            {{ node.label }}
                        </text>
                    </g>
                </g>
            </svg>
        </div>

        <!-- Диалог редактирования -->
        <Dialog v-model:visible="showDialog"
            header="Редактировать вес ребра"
            modal>
            <div class="p-4">
                <InputText v-model="selectedEdgeLabel"
                    class="w-full" />
            </div>
        </Dialog>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import SelectButton from 'primevue/selectbutton';
import { Button } from 'primevue';
import { useFormula } from '@/stores/formulaStore';
import { ComputeEngine, type BoxedExpression } from '@cortex-js/compute-engine';

const formulaStore = useFormula()

type Mode = 'normal' | 'connect';

interface Node {
    id: number;
    x: number;
    y: number;
    label: string;
}

interface Edge {
    id: number;
    from: Node;
    to: Node;
    label: string;
}

interface Point {
    x: number;
    y: number;
}

interface Dragging {
    node: Node;
    offsetX: number;
    offsetY: number;
}

const width = 1200;
const height = 800;
const gridSize = 40;
const nodeSize = 40;
const nodes = reactive<Node[]>([]);
const edges = reactive<Edge[]>([]);
const svgRef = ref<SVGSVGElement | null>(null);

let nodeIdCounter = 1;
let edgeIdCounter = 1;
const dragging = ref<Dragging | null>(null);

const showDialog = ref(false);
const selectedEdge = ref<Edge | null>(null);

// Режимы
const mode = ref<Mode>('normal');
const modes: Mode[] = ['normal', 'connect'];
const selectedNodes = ref<Node[]>([]);

const selectedEdgeLabel = computed({
    set(val: string) {
        if (selectedEdge.value == null) return
        selectedEdge.value.label = val
    },
    get() {
        if (selectedEdge.value == null) return ""
        return selectedEdge.value.label
    }
})
// Сетка
const gridLinesX = computed<number[]>(() =>
    Array.from({ length: Math.ceil(width / gridSize) }, (_, i) => i * gridSize)
);
const gridLinesY = computed<number[]>(() =>
    Array.from({ length: Math.ceil(height / gridSize) }, (_, i) => i * gridSize)
);

// ===== Узлы =====
const wasDragging = ref(false);

function onSvgClick(e: MouseEvent) {
    if (wasDragging.value || mode.value !== 'normal' || !svgRef.value) {
        wasDragging.value = false;
        return;
    }

    const svg = svgRef.value;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const cursor = pt.matrixTransform(svg.getScreenCTM()?.inverse());

    const x = Math.round(cursor.x / gridSize) * gridSize;
    const y = Math.round(cursor.y / gridSize) * gridSize;

    const label = `S_${nodeIdCounter}`;
    nodes.push({ id: nodeIdCounter++, x, y, label });
}

function removeNode(node: Node) {
    const index = nodes.findIndex(n => n.id === node.id);
    if (index !== -1) nodes.splice(index, 1);
    for (let i = edges.length - 1; i >= 0; i--) {
        if (edges[i].from.id === node.id || edges[i].to.id === node.id) {
            edges.splice(i, 1);
        }
    }
}

// ===== Dragging =====
function startDrag(node: Node, event: MouseEvent) {
    dragging.value = {
        node,
        offsetX: event.offsetX - node.x,
        offsetY: event.offsetY - node.y
    };
    wasDragging.value = false;
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', stopDrag);
}

function onDrag(e: MouseEvent) {
    if (!dragging.value || !svgRef.value) return;
    const svg = svgRef.value;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const cursor = pt.matrixTransform(svg.getScreenCTM()?.inverse());

    const node = dragging.value.node;
    node.x = Math.round(cursor.x / gridSize) * gridSize;
    node.y = Math.round(cursor.y / gridSize) * gridSize;
    wasDragging.value = true;
}

function stopDrag() {
    dragging.value = null;
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', stopDrag);
}

// ===== Обработка клика по узлу =====
function handleNodeClick(node: Node, event: MouseEvent) {
    if (mode.value === 'normal') {
        startDrag(node, event);
    } else if (mode.value === 'connect') {
        if (selectedNodes.value.length === 0) {
            selectedNodes.value.push(node);
        } else if (selectedNodes.value.length === 1) {
            const first = selectedNodes.value[0];
            if (first.id !== node.id) {
                connectNodes(first, node);
            }
            selectedNodes.value = [];
        }
    }
}

// ===== Создание ребра с проверкой =====
function connectNodes(from: Node, to: Node) {
    const same = edges.find(e => e.from.id === from.id && e.to.id === to.id);
    const reverse = edges.find(e => e.from.id === to.id && e.to.id === from.id);

    if (same) return;
    if (reverse && from.id === to.id) return;

    edges.push({
        id: edgeIdCounter++,
        from,
        to,
        label: 'w'
    });
}

const offsetCoef = 50;

function getEdgeMidPoint(edge: Edge): Point {
    const from = edge.from;
    const to = edge.to;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance === 0) return { x: from.x, y: from.y };

    const oppositeDirection = edges.filter(
        e => e.from.id === edge.to.id && e.to.id === edge.from.id
    );

    const index = oppositeDirection.findIndex(e => e.id === edge.id);
    const offsetDirection = index - (oppositeDirection.length - 1) / 2;

    const normX = -dy / distance;
    const normY = dx / distance;
    const offsetAmount = offsetCoef * offsetDirection;

    let midX: number, midY: number;
    if (oppositeDirection.length > 0) {
        midX = (from.x + to.x) / 2 + normX * offsetAmount;
        midY = (from.y + to.y) / 2 + normY * offsetAmount;
    } else {
        midX = (from.x + to.x) / 2;
        midY = (from.y + to.y) / 2;
    }

    return { x: midX, y: midY };
}

function getEdgePath(edge: Edge): string {
    const from = edge.from;
    const to = edge.to;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return '';

    const oppositeDirection = edges.filter(
        e => e.from.id === edge.to.id && e.to.id === edge.from.id
    );

    const index = oppositeDirection.findIndex(e => e.id === edge.id);
    const offsetDirection = index - (oppositeDirection.length - 1) / 2;

    const normX = -dy / distance;
    const normY = dx / distance;
    const offsetAmount = offsetCoef * offsetDirection;

    let midX: number, midY: number;
    if (oppositeDirection.length > 0) {
        midX = (from.x + to.x) / 2 + normX * offsetAmount;
        midY = (from.y + to.y) / 2 + normY * offsetAmount;
    } else {
        midX = (from.x + to.x) / 2;
        midY = (from.y + to.y) / 2;
    }

    const ratio = (nodeSize / 2) / distance;
    const startX = from.x + dx * ratio;
    const startY = from.y + dy * ratio;
    const endX = to.x - dx * ratio;
    const endY = to.y - dy * ratio;

    return `M ${startX},${startY} Q ${midX},${midY} ${endX},${endY}`;
}

// ===== Редактирование ребра =====
function editEdge(edge: Edge) {
    selectedEdge.value = edge;
    showDialog.value = true;
}

function removeEdge(edge: Edge) {
    const index = edges.findIndex(e => e.id === edge.id);
    if (index !== -1) edges.splice(index, 1);
}

const computeEngine = new ComputeEngine()

const create = (amount: number) => new Array<BoxedExpression>(amount).fill(computeEngine.number(0));
const matrix = (rows: number, cols: number) => create(cols).map((o, i) => create(rows))

function createSystem() {
    const results_matrix = matrix(nodes.length, nodes.length)

    edges.forEach((edge) => {
        results_matrix[nodes.indexOf(edge.from)][nodes.indexOf(edge.to)] = computeEngine.parse(edge.label)
    })

    for (let i = 0; i < nodes.length; i++) {
        let diagonal_value = computeEngine.Nothing
        for (let j = 0; j < nodes.length; j++) {
            if (i == j) continue
            const element = results_matrix[i][j];
            diagonal_value = element.add(diagonal_value)
        }
        results_matrix[i][i] = computeEngine.Nothing.sub(diagonal_value)
    }
    formulaStore.formulas.length = 0
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        let equation = computeEngine.Nothing
        for (let j = 0; j < nodes.length; j++) {
            equation = equation.add(results_matrix[j][i].mul(computeEngine.parse(nodes[j].label)))
        }
        formulaStore.formulas.push({
            func: node.label,
            text: equation.toLatex()
        })
    }
    console.log(formulaStore.formulas)
    formulaStore.activeTab = "0"
}

</script>

<style scoped>
svg {
    user-select: none;
}
</style>
